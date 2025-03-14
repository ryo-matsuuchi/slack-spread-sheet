const { google } = require('googleapis');
const settingsService = require('./settingsService');
const { Readable } = require('stream');
const { OperationError } = require('../utils/errors');

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
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
      throw new Error('GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables are required');
    }

    this.auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
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
      throw new OperationError(
        `フォルダの作成に失敗しました: ${name}`,
        userId,
        'ensureFolder'
      );
    }
  }

  /**
   * 年月フォルダを取得または作成する
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {Promise<string>} フォルダID
   */
  async getOrCreateMonthFolder(userId, yearMonth) {
    try {
      debugLog(`Getting/Creating month folder for user: ${userId}, month: ${yearMonth}`);

      // ユーザーフォルダを作成または取得（メールアドレスでの権限設定付き）
      const userFolderId = await this.ensureFolder(
        userId,
        userId,
        this.rootFolderId,
        true // ユーザーフォルダには権限を設定
      );

      // 年月フォルダを作成または取得
      const monthFolderId = await this.ensureFolder(
        userId,
        yearMonth,
        userFolderId,
        false // 年月フォルダは親から権限を継承
      );

      return monthFolderId;
    } catch (error) {
      errorLog('Get/Create month folder error:', error);
      throw new OperationError(
        '年月フォルダの取得/作成に失敗しました。',
        userId,
        'getOrCreateMonthFolder'
      );
    }
  }

  /**
   * 指定したフォルダ内の特定のファイルを検索して削除する
   * @param {string} folderId フォルダID
   * @param {string} fileName ファイル名
   * @returns {Promise<void>}
   */
  async deleteFileByName(folderId, fileName) {
    try {
      debugLog(`Searching for file: ${fileName} in folder: ${folderId}`);
      
      // ファイルを検索
      const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id)',
        spaces: 'drive',
      });

      // 既存のファイルを削除
      for (const file of response.data.files) {
        debugLog(`Deleting file: ${file.id}`);
        await this.drive.files.delete({
          fileId: file.id
        });
      }
    } catch (error) {
      errorLog('Delete file error:', error);
      throw new OperationError(
        'ファイルの削除に失敗しました。',
        null,
        'deleteFileByName'
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

      // 年月フォルダを取得または作成
      const monthFolderId = await this.getOrCreateMonthFolder(userId, yearMonth);

      // 同名のファイルが存在する場合は削除
      await this.deleteFileByName(monthFolderId, fileName);

      // ファイルをアップロード
      const fileMetadata = {
        name: fileName,
        parents: [monthFolderId],
      };

      // BufferをReadableストリームに変換
      const stream = new Readable();
      stream.push(content);
      stream.push(null);

      const media = {
        mimeType: mimeType,
        body: stream,
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
      throw new OperationError(
        'ファイルのアップロードに失敗しました。',
        userId,
        'uploadFile'
      );
    }
  }
}

module.exports = new DriveService();