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

      // 画像をリサイズ
      const image = await sharp(imageBuffer)
        .resize(a4Width - (margin * 2), a4Height - (margin * 2), {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toBuffer();

      // PDFドキュメントの作成
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([a4Width, a4Height]);

      // 画像の埋め込み
      const pdfImage = await pdfDoc.embedJpeg(image);
      const { width, height } = pdfImage.scale(1);

      // 画像をページの中央に配置
      page.drawImage(pdfImage, {
        x: (a4Width - width) / 2,
        y: (a4Height - height) / 2,
        width,
        height,
      });

      return await pdfDoc.save();
    } catch (error) {
      errorLog('Error converting image to PDF:', error);
      throw new Error('画像のPDF変換に失敗しました。');
    }
  }

  /**
   * PDFファイルを結合する
   * @param {Buffer[]} pdfBuffers PDFのバッファ配列
   * @param {Object[]} bookmarks しおり情報の配列 [{title: string, pageNumber: number}]
   * @returns {Promise<Buffer>} 結合したPDFのバッファ
   */
  async mergePDFs(pdfBuffers, bookmarks = []) {
    try {
      debugLog('Merging PDFs');
      
      // 新しいPDFドキュメントの作成
      const mergedPdf = await PDFDocument.create();
      const helveticaFont = await mergedPdf.embedFont(StandardFonts.Helvetica);

      // 各PDFを結合
      const pageRefs = [];
      for (const pdfBuffer of pdfBuffers) {
        try {
          const pdf = await PDFDocument.load(pdfBuffer);
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach(page => {
            pageRefs.push(mergedPdf.addPage(page));
          });
        } catch (error) {
          errorLog('Error copying PDF:', error);
          // 個別のPDFの読み込みエラーはスキップして続行
          continue;
        }
      }

      // ページ番号の追加
      if (pageRefs.length === 0) {
        throw new Error('有効なPDFページがありません。');
      }

      pageRefs.forEach((page, index) => {
        const { width, height } = page.getSize();
        page.drawText(`${index + 1} / ${pageRefs.length}`, {
          x: width - 60,
          y: 30,
          size: 10,
          font: helveticaFont,
          color: rgb(0.5, 0.5, 0.5),
        });
      });

      // しおりの追加
      if (bookmarks.length > 0) {
        try {
          debugLog('Adding bookmarks');
          
          // アウトラインツリーの作成
          const outlines = mergedPdf.context.obj({});
          mergedPdf.catalog.set(mergedPdf.context.obj('Outlines'), outlines);

          // しおりの追加
          let lastOutline = null;
          for (const { title, pageNumber } of bookmarks) {
            if (pageNumber > 0 && pageNumber <= pageRefs.length) {
              const page = pageRefs[pageNumber - 1];
              const outline = mergedPdf.context.obj({
                Title: title,
                Parent: outlines,
                Dest: [page.ref, 'XYZ', null, page.getHeight(), null],
              });

              if (!lastOutline) {
                outlines.set('First', outline);
              } else {
                lastOutline.set('Next', outline);
                outline.set('Prev', lastOutline);
              }

              lastOutline = outline;
            }
          }

          if (lastOutline) {
            outlines.set('Last', lastOutline);
          }

          // アウトラインのカウントを設定
          outlines.set('Count', bookmarks.length);
        } catch (error) {
          errorLog('Error adding bookmarks:', error);
          // しおりの追加に失敗しても、PDFの結合自体は続行
        }
      }

      return await mergedPdf.save();
    } catch (error) {
      errorLog('Error merging PDFs:', error);
      throw new Error('PDFの結合に失敗しました。');
    }
  }

  /**
   * PDFにしおりを追加する
   * @param {Buffer} pdfBuffer PDFのバッファ
   * @param {Object[]} bookmarks しおり情報の配列 [{title: string, pageNumber: number}]
   * @returns {Promise<Buffer>} しおりを追加したPDFのバッファ
   */
  async addBookmarks(pdfBuffer, bookmarks) {
    try {
      debugLog('Adding bookmarks');
      
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();

      if (bookmarks.length > 0) {
        try {
          // アウトラインツリーの作成
          const outlines = pdfDoc.context.obj({});
          pdfDoc.catalog.set(pdfDoc.context.obj('Outlines'), outlines);

          // しおりの追加
          let lastOutline = null;
          for (const { title, pageNumber } of bookmarks) {
            if (pageNumber > 0 && pageNumber <= pages.length) {
              const page = pages[pageNumber - 1];
              const outline = pdfDoc.context.obj({
                Title: title,
                Parent: outlines,
                Dest: [page.ref, 'XYZ', null, page.getHeight(), null],
              });

              if (!lastOutline) {
                outlines.set('First', outline);
              } else {
                lastOutline.set('Next', outline);
                outline.set('Prev', lastOutline);
              }

              lastOutline = outline;
            }
          }

          if (lastOutline) {
            outlines.set('Last', lastOutline);
          }

          // アウトラインのカウントを設定
          outlines.set('Count', bookmarks.length);
        } catch (error) {
          errorLog('Error adding bookmarks:', error);
          throw new Error('しおりの追加に失敗しました。');
        }
      }

      return await pdfDoc.save();
    } catch (error) {
      errorLog('Error adding bookmarks:', error);
      throw new Error('しおりの追加に失敗しました。');
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