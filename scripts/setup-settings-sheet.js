const { google } = require('googleapis');
const path = require('path');

// 認証情報の設定
const credentials = require('../credentials/slack-keihi-app-ce3078b9ae32.json');
const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);

// スプレッドシートIDの取得
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const spreadsheetId = process.env.SETTINGS_SPREADSHEET_ID;

if (!spreadsheetId) {
  console.error('SETTINGS_SPREADSHEET_ID is not set in .env file');
  process.exit(1);
}

async function setupSettingsSheet() {
  try {
    console.log('Setting up settings spreadsheet...');
    const sheets = google.sheets({ version: 'v4', auth });

    // シート名を変更
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                title: 'user_settings',
              },
              fields: 'title',
            },
          },
        ],
      },
    });

    // ヘッダー行を設定
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'user_settings!A1:E1',
      valueInputOption: 'RAW',
      resource: {
        values: [['user_id', 'spreadsheet_id', 'email', 'created_at', 'updated_at']],
      },
    });

    // ヘッダー行の書式設定
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.8,
                    green: 0.8,
                    blue: 0.8,
                  },
                  textFormat: {
                    bold: true,
                  },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });

    // 列幅の調整
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            updateDimensionProperties: {
              range: {
                sheetId: 0,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 5,
              },
              properties: {
                pixelSize: 200,
              },
              fields: 'pixelSize',
            },
          },
        ],
      },
    });

    console.log('Settings spreadsheet setup completed successfully!');
    console.log(`Spreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  } catch (error) {
    console.error('Error setting up settings spreadsheet:', error);
    process.exit(1);
  }
}

setupSettingsSheet();