const { google } = require('googleapis');
const path = require('path');

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
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!this.spreadsheetId) {
      throw new Error('GOOGLE_SPREADSHEET_ID environment variable is required');
    }
  }

  /**
   * シート名を生成する
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {string} シート名（例：2025_02）
   */
  getSheetName(yearMonth) {
    const [year, month] = yearMonth.split('-');
    return `${year}_${month.padStart(2, '0')}`;
  }

  /**
   * 対象月の初日を生成する
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {string} YYYY/MM/DD形式の日付
   */
  getFirstDayOfMonth(yearMonth) {
    const [year, month] = yearMonth.split('-');
    return `${year}/${month.padStart(2, '0')}/01`;
  }

  /**
   * シートを取得または作成する
   * @param {string} sheetName シート名
   * @returns {Promise<{sheetId: string, sheetUrl: string}>} シート情報
   */
  async ensureSheet(sheetName) {
    try {
      console.log(`Ensuring sheet exists: ${sheetName}`);

      // シート一覧を取得
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      console.log('Retrieved spreadsheet info:', JSON.stringify(response.data, null, 2));

      // 既存のシートを探す
      const sheet = response.data.sheets.find(
        s => s.properties.title === sheetName
      );

      if (sheet) {
        console.log(`Found existing sheet: ${sheetName}, ID: ${sheet.properties.sheetId}`);
        return {
          sheetId: sheet.properties.sheetId.toString(),
          sheetUrl: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit#gid=${sheet.properties.sheetId}`,
        };
      }

      // _baseシートを探す
      const baseSheet = response.data.sheets.find(
        s => s.properties.title === '_base'
      );

      if (!baseSheet) {
        console.error('Base sheet not found');
        throw new Error('_baseシートが見つかりません');
      }

      console.log(`Found base sheet, ID: ${baseSheet.properties.sheetId}`);

      // シートを複製
      console.log(`Duplicating base sheet to create: ${sheetName}`);
      const result = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [
            {
              duplicateSheet: {
                sourceSheetId: baseSheet.properties.sheetId,
                insertSheetIndex: response.data.sheets.length,
                newSheetName: sheetName,
              },
            },
          ],
        },
      });

      console.log('Duplicate sheet result:', JSON.stringify(result.data, null, 2));

      const newSheetId = result.data.replies[0].duplicateSheet.properties.sheetId.toString();
      console.log(`Created new sheet: ${sheetName}, ID: ${newSheetId}`);

      // 対象月の初日を設定
      const yearMonth = sheetName.replace('_', '-');
      const firstDay = this.getFirstDayOfMonth(yearMonth);
      console.log(`Setting first day of month: ${firstDay} in cell D3`);

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!D3`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[firstDay]],
        },
      });

      console.log('Successfully set first day of month');

      return {
        sheetId: newSheetId,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit#gid=${newSheetId}`,
      };
    } catch (error) {
      console.error('Ensure sheet error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
      throw new Error(`シートの作成に失敗しました: ${sheetName} (${error.message})`);
    }
  }

  /**
   * 空の行を探す
   * @param {string} sheetName シート名
   * @returns {Promise<number>} 行番号（1から始まる）
   */
  async findEmptyRow(sheetName) {
    try {
      console.log(`Finding empty row in sheet: ${sheetName}`);

      // A2:E26の範囲を取得（Noを含む）
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:E26`,
      });

      const values = response.data.values || [];
      console.log('Retrieved values:', JSON.stringify(values, null, 2));
      
      // B列〜E列がすべて空の行を探す（A列にNoが存在する行のみ）
      for (let i = 0; i < values.length; i++) {
        const row = values[i] || [];
        if (row[0] && // A列（No）が存在する
            (!row[1] && !row[2] && !row[3] && !row[4])) { // B〜E列がすべて空
          const rowNumber = i + 2;
          console.log(`Found empty row: ${rowNumber}`);
          return rowNumber;
        }
      }

      console.log('No empty row found');
      return -1;
    } catch (error) {
      console.error('Find empty row error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
      throw new Error('空の行の検索に失敗しました');
    }
  }

  /**
   * 経費情報を追加する
   * @param {Object} entry 経費情報
   * @param {string} entry.userId ユーザーID
   * @param {string} entry.date 日付（YYYY-MM-DD）
   * @param {number} entry.amount 金額
   * @param {string} entry.details 内容
   * @param {string} entry.memo メモ
   * @param {string} entry.fileUrl ファイルURL
   * @returns {Promise<{success: boolean, message: string, sheetUrl: string}>} 処理結果
   */
  async addEntry(entry) {
    try {
      console.log('Adding entry:', JSON.stringify(entry, null, 2));

      // シート名を生成（YYYY-MM-DDから年月を抽出）
      const yearMonth = entry.date.substring(0, 7);
      const sheetName = this.getSheetName(yearMonth);
      console.log(`Generated sheet name: ${sheetName}`);

      // シートを取得または作成
      const sheetInfo = await this.ensureSheet(sheetName);
      console.log('Sheet info:', JSON.stringify(sheetInfo, null, 2));

      // 空の行を探す
      const rowNumber = await this.findEmptyRow(sheetName);
      console.log(`Found row number: ${rowNumber}`);

      // 27行目以降の場合
      if (rowNumber === -1) {
        console.log('No empty row available');
        return {
          success: false,
          message: '経費精算書の空き行がありません。新しいシートを作成してください。',
          sheetUrl: sheetInfo.sheetUrl,
        };
      }

      // データを更新（B列から入力）
      console.log(`Updating data in row: ${rowNumber}`);
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!B${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            entry.date,
            entry.amount,
            entry.details,
            entry.fileUrl ? `${entry.memo || ''}\n${entry.fileUrl}` : (entry.memo || ''),
          ]],
        },
      });

      console.log('Successfully updated data');
      return {
        success: true,
        message: '経費精算書に追加しました。',
        sheetUrl: sheetInfo.sheetUrl,
      };
    } catch (error) {
      console.error('Add entry error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
      throw new Error('経費精算書への追加に失敗しました');
    }
  }
}

module.exports = new SheetsService();