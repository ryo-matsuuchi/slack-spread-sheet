const { google } = require('googleapis');
const settingsService = require('./settingsService');
const driveService = require('./driveService');

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
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
      throw new Error('GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables are required');
    }

    this.auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * 金額文字列をパースする
   * @param {string} value 金額文字列（例: "¥1,234" or "1234"）
   * @returns {number} パースした金額、失敗時はNaN
   */
  parseAmount(value) {
    if (!value) return NaN;
    const numStr = value.toString().replace(/[¥￥,]/g, '');
    return parseInt(numStr, 10);
  }

  /**
   * 年月文字列をシート名に変換する
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {string} YYYY_MM形式のシート名
   */
  formatSheetName(yearMonth) {
    return yearMonth.replace('-', '_');
  }

  /**
   * シート名を年月文字列に変換する
   * @param {string} sheetName YYYY_MM形式のシート名
   * @returns {string} YYYY-MM形式の年月
   */
  parseSheetName(sheetName) {
    return sheetName.replace('_', '-');
  }

  /**
   * 日付を指定フォーマットに変換する
   * @param {string} date YYYY-MM-DD形式の日付
   * @param {boolean} useSlash trueの場合YYYY/MM/DD形式、falseの場合YYYY-MM-DD形式
   * @returns {string} フォーマットされた日付
   */
  formatDate(date, useSlash = false) {
    if (!date) return '';
    return useSlash ? date.replace(/-/g, '/') : date;
  }

  /**
   * 月次シートを取得または作成する
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {Promise<{sheetId: string, title: string}>} シート情報
   */
  async getOrCreateSheet(userId, yearMonth) {
    try {
      const sheetName = this.formatSheetName(yearMonth);
      debugLog(`Getting/Creating sheet for ${userId}, ${yearMonth} (sheet name: ${sheetName})`);
      const spreadsheetId = await settingsService.getSpreadsheetId(userId);

      // スプレッドシート情報を取得
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      // 既存のシートを検索（新旧両方のフォーマットで）
      const sheets = response.data.sheets;
      const sheet = sheets.find(s => 
        s.properties.title === sheetName || 
        s.properties.title === yearMonth // 旧フォーマット（YYYY-MM）との互換性
      );

      if (sheet) {
        debugLog(`Found existing sheet: ${sheet.properties.title}`);
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
              newSheetName: sheetName
            }
          }]
        }
      });

      const newSheet = result.data.replies[0].duplicateSheet;
      debugLog(`Created new sheet: ${sheetName}`);

      // 初日を設定（YYYY/MM/DD形式）とフォルダリンクを追加
      const firstDay = `${yearMonth}-01`;
      const monthFolder = await driveService.getOrCreateMonthFolder(userId, yearMonth);
      const folderUrl = `https://drive.google.com/drive/folders/${monthFolder}`;

      // D3に初日、G3にフォルダリンクを設定
      await Promise.all([
        this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!D3`,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[this.formatDate(firstDay, true)]]
          }
        }),
        this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!G3`,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[`=HYPERLINK("${folderUrl}", "領収書フォルダ")`]]
          }
        })
      ]);

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
    if (!sheetTitle) {
      throw new Error('シート名が指定されていません。');
    }

    debugLog(`Finding empty row in sheet: ${sheetTitle}`);

    // A列（No）とB-E列を取得
    const [noResponse, dataResponse] = await Promise.all([
      this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetTitle}'!A2:A26`
      }),
      this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetTitle}'!B2:E26`
      })
    ]);

    const noValues = noResponse.data.values || [];
    const dataValues = dataResponse.data.values || [];

    // 2行目から26行目まで検索
    for (let i = 0; i < 25; i++) {
      // A列にNoが入力済みで、B-E列が空の行を探す
      const hasNo = noValues[i]?.[0];
      const row = dataValues[i] || [];
      if (hasNo && row.every(cell => !cell)) {
        return i + 2;  // インデックスは0始まりなので+2
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

      const sheetTitle = sheet.title;
      debugLog(`Using sheet: ${sheetTitle} for adding entry`);

      // 空き行を検索
      const rowNumber = await this.findEmptyRow(spreadsheetId, sheetTitle);

      // データを追加（B-E列）
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetTitle}'!B${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            this.formatDate(date),  // YYYY-MM-DD形式
            amount,
            details || '（内容なし）',
            memo || ''
          ]]
        }
      });

      // 領収書リンクをG列に追加（ある場合のみ）
      if (fileUrl) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetTitle}'!G${rowNumber}`,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[fileUrl]]
          }
        });
      }

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

      // データを取得（合計金額を含む）
      const [entriesResponse, totalResponse] = await Promise.all([
        this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheet.title}!B2:C26`
        }),
        this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheet.title}!C27`
        })
      ]);

      const values = entriesResponse.data.values || [];
      const entries = values
        .filter(row => row[0] && row[1])
        .map(row => ({
          date: row[0],
          amount: this.parseAmount(row[1])
        }))
        .filter(entry => !isNaN(entry.amount));

      // C27から合計金額を取得、取得できない場合は明細から計算
      const total = totalResponse.data.values?.[0]?.[0]
        ? this.parseAmount(totalResponse.data.values[0][0])
        : entries.reduce((sum, entry) => sum + entry.amount, 0);

      return {
        yearMonth,
        count: entries.length,
        total: isNaN(total) ? 0 : total,
        lastUpdate: entries.length > 0 ? entries[entries.length - 1].date : null,
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

      // シートの存在確認と作成
      const sheet = await this.getOrCreateSheet(userId, yearMonth);
      debugLog(`Using sheet: ${sheet.title}`);

      // データを取得（明細と合計金額）
      const [entriesResponse, totalResponse] = await Promise.all([
        this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheet.title}!B2:D26`
        }),
        this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheet.title}!C27`
        })
      ]);

      const values = entriesResponse.data.values || [];
      const entries = values
        .filter(row => row[0] && row[1])
        .map(row => ({
          date: row[0],
          amount: this.parseAmount(row[1]),
          details: row[2] || '（内容なし）'
        }))
        .filter(entry => !isNaN(entry.amount));

      // C27から合計金額を取得、取得できない場合は明細から計算
      const total = totalResponse.data.values?.[0]?.[0]
        ? this.parseAmount(totalResponse.data.values[0][0])
        : entries.reduce((sum, entry) => sum + entry.amount, 0);

      return {
        yearMonth,
        entries,
        total: isNaN(total) ? 0 : total,
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