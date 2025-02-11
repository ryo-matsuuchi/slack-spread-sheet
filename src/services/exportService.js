const { google } = require('googleapis');
const settingsService = require('./settingsService');
const driveService = require('./driveService');
const pdfService = require('./pdfService');
const axios = require('axios');
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

class ExportError extends Error {
  constructor(message, userId, operation) {
    super(message);
    this.name = 'ExportError';
    this.userId = userId;
    this.operation = operation;
  }
}

class ExportService {
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
      [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    );

    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * シートIDを取得する
   * @param {string} spreadsheetId スプレッドシートID
   * @param {string} sheetName シート名
   * @returns {Promise<string>} シートID
   */
  async getSheetId(spreadsheetId, sheetName) {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
        fields: 'sheets.properties'
      });

      const sheet = response.data.sheets.find(
        s => s.properties.title === sheetName
      );

      if (!sheet) {
        throw new Error(`シート "${sheetName}" が見つかりません。`);
      }

      return sheet.properties.sheetId.toString();
    } catch (error) {
      errorLog('Error getting sheet ID:', error);
      throw new Error('シートIDの取得に失敗しました。');
    }
  }

  /**
   * スプレッドシートをPDFとしてエクスポート
   * @param {string} spreadsheetId スプレッドシートID
   * @param {string} sheetName シート名
   * @returns {Promise<Buffer>} PDFのバッファ
   */
  async exportSheetToPDF(spreadsheetId, sheetName) {
    try {
      debugLog(`Exporting sheet to PDF: ${sheetName}`);

      // シートIDの取得
      const sheetId = await this.getSheetId(spreadsheetId, sheetName);

      // PDFエクスポートのURLを構築
      const token = await this.auth.getAccessToken();
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`;
      const params = new URLSearchParams({
        format: 'pdf',
        gid: sheetId,
        size: 'A4',
        portrait: 'true',
        fitw: 'true',
        scale: '4', // スケールを調整して1ページに収める
        gridlines: 'false',
        printtitle: 'false',
        top_margin: '0.25', // マージンを小さくする
        bottom_margin: '0.25',
        left_margin: '0.25',
        right_margin: '0.25',
        sheetnames: 'false',
        range: `${sheetName}!A1:E`,  // G列以降を除外
        fzr: 'false', // 行を固定しない
        fzc: 'false', // 列を固定しない
        pagenum: 'false', // ページ番号を表示しない
      });

      // PDFをダウンロード
      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token.token}`,
        },
        responseType: 'arraybuffer'
      });

      return Buffer.from(response.data);
    } catch (error) {
      errorLog('Error exporting sheet to PDF:', error);
      throw new Error('スプレッドシートのPDFエクスポートに失敗しました。');
    }
  }

  /**
   * 指定月の領収書を取得
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {Promise<{fileId: string, name: string, mimeType: string, webViewLink: string}[]>}
   */
  async getMonthlyReceipts(userId, yearMonth) {
    try {
      debugLog(`Getting receipts for ${yearMonth}`);
      const folderId = await driveService.getOrCreateMonthFolder(userId, yearMonth);
      
      // 経費精算書PDFを除外して領収書のみを取得
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and name != '経費精算書_${yearMonth}.pdf' and trashed = false`,
        fields: 'files(id, name, mimeType, webViewLink)',
        orderBy: 'name',
      });

      return response.data.files;
    } catch (error) {
      errorLog('Error getting monthly receipts:', error);
      throw new Error('領収書の取得に失敗しました。');
    }
  }

  /**
   * 領収書ファイルをダウンロード
   * @param {string} fileId ファイルID
   * @returns {Promise<Buffer>} ファイルのバッファ
   */
  async downloadReceipt(fileId) {
    try {
      debugLog(`Downloading receipt: ${fileId}`);
      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, {
        responseType: 'arraybuffer'
      });

      return Buffer.from(response.data);
    } catch (error) {
      errorLog('Error downloading receipt:', error);
      throw new Error('領収書のダウンロードに失敗しました。');
    }
  }

  /**
   * 経費精算書をPDFとしてエクスポート
   * @param {string} userId ユーザーID
   * @param {string} yearMonth YYYY-MM形式の年月
   * @returns {Promise<{pdfBuffer: Buffer, fileUrl: string}>}
   */
  async exportExpenseReport(userId, yearMonth) {
    try {
      debugLog(`Exporting expense report for ${yearMonth}`);

      // スプレッドシートIDの取得
      const spreadsheetId = await settingsService.getSpreadsheetId(userId);
      const sheetName = yearMonth.replace('-', '_');

      // スプレッドシートをPDFに変換
      const sheetPdf = await this.exportSheetToPDF(spreadsheetId, sheetName);

      // 領収書の取得と変換
      const receipts = await this.getMonthlyReceipts(userId, yearMonth);
      const receiptPdfs = [];

      for (const receipt of receipts) {
        const fileBuffer = await this.downloadReceipt(receipt.id);
        let pdfBuffer;

        if (receipt.mimeType === 'application/pdf') {
          pdfBuffer = fileBuffer;
        } else {
          pdfBuffer = await pdfService.convertImageToPDF(fileBuffer);
        }

        receiptPdfs.push(pdfBuffer);
      }

      // PDFの結合
      const allPdfs = [sheetPdf, ...receiptPdfs];
      const mergedPdf = await pdfService.mergePDFs(allPdfs);

      // 結合したPDFを保存
      const folderId = await driveService.getOrCreateMonthFolder(userId, yearMonth);
      const fileName = `経費精算書_${yearMonth}.pdf`;

      // 既存のPDFファイルを検索
      debugLog(`Searching for existing PDF: ${fileName}`);
      const existingFiles = await this.drive.files.list({
        q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)'
      });

      // 既存のファイルを削除
      if (existingFiles.data.files.length > 0) {
        debugLog(`Found ${existingFiles.data.files.length} existing PDF files`);
        for (const file of existingFiles.data.files) {
          debugLog(`Deleting file: ${file.id}`);
          await this.drive.files.delete({
            fileId: file.id
          });
        }
      }

      // ストリームの作成
      const stream = new Readable();
      stream.push(mergedPdf);
      stream.push(null);

      const file = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
          mimeType: 'application/pdf',
        },
        media: {
          mimeType: 'application/pdf',
          body: stream,
        },
      });

      // 共有リンクの取得
      const fileUrl = `https://drive.google.com/file/d/${file.data.id}/view`;

      return {
        pdfBuffer: mergedPdf,
        fileUrl: fileUrl
      };
    } catch (error) {
      errorLog('Error exporting expense report:', error);
      throw new ExportError(
        'PDFのエクスポートに失敗しました。',
        userId,
        'exportExpenseReport'
      );
    }
  }
}

module.exports = new ExportService();