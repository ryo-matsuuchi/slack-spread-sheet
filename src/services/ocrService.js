const vision = require('@google-cloud/vision');
const config = require('../config/config');
const fileManager = require('../utils/fileManager');

class OCRService {
  constructor() {
    this.client = new vision.ImageAnnotatorClient({
      projectId: config.google.projectId,
      keyFilename: config.google.credentials,
    });
  }

  /**
   * テキスト抽出を実行
   * @param {Buffer|string} image - 画像データまたはファイルパス
   * @returns {Promise<{text: string, amount: number, date: string, details: string}>}
   */
  async extractText(image) {
    let tempFilePath = null;
    try {
      // Bufferの場合は一時ファイルとして保存
      if (Buffer.isBuffer(image)) {
        tempFilePath = await fileManager.saveTempFile(image, '.png');
        image = tempFilePath;
      }

      // ファイルサイズチェック
      if (config.glitch.isGlitch) {
        await fileManager.checkFileSize(image);
      }

      const [result] = await this.client.documentTextDetection(image);
      const fullText = result.fullTextAnnotation.text;
      const parsedResult = this.parseReceipt(fullText);

      // 一時ファイルの削除
      if (tempFilePath) {
        await fileManager.deleteTempFile(tempFilePath);
      }

      return parsedResult;
    } catch (error) {
      // エラー発生時も一時ファイルを削除
      if (tempFilePath) {
        await fileManager.deleteTempFile(tempFilePath).catch(console.error);
      }
      console.error('OCR Error:', error);
      throw new Error('領収書の読み取りに失敗しました');
    }
  }

  /**
   * 抽出したテキストから必要な情報をパース
   * @param {string} text - 抽出されたテキスト
   * @returns {{text: string, amount: number, date: string, details: string}}
   */
  parseReceipt(text) {
    const lines = text.split('\n');
    const result = {
      text: text,
      amount: null,
      date: null,
      details: '',
    };

    // 金額の検出
    // 一般的な金額パターン: ¥1,234 or 1,234円 or ￥1,234
    const amountPattern = /[¥￥][\d,]+|[\d,]+円/g;
    const amounts = text.match(amountPattern);
    if (amounts) {
      // 最も大きい金額を取得（通常、合計金額が最大）
      const parsedAmounts = amounts.map(amount => 
        parseInt(amount.replace(/[¥￥円,]/g, ''))
      );
      result.amount = Math.max(...parsedAmounts);
    }

    // 日付の検出
    // YYYY/MM/DD, YYYY年MM月DD日, MM/DD/YYYY などの形式に対応
    const datePatterns = [
      /(\d{4})[年/](\d{1,2})[月/](\d{1,2})[日]?/,
      /(\d{1,2})[/月](\d{1,2})[/日]?,?\s*(\d{4})/,
    ];

    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          // 日付形式の正規化
          const [year, month, day] = pattern === datePatterns[0] 
            ? [match[1], match[2], match[3]]
            : [match[3], match[1], match[2]];
          result.date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          break;
        }
      }
      if (result.date) break;
    }

    // 詳細情報の抽出
    // 店舗名や商品名などの特徴的な行を検出
    const detailsLines = lines.filter(line => {
      // 金額や日付以外の意味のある行を抽出
      return line.length > 3 && 
             !line.match(amountPattern) &&
             !datePatterns.some(pattern => line.match(pattern));
    });

    result.details = detailsLines.join('\n');

    return result;
  }

  /**
   * PDFの各ページを個別に処理
   * @param {Buffer} pdfBuffer - PDFファイルのバッファ
   * @returns {Promise<Array>} 各ページの処理結果
   */
  async processPdfPages(pdfBuffer) {
    let tempFilePath = null;
    try {
      tempFilePath = await fileManager.saveTempFile(pdfBuffer, '.pdf');
      // TODO: PDFの各ページを画像に変換し、個別に処理
      throw new Error('PDF処理は未実装です');
    } finally {
      if (tempFilePath) {
        await fileManager.deleteTempFile(tempFilePath).catch(console.error);
      }
    }
  }

  /**
   * 複数ファイルの一括処理
   * @param {Array<{buffer: Buffer, type: string}>} files - 処理対象ファイル
   * @returns {Promise<Array>} 処理結果の配列
   */
  async processMultipleFiles(files) {
    const results = [];
    const batchSize = config.processing.batchSize;
    
    // バッチ処理
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map(async file => {
        if (file.type.startsWith('image/')) {
          return this.extractText(file.buffer);
        } else if (file.type === 'application/pdf') {
          return this.processPdfPages(file.buffer);
        } else {
          throw new Error(`未対応のファイル形式です: ${file.type}`);
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(result => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error('Processing error:', result.reason);
          return { error: result.reason.message };
        }
      }));
    }

    return results;
  }
}

module.exports = new OCRService();