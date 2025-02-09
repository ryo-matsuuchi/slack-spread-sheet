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

class DriveError extends Error {
  constructor(message, userId, operation) {
    super(message);
    this.name = 'DriveError';
    this.userId = userId;
    this.operation = operation;
  }
}

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
   * フォルダを作成または取得する
   * @param {string} userId ユーザーID
   * @param {string} name フォルダ名
   * @param {string} parentId 親フォルダID
   * @param {boolean} [setPermission=false] 権限を設定するかどうか
   * @returns {Promise<string>} フォルダID
   */
  async ensureFolder(userId, name, parentId, setPermission = false) {
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
      if (setPermission) {
        const userEmail = await settingsService.getUserEmail(userId);
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
      throw new DriveError(
        `フォルダの作成に失敗しました: ${name}`,
        userId,
        'ensureFolder'
      );
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

      // ユーザーフォルダを作成または取得（メールアドレスでの権限設定付き）
      const userFolderId = await this.ensureFolder(
        userId,
        userId,
        this.rootFolderId,
        true // ユーザーフォルダには権限を設定
      );

      // 年月フォルダを作成または取得
      const yearMonthFolderId = await this.ensureFolder(
        userId,
        yearMonth,
        userFolderId,
        false // 年月フォルダは親から権限を継承
      );

      // ファイルをアップロード
      const fileMetadata = {
        name: fileName,
        parents: [yearMonthFolderId],
      };

      const media = {
        mimeType: mimeType,
        body: content,
      };

      debugLog('Creating file in Drive');
      const file = await this.drive.files.create({
        resource: fileMetadata,
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
      throw new DriveError(
        'ファイルのアップロードに失敗しました。',
        userId,
        'uploadFile'
      );
    }
  }
}

module.exports = new DriveService();