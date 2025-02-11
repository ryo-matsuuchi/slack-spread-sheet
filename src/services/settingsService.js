const { google } = require('googleapis');
const { SettingsError } = require('../utils/errors');

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

class SettingsService {
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
    this.spreadsheetId = process.env.SETTINGS_SPREADSHEET_ID;
    this.sheetName = 'user_settings';

    if (!this.spreadsheetId) {
      throw new Error('SETTINGS_SPREADSHEET_ID environment variable is required');
    }
  }

  /**
   * ユーザー設定を取得する
   * @param {string} userId SlackのユーザーID
   * @returns {Promise<Object|null>} ユーザー設定
   */
  async getUserSettings(userId) {
    try {
      debugLog(`Getting settings for user: ${userId}`);

      // シートからデータを取得
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:E`,
      });

      const rows = response.data.values || [];
      const userRow = rows.find(row => row[0] === userId);

      if (!userRow) {
        debugLog(`No settings found for user: ${userId}`);
        return null;
      }

      // データを整形して返す
      return {
        user_id: userRow[0],
        spreadsheet_id: userRow[1],
        email: userRow[2],
        created_at: userRow[3],
        updated_at: userRow[4]
      };
    } catch (error) {
      errorLog('Error getting user settings:', error);
      throw new SettingsError('設定の取得に失敗しました。', userId);
    }
  }

  /**
   * ユーザー設定を保存する
   * @param {string} userId SlackのユーザーID
   * @param {Object} settings 設定内容
   * @returns {Promise<void>}
   */
  async saveUserSettings(userId, settings) {
    try {
      debugLog(`Saving settings for user: ${userId}`, settings);

      // 既存の設定を確認
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:E`,
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === userId);
      const now = new Date().toISOString();

      if (rowIndex === -1) {
        // 新規追加
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A2:E`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: [[
              userId,
              settings.spreadsheet_id,
              settings.email,
              now,
              now
            ]]
          }
        });
      } else {
        // 更新
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A${rowIndex + 2}:E${rowIndex + 2}`,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[
              userId,
              settings.spreadsheet_id,
              settings.email,
              rows[rowIndex][3] || now,
              now
            ]]
          }
        });
      }

      debugLog(`Settings saved for user: ${userId}`);
    } catch (error) {
      errorLog('Error saving user settings:', error);
      throw new SettingsError('設定の保存に失敗しました。', userId);
    }
  }

  /**
   * スプレッドシートIDを取得する
   * @param {string} userId SlackのユーザーID
   * @returns {Promise<string>} スプレッドシートID
   */
  async getSpreadsheetId(userId) {
    const settings = await this.getUserSettings(userId);
    if (!settings?.spreadsheet_id) {
      throw new SettingsError(
        'スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。',
        userId
      );
    }
    return settings.spreadsheet_id;
  }

  /**
   * メールアドレスを取得する
   * @param {string} userId SlackのユーザーID
   * @returns {Promise<string>} メールアドレス
   */
  async getUserEmail(userId) {
    const settings = await this.getUserSettings(userId);
    if (!settings?.email) {
      throw new SettingsError(
        'メールアドレスの取得に失敗しました。Slack管理者に連絡してください。',
        userId
      );
    }
    return settings.email;
  }

  /**
   * スプレッドシートIDの形式を検証する
   * @param {string} spreadsheetId スプレッドシートID
   * @returns {boolean} 有効な形式かどうか
   */
  isValidSpreadsheetId(spreadsheetId) {
    // スプレッドシートIDの形式を検証
    // - 英数字、ハイフン、アンダースコアのみを含む
    // - 最低20文字以上
    return /^[a-zA-Z0-9-_]{20,}$/.test(spreadsheetId);
  }

  /**
   * メールアドレスの形式を検証する
   * @param {string} email メールアドレス
   * @returns {boolean} 有効な形式かどうか
   */
  isValidEmail(email) {
    return /^[^@]+@[^@]+\.[^@]+$/.test(email);
  }
}

module.exports = new SettingsService();