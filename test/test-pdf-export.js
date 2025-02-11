const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const pdfService = require('../src/services/pdfService');

// テスト用のディレクトリ
const TEST_DIR = path.join(__dirname, 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');

async function createTestPDF(text, pageCount = 1) {
  const pdfDoc = await PDFDocument.create();
  
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    // 日本語テキストの代わりに英数字を使用
    page.drawText(`${text} - Page ${i + 1}`, {
      x: 50,
      y: height - 50,
      size: 20,
    });
  }

  return await pdfDoc.save();
}

async function testPDFMerge() {
  try {
    console.log('Creating test PDFs...');
    
    // テストPDFの作成（英語のテキストを使用）
    const pdf1 = await createTestPDF('Expense Report', 1);
    const pdf2 = await createTestPDF('Receipt 1', 1);
    const pdf3 = await createTestPDF('Receipt 2', 1);

    // しおり情報の作成（英語のテキストを使用）
    const bookmarks = [
      { title: 'Expense Report', pageNumber: 1 },
      { title: 'Receipt 1', pageNumber: 2 },
      { title: 'Receipt 2', pageNumber: 3 }
    ];

    console.log('Merging PDFs...');
    const mergedPdf = await pdfService.mergePDFs([pdf1, pdf2, pdf3], bookmarks);

    // 出力ディレクトリの作成
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // 結合したPDFの保存
    const outputPath = path.join(OUTPUT_DIR, 'merged.pdf');
    await fs.writeFile(outputPath, mergedPdf);
    console.log(`Merged PDF saved to: ${outputPath}`);

    // 個別のPDFも保存（デバッグ用）
    await fs.writeFile(path.join(OUTPUT_DIR, 'pdf1.pdf'), pdf1);
    await fs.writeFile(path.join(OUTPUT_DIR, 'pdf2.pdf'), pdf2);
    await fs.writeFile(path.join(OUTPUT_DIR, 'pdf3.pdf'), pdf3);

    console.log('PDF merge test completed successfully');
    return true;
  } catch (error) {
    console.error('PDF merge test failed:', error);
    return false;
  }
}

async function testImageToPDF() {
  try {
    console.log('Converting image to PDF...');

    // テスト画像の読み込み
    const imagePath = path.join(TEST_DIR, 'test-receipt.jpg');
    const imageBuffer = await fs.readFile(imagePath);

    // 画像をPDFに変換
    const pdfBuffer = await pdfService.convertImageToPDF(imageBuffer);

    // 出力ディレクトリの作成
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // 変換したPDFの保存
    const outputPath = path.join(OUTPUT_DIR, 'converted-image.pdf');
    await fs.writeFile(outputPath, pdfBuffer);
    console.log(`Converted PDF saved to: ${outputPath}`);

    console.log('Image to PDF test completed successfully');
    return true;
  } catch (error) {
    console.error('Image to PDF test failed:', error);
    return false;
  }
}

async function testBookmarks() {
  try {
    console.log('Testing bookmark addition...');

    // テストPDFの作成（英語のテキストを使用）
    const pdf = await createTestPDF('Test Document', 3);

    // しおり情報の作成（英語のテキストを使用）
    const bookmarks = [
      { title: 'Page 1', pageNumber: 1 },
      { title: 'Page 2', pageNumber: 2 },
      { title: 'Page 3', pageNumber: 3 }
    ];

    // しおりを追加
    const pdfWithBookmarks = await pdfService.addBookmarks(pdf, bookmarks);

    // 出力ディレクトリの作成
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // しおり付きPDFの保存
    const outputPath = path.join(OUTPUT_DIR, 'bookmarked.pdf');
    await fs.writeFile(outputPath, pdfWithBookmarks);
    console.log(`Bookmarked PDF saved to: ${outputPath}`);

    console.log('Bookmark test completed successfully');
    return true;
  } catch (error) {
    console.error('Bookmark test failed:', error);
    return false;
  }
}

// テストの実行
async function runTests() {
  console.log('Starting PDF service tests...\n');

  let success = true;

  console.log('1. Testing PDF merge...');
  if (!await testPDFMerge()) {
    success = false;
  }
  console.log();

  console.log('2. Testing image to PDF conversion...');
  if (!await testImageToPDF()) {
    success = false;
  }
  console.log();

  console.log('3. Testing bookmark addition...');
  if (!await testBookmarks()) {
    success = false;
  }
  console.log();

  if (success) {
    console.log('All tests completed successfully!');
  } else {
    console.log('Some tests failed. Check the error messages above.');
    process.exit(1);
  }
}

// テストの実行
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});