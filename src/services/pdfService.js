const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs').promises;

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

class PDFService {
  /**
   * 画像をPDFに変換する
   * @param {Buffer} imageBuffer 画像データ
   * @returns {Promise<Buffer>} PDF形式のバッファ
   */
  async convertImageToPDF(imageBuffer) {
    try {
      debugLog('Converting image to PDF');
      
      // A4サイズの設定（72 DPI）
      const a4Width = 595;
      const a4Height = 842;
      const margin = 40;

      // 画像をリサイズしてPNG形式に変換
      const pngImage = await sharp(imageBuffer)
        .resize(a4Width - (margin * 2), a4Height - (margin * 2), {
          fit: 'inside',
          withoutEnlargement: true
        })
        .png()
        .toBuffer();

      // PDFドキュメントの作成
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([a4Width, a4Height]);

      // 画像の埋め込み
      const image = await pdfDoc.embedPng(pngImage);
      const { width, height } = image.scale(1);

      // 画像をページの中央に配置
      page.drawImage(image, {
        x: (a4Width - width) / 2,
        y: (a4Height - height) / 2,
        width,
        height,
      });

      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
    } catch (error) {
      errorLog('Error converting image to PDF:', error);
      throw new Error('Error converting image to PDF');
    }
  }

  /**
   * PDFファイルを結合する
   * @param {Buffer[]} pdfBuffers PDFのバッファ配列
   * @returns {Promise<Buffer>} 結合したPDFのバッファ
   */
  async mergePDFs(pdfBuffers) {
    try {
      debugLog('Merging PDFs');
      
      // 新しいPDFドキュメントの作成
      const mergedPdf = await PDFDocument.create();

      // 各PDFを結合
      for (const pdfBuffer of pdfBuffers) {
        try {
          const pdf = await PDFDocument.load(pdfBuffer);
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach(page => {
            mergedPdf.addPage(page);
          });
        } catch (error) {
          errorLog('Error copying PDF:', error);
          // 個別のPDFの読み込みエラーはスキップして続行
          continue;
        }
      }

      // ページが存在しない場合はエラー
      if (mergedPdf.getPageCount() === 0) {
        throw new Error('有効なPDFページがありません。');
      }

      const pdfBytes = await mergedPdf.save();
      return Buffer.from(pdfBytes);
    } catch (error) {
      errorLog('Error merging PDFs:', error);
      if (pdfBuffers.length === 0) {
        throw new Error('No PDFs to merge');
      }
      throw new Error('Error merging PDFs');
    }
  }

  /**
   * PDFにページ番号を追加する
   * @param {Buffer} pdfBuffer PDFのバッファ
   * @returns {Promise<Buffer>} ページ番号を追加したPDFのバッファ
   */
  async addPageNumbers(pdfBuffer) {
    try {
      debugLog('Adding page numbers');
      
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      pages.forEach((page, index) => {
        const { width, height } = page.getSize();
        page.drawText(`${index + 1} / ${pages.length}`, {
          x: width - 60,
          y: 30,
          size: 10,
          font: helveticaFont,
          color: rgb(0.5, 0.5, 0.5),
        });
      });

      return await pdfDoc.save();
    } catch (error) {
      errorLog('Error adding page numbers:', error);
      throw new Error('ページ番号の追加に失敗しました。');
    }
  }
}

module.exports = new PDFService();