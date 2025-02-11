const { PDFDocument } = require('pdf-lib');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;

// テスト用の環境変数を読み込む
const envPath = path.join(__dirname, '.env.test');
dotenv.config({ path: envPath });

// 環境変数の検証
if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
  throw new Error(`Required environment variables are missing. Please check ${envPath}`);
}

// サービスのインポート（環境変数の検証後に行う）
const exportService = require('../src/services/exportService');
const pdfService = require('../src/services/pdfService');

// テスト用のディレクトリ
const TEST_DIR = path.join(__dirname, 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');

async function testExportExpenseReport() {
  try {
    console.log('Testing expense report export...');

    // テスト用のPDFを作成
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    page.drawText('Test Expense Report', {
      x: 50,
      y: height - 50,
      size: 20,
    });
    const pdfBuffer = await pdfDoc.save();

    // テスト用の画像を読み込み
    const imagePath = path.join(TEST_DIR, 'test-receipt.jpg');
    const imageBuffer = await fs.readFile(imagePath);

    // 画像をPDFに変換
    const receiptPdf = await pdfService.convertImageToPDF(imageBuffer);

    // PDFを結合
    const mergedPdf = await pdfService.mergePDFs([pdfBuffer, receiptPdf]);

    // 出力ディレクトリの作成
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // 結合したPDFの保存
    const outputPath = path.join(OUTPUT_DIR, 'test-expense-report.pdf');
    await fs.writeFile(outputPath, mergedPdf);

    console.log(`Test expense report saved to: ${outputPath}`);
    console.log('Export test completed successfully');
    return true;
  } catch (error) {
    console.error('Export test failed:', error);
    return false;
  }
}

async function testSpreadsheetExport() {
  try {
    console.log('Testing spreadsheet export...');

    // テスト用のスプレッドシートIDを設定
    const spreadsheetId = process.env.TEST_SPREADSHEET_ID;
    if (!spreadsheetId) {
      throw new Error('TEST_SPREADSHEET_ID environment variable is required');
    }

    const sheetName = '2025_02';

    // スプレッドシートをPDFにエクスポート
    const pdfBuffer = await exportService.exportSheetToPDF(spreadsheetId, sheetName);

    // 出力ディレクトリの作成
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // エクスポートしたPDFの保存
    const outputPath = path.join(OUTPUT_DIR, 'test-spreadsheet.pdf');
    await fs.writeFile(outputPath, pdfBuffer);

    console.log(`Test spreadsheet PDF saved to: ${outputPath}`);
    console.log('Spreadsheet export test completed successfully');
    return true;
  } catch (error) {
    console.error('Spreadsheet export test failed:', error);
    return false;
  }
}

// テストの実行
async function runTests() {
  console.log('Starting export service tests...\n');

  let success = true;

  console.log('1. Testing expense report export...');
  if (!await testExportExpenseReport()) {
    success = false;
  }
  console.log();

  console.log('2. Testing spreadsheet export...');
  if (!await testSpreadsheetExport()) {
    success = false;
  }
  console.log();

  if (success) {
    console.log('All export tests completed successfully!');
  } else {
    console.log('Some export tests failed. Check the error messages above.');
    process.exit(1);
  }
}

// テストの実行
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});