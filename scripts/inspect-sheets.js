require('dotenv').config();
const { google } = require('googleapis');
const config = require('../src/config/config');

/**
 * 金額文字列をパースして数値に変換
 * @param {string} amount - 金額文字列（例: "¥13,701"）
 * @returns {number} 数値
 */
function parseAmount(amount) {
  if (!amount) return 0;
  // 通貨記号と区切り文字を除去して数値に変換
  return parseInt(amount.replace(/[¥,]/g, '')) || 0;
}

async function inspectSheets() {
  try {
    console.log('Starting spreadsheet inspection...');
    console.log('Using spreadsheet ID:', config.google.spreadsheetTemplateId);
    console.log('Using credentials file:', config.google.credentials);

    // Google認証の設定
    console.log('\nInitializing Google Auth...');
    const auth = new google.auth.GoogleAuth({
      keyFile: config.google.credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('Getting auth client...');
    const authClient = await auth.getClient();
    console.log('Auth client obtained successfully');

    console.log('\nInitializing Google Sheets API...');
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // スプレッドシートの基本情報を取得
    console.log('\nFetching spreadsheet information...');
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: config.google.spreadsheetTemplateId,
    });
    console.log('Spreadsheet fetched successfully');

    console.log('\nAvailable sheets:');
    spreadsheet.data.sheets.forEach(sheet => {
      console.log(`- ${sheet.properties.title} (ID: ${sheet.properties.sheetId})`);
    });

    // 2025_02シートの内容を確認
    console.log('\nChecking 2025_02 sheet content:');
    try {
      // データ行の取得（A7:E列）
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.google.spreadsheetTemplateId,
        range: '2025_02!A7:E',
      });

      // C27セルの合計金額を取得
      const totalResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.google.spreadsheetTemplateId,
        range: '2025_02!C27',
      });

      console.log('\nData rows (A7:E):');
      if (dataResponse.data.values) {
        dataResponse.data.values.forEach((row, index) => {
          console.log(`Row ${index + 7}: ${row.join(' | ')}`);
        });
      } else {
        console.log('No data found in rows');
      }

      console.log('\nTotal amount (C27):');
      if (totalResponse.data.values) {
        console.log(totalResponse.data.values[0][0]);
        console.log('Parsed total:', parseAmount(totalResponse.data.values[0][0]));
      } else {
        console.log('No total amount found');
      }

      // 日付と金額が入力済みの行をカウント
      const validRows = dataResponse.data.values?.filter(row => 
        row[1] && // 日付あり
        row[2] && // 金額あり
        parseAmount(row[2]) > 0 // 金額が正の数
      ) || [];

      console.log('\nValid rows count:', validRows.length);
      console.log('Valid rows:');
      validRows.forEach(row => {
        const amount = parseAmount(row[2]);
        console.log(`${row[0]} | ${row[1]} | ¥${amount.toLocaleString()} | ${row[3]} | ${row[4]}`);
      });

    } catch (error) {
      console.log('Error reading 2025_02 sheet:', error.message);
      if (error.response) {
        console.log('Error details:', error.response.data);
      }
    }

  } catch (error) {
    console.error('\nInspection failed with error:', error);
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// スクリプトの実行
console.log('Script started');
inspectSheets().then(() => {
  console.log('\nScript completed');
}).catch(error => {
  console.error('\nScript failed:', error);
  process.exit(1);
});