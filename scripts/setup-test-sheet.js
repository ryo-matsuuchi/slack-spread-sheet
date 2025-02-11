const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;

// テスト用の環境変数を読み込む
dotenv.config({ path: path.join(__dirname, '../test/.env.test') });

async function setupTestSheet() {
  try {
    console.log('Setting up test spreadsheet...');

    // Google認証の設定
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    // スプレッドシートの作成
    console.log('Creating new spreadsheet...');
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'Test Expense Sheet',
        },
        sheets: [
          {
            properties: {
              title: '2025_02',
              gridProperties: {
                rowCount: 100,
                columnCount: 5
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    console.log(`Created test spreadsheet with ID: ${spreadsheetId}`);
    console.log(`URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

    // テストデータの追加
    console.log('\nAdding test data...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: '2025_02!A1:E4',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          ['日付', '金額', '内容', '備考', 'ステータス'],
          ['2025/02/01', '1000', 'テスト支出1', '', '未申請'],
          ['2025/02/02', '2000', 'テスト支出2', '', '未申請'],
          ['2025/02/03', '3000', 'テスト支出3', '', '未申請']
        ]
      }
    });

    console.log('Test data added successfully');

    // シートIDの取得と表示
    console.log('\nGetting sheet ID...');
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const sheetId = response.data.sheets[0].properties.sheetId;
    console.log(`Sheet ID for '2025_02': ${sheetId}`);

    console.log('\nTest setup completed successfully!');
    console.log('\nPlease update the following in test/.env.test:');
    console.log(`TEST_SPREADSHEET_ID=${spreadsheetId}`);

    // 現在の環境変数ファイルの内容を表示
    console.log('\nCurrent test/.env.test:');
    console.log('='.repeat(50));
    const envContent = await fs.readFile(path.join(__dirname, '../test/.env.test'), 'utf8');
    console.log(envContent);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Error setting up test sheet:', error);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    process.exit(1);
  }
}

setupTestSheet();