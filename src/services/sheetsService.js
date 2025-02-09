const { google } = require('googleapis');
const settingsService = require('./settingsService');

// デバッグログの設定
const debugLog = (message, ...args) => {
  console.log(`[DEBUG] ${message}`, ...args);
};

// エラーログの設定
const errorLog = (message, error) => {
  console.error(`[ERROR] ${message}`, error);
  if (error.stack) {
    console.error(error.stack);
  }
};

class SheetsError extends Error {
  constructor(message, userId, operation) {
    super(message);
    this.name = 'SheetsError';
    this.userId = userId;
    this.operation = operation;
  }
}

class SheetsService {
  constructor() {
    const credentials = require('../../credentials/slack-keihi-app-ce3078b9ae32.json');
    this.auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * 月次シートを取得または作成する
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {Promise<{sheetId: string, title: string}>} シート情報
   */
  async getOrCreateSheet(userId, yearMonth) {
    try {
      debugLog(`Getting/Creating sheet for ${userId}, ${yearMonth}`);
      const spreadsheetId = await settingsService.getSpreadsheetId(userId);

      // スプレッドシート情報を取得
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      // 既存のシートを検索
      const sheets = response.data.sheets;
      const sheet = sheets.find(s => s.properties.title === yearMonth);

      if (sheet) {
        debugLog(`Found existing sheet: ${yearMonth}`);
        return {
          sheetId: sheet.properties.sheetId,
          title: sheet.properties.title
        };
      }

      // _baseシートを複製して新しいシートを作成
      debugLog('Creating new sheet from _base');
      const baseSheet = sheets.find(s => s.properties.title === '_base');
      if (!baseSheet) {
        throw new SheetsError('_baseシートが見つかりません。', userId, 'getOrCreateSheet');
      }

      const result = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            duplicateSheet: {
              sourceSheetId: baseSheet.properties.sheetId,
              insertSheetIndex: sheets.length,
              newSheetName: yearMonth
            }
          }]
        }
      });

      const newSheet = result.data.replies[0].duplicateSheet;
      debugLog(`Created new sheet: ${yearMonth}`);

      // 初日を設定
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${yearMonth}!D3`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[`${yearMonth}-01`]]
        }
      });

      return {
        sheetId: newSheet.sheetId,
        title: newSheet.title
      };
    } catch (error) {
      errorLog('Error in getOrCreateSheet:', error);
      throw new SheetsError(
        'シートの取得/作成に失敗しました。',
        userId,
        'getOrCreateSheet'
      );
    }
  }

  /**
   * 空き行を検索する
   * @param {string} spreadsheetId スプレッドシートID
   * @param {string} sheetTitle シート名
   * @returns {Promise<number>} 空き行の行番号
   */
  async findEmptyRow(spreadsheetId, sheetTitle) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!B2:E26`
    });

    const values = response.data.values || [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!row || row.every(cell => !cell)) {
        return i + 2;
      }
    }

    throw new Error('空き行がありません。');
  }

  /**
   * エントリーを追加する
   * @param {Object} params パラメータ
   * @param {string} params.userId ユーザーID
   * @param {string} params.date 日付（YYYY-MM-DD形式）
   * @param {number} params.amount 金額
   * @param {string} params.details 内容
   * @param {string} params.memo メモ
   * @param {string} [params.fileUrl] 領収書URL
   * @returns {Promise<{success: boolean, message: string, sheetUrl: string}>}
   */
  async addEntry({ userId, date, amount, details, memo, fileUrl = '' }) {
    try {
      debugLog(`Adding entry for user: ${userId}`);
      const spreadsheetId = await settingsService.getSpreadsheetId(userId);

      // 年月を取得（YYYY-MM）
      const yearMonth = date.substring(0, 7);

      // シートを取得または作成
      const sheet = await this.getOrCreateSheet(userId, yearMonth);

      // 空き行を検索
      const rowNumber = await this.findEmptyRow(spreadsheetId, sheet.title);

      // データを追加
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheet.title}!B${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            date,
            amount,
            details || '（内容なし）',
            fileUrl ? `${memo || ''}\n${fileUrl}` : (memo || '')
          ]]
        }
      });

      debugLog('Entry added successfully');
      return {
        success: true,
        message: '経費を登録しました。',
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheet.sheetId}`
      };
    } catch (error) {
      errorLog('Error adding entry:', error);
      throw new SheetsError(
        error.message || 'エントリーの追加に失敗しました。',
        userId,
        'addEntry'
      );
    }
  }

  /**
   * ステータスを取得する
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {Promise<Object>} ステータス情報
   */
  async getStatus(userId, yearMonth) {
    try {
      debugLog(`Getting status for user: ${userId}, month: ${yearMonth}`);
      const spreadsheetId = await settingsService.getSpreadsheetId(userId);

      // シートの存在確認
      const sheet = await this.getOrCreateSheet(userId, yearMonth);

      // データを取得
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheet.title}!B2:C26`
      });

      const values = response.data.values || [];
      const entries = values.filter(row => row[0] && row[1]);
      const total = entries.reduce((sum, row) => sum + parseInt(row[1], 10), 0);

      return {
        yearMonth,
        count: entries.length,
        total,
        lastUpdate: entries.length > 0 ? entries[entries.length - 1][0] : null,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheet.sheetId}`
      };
    } catch (error) {
      errorLog('Error getting status:', error);
      throw new SheetsError(
        'ステータスの取得に失敗しました。',
        userId,
        'getStatus'
      );
    }
  }

  /**
   * 一覧を取得する
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {Promise<Object>} 一覧情報
   */
  async getList(userId, yearMonth) {
    try {
      debugLog(`Getting list for user: ${userId}, month: ${yearMonth}`);
      const spreadsheetId = await settingsService.getSpreadsheetId(userId);

      // シートの存在確認
      const sheet = await this.getOrCreateSheet(userId, yearMonth);

      // データを取得
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheet.title}!B2:D26`
      });

      const values = response.data.values || [];
      const entries = values
        .filter(row => row[0] && row[1])
        .map(row => ({
          date: row[0],
          amount: parseInt(row[1], 10),
          details: row[2] || '（内容なし）'
        }));

      return {
        yearMonth,
        entries,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheet.sheetId}`
      };
    } catch (error) {
      errorLog('Error getting list:', error);
      throw new SheetsError(
        '一覧の取得に失敗しました。',
        userId,
        'getList'
      );
    }
  }
}

module.exports = new SheetsService();