const { google } = require('googleapis');
const path = require('path');
const { Readable } = require('stream');

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

class DriveService {
  constructor() {
    const credentials = require('../../credentials/slack-keihi-app-ce3078b9ae32.json');
    this.auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive']
    );
    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

    if (!this.rootFolderId) {
      throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID environment variable is required');
    }
  }

  /**
   * ユーザーのメールアドレスを取得する
   * @param {string} userId SlackのユーザーID
   * @returns {Promise<string>} メールアドレス
   */
  async getUserEmail(userId) {
    try {
      // SlackのWeb APIクライアントを初期化
      const { WebClient } = require('@slack/web-api');
      const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

      // ユーザー情報を取得
      const result = await slack.users.info({
        user: userId
      });

      if (!result.ok || !result.user.profile.email) {
        throw new Error('Failed to get user email');
      }

      return result.user.profile.email;
    } catch (error) {
      errorLog('Get user email error:', error);
      throw new Error('ユーザーのメールアドレス取得に失敗しました');
    }
  }

  /**
   * フォルダを作成または取得する
   * @param {string} name フォルダ名
   * @param {string} parentId 親フォルダID
   * @param {string} [userEmail] ユーザーのメールアドレス（ユーザーフォルダの場合のみ）
   * @returns {Promise<string>} フォルダID
   */
  async ensureFolder(name, parentId, userEmail = null) {
    try {
      debugLog(`Ensuring folder: ${name} in ${parentId}`);

      // 既存のフォルダを検索
      const query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id)',
        spaces: 'drive',
      });

      // 既存のフォルダが見つかった場合
      if (response.data.files.length > 0) {
        debugLog(`Found existing folder: ${response.data.files[0].id}`);
        return response.data.files[0].id;
      }

      // フォルダを作成
      debugLog('Creating new folder');
      const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      };

      const file = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
      });

      const folderId = file.data.id;
      debugLog(`Created new folder: ${folderId}`);

      // ユーザーフォルダの場合、アクセス権限を設定
      if (userEmail) {
        debugLog(`Setting permission for user: ${userEmail}`);
        await this.drive.permissions.create({
          fileId: folderId,
          requestBody: {
            role: 'reader',
            type: 'user',
            emailAddress: userEmail,
          },
        });
      }

      return folderId;
    } catch (error) {
      errorLog('Ensure folder error:', error);
      throw new Error(`フォルダの作成に失敗しました: ${name}`);
    }
  }

  /**
   * ファイルをアップロードする
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @param {Buffer} content ファイルの内容
   * @param {string} fileName ファイル名
   * @param {string} mimeType MIMEタイプ
   * @returns {Promise<{id: string, webViewLink: string}>} ファイル情報
   */
  async uploadFile(userId, yearMonth, content, fileName, mimeType) {
    try {
      debugLog(`Uploading file: ${fileName} for user: ${userId} in: ${yearMonth}`);

      // ユーザーのメールアドレスを取得
      const userEmail = await this.getUserEmail(userId);

      // ユーザーフォルダを作成または取得（メールアドレスでの権限設定付き）
      const userFolderId = await this.ensureFolder(userId, this.rootFolderId, userEmail);

      // 年月フォルダを作成または取得
      const yearMonthFolderId = await this.ensureFolder(yearMonth, userFolderId);

      // ファイルをアップロード
      const fileMetadata = {
        name: fileName,
        parents: [yearMonthFolderId],
      };

      // Bufferからストリームを作成
      const stream = new Readable();
      stream.push(content);
      stream.push(null);

      const media = {
        mimeType: mimeType,
        body: stream,
      };

      debugLog('Creating file in Drive');
      const file = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
      });

      debugLog('File uploaded successfully');
      return {
        id: file.data.id,
        webViewLink: file.data.webViewLink,
      };
    } catch (error) {
      errorLog('Upload file error:', error);
      throw new Error('ファイルのアップロードに失敗しました');
    }
  }
}

module.exports = new DriveService();