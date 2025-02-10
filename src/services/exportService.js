const { google } = require('googleapis');
const settingsService = require('./settingsService');
const driveService = require('./driveService');
const pdfService = require('./pdfService');
const axios = require('axios');

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
   * スプレッドシートをPDFとしてエクスポート
   * @param {string} spreadsheetId スプレッドシートID
   * @param {string} sheetName シート名
   * @returns {Promise<Buffer>} PDFのバッファ
   */
  async exportSheetToPDF(spreadsheetId, sheetName) {
    try {
      debugLog(`Exporting sheet to PDF: ${sheetName}`);

      // スプレッドシートの情報を取得
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      // シートの存在確認
      const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
      if (!sheet) {
        throw new Error(`シート "${sheetName}" が見つかりません。`);
      }

      // PDFエクスポートのURLを構築
      const token = await this.auth.getAccessToken();
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`;
      const params = new URLSearchParams({
        format: 'pdf',
        gid: sheet.properties.sheetId,
        size: 'A4',
        portrait: 'true',
        fitw: 'true',
        gridlines: 'false',
        printtitle: 'false',
        top_margin: '0.5',
        bottom_margin: '0.5',
        left_margin: '0.5',
        right_margin: '0.5',
        sheetnames: 'false',
        range: `${sheetName}!A1:E27`
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
      
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
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
      const bookmarks = [{ title: '経費精算書', pageNumber: 1 }];
      let pageNumber = 2;

      for (const receipt of receipts) {
        const fileBuffer = await this.downloadReceipt(receipt.id);
        let pdfBuffer;

        if (receipt.mimeType === 'application/pdf') {
          pdfBuffer = fileBuffer;
        } else {
          pdfBuffer = await pdfService.convertImageToPDF(fileBuffer);
        }

        receiptPdfs.push(pdfBuffer);
        bookmarks.push({
          title: `領収書: ${receipt.name}`,
          pageNumber: pageNumber++
        });
      }

      // PDFの結合
      const allPdfs = [sheetPdf, ...receiptPdfs];
      const mergedPdf = await pdfService.mergePDFs(allPdfs, bookmarks);

      // 結合したPDFを保存
      const folderId = await driveService.getOrCreateMonthFolder(userId, yearMonth);
      const fileName = `経費精算書_${yearMonth}.pdf`;

      const file = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
          mimeType: 'application/pdf',
        },
        media: {
          mimeType: 'application/pdf',
          body: mergedPdf,
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