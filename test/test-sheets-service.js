const assert = require('assert');
const { describe, it, beforeEach, afterEach, jest } = require('@jest/globals');
const { OperationError } = require('../src/utils/errors');
const sheetsService = require('../src/services/sheetsService');
const settingsService = require('../src/services/settingsService');
const driveService = require('../src/services/driveService');

// モックデータ
const TEST_USER_ID = 'U123456';
const TEST_SPREADSHEET_ID = 'test_spreadsheet_id';
const TEST_SHEET_ID = '123456';
const TEST_SHEET_NAME = '2025_02';

// Google APIのモック
const mockSheets = {
  spreadsheets: {
    get: async () => ({
      data: {
        sheets: [
          {
            properties: {
              title: '_base',
              sheetId: '000000'
            }
          },
          {
            properties: {
              title: TEST_SHEET_NAME,
              sheetId: TEST_SHEET_ID
            }
          }
        ]
      }
    }),
    values: {
      get: async ({ range }) => {
        if (range.includes('A2:A26')) {
          return { data: { values: [['1'], ['2'], ['3']] } };
        }
        if (range.includes('B2:E26')) {
          return {
            data: {
              values: [
                ['2025-02-01', '1000', 'テスト支出1', 'メモ1'],
                ['2025-02-02', '2000', 'テスト支出2', 'メモ2'],
                ['', '', '', '']
              ]
            }
          };
        }
        if (range.includes('C27')) {
          return { data: { values: [['3000']] } };
        }
        return { data: { values: [] } };
      },
      update: async () => ({})
    },
    batchUpdate: async () => ({
      data: {
        replies: [
          {
            duplicateSheet: {
              properties: {
                sheetId: TEST_SHEET_ID,
                title: TEST_SHEET_NAME
              }
            }
          }
        ]
      }
    })
  }
};

// settingsServiceのモック
jest.mock('../src/services/settingsService', () => ({
  getSpreadsheetId: async () => TEST_SPREADSHEET_ID
}));

// driveServiceのモック
jest.mock('../src/services/driveService', () => ({
  getOrCreateMonthFolder: async () => 'test_folder_id'
}));

// sheetsServiceのsheetsプロパティを一時的にモックに置き換える
const originalSheets = sheetsService.sheets;
beforeEach(() => {
  sheetsService.sheets = mockSheets;
});
afterEach(() => {
  sheetsService.sheets = originalSheets;
});

describe('SheetsService', () => {
  describe('parseAmount', () => {
    it('should parse amount strings correctly', () => {
      assert.strictEqual(sheetsService.parseAmount('1234'), 1234);
      assert.strictEqual(sheetsService.parseAmount('¥1,234'), 1234);
      assert.strictEqual(sheetsService.parseAmount('￥1,234'), 1234);
    });

    it('should return NaN for invalid amounts', () => {
      assert(isNaN(sheetsService.parseAmount('')));
      assert(isNaN(sheetsService.parseAmount('invalid')));
    });
  });

  describe('formatSheetName', () => {
    it('should format year-month correctly', () => {
      assert.strictEqual(sheetsService.formatSheetName('2025-02'), '2025_02');
    });
  });

  describe('parseSheetName', () => {
    it('should parse sheet name correctly', () => {
      assert.strictEqual(sheetsService.parseSheetName('2025_02'), '2025-02');
    });
  });

  describe('formatDate', () => {
    it('should format date with slashes when specified', () => {
      assert.strictEqual(sheetsService.formatDate('2025-02-01', true), '2025/02/01');
    });

    it('should keep hyphens when not using slashes', () => {
      assert.strictEqual(sheetsService.formatDate('2025-02-01', false), '2025-02-01');
    });
  });

  describe('getOrCreateSheet', () => {
    it('should return existing sheet when found', async () => {
      const sheet = await sheetsService.getOrCreateSheet(TEST_USER_ID, '2025-02');
      assert.strictEqual(sheet.sheetId, TEST_SHEET_ID);
      assert.strictEqual(sheet.title, TEST_SHEET_NAME);
    });

    it('should throw OperationError when _base sheet not found', async () => {
      const mockSheetsNoBase = {
        spreadsheets: {
          get: async () => ({
            data: {
              sheets: [
                {
                  properties: {
                    title: TEST_SHEET_NAME,
                    sheetId: TEST_SHEET_ID
                  }
                }
              ]
            }
          })
        }
      };

      sheetsService.sheets = mockSheetsNoBase;
      try {
        await sheetsService.getOrCreateSheet(TEST_USER_ID, '2025-03');
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert(error instanceof OperationError);
        assert.strictEqual(error.operation, 'getOrCreateSheet');
      }
    });
  });

  describe('findEmptyRow', () => {
    it('should find first empty row', async () => {
      const rowNumber = await sheetsService.findEmptyRow(TEST_SPREADSHEET_ID, TEST_SHEET_NAME);
      assert.strictEqual(rowNumber, 3); // 3行目が空き行
    });

    it('should throw error when no empty row found', async () => {
      const mockSheetsFull = {
        spreadsheets: {
          values: {
            get: async () => ({
              data: {
                values: Array(25).fill(['1']).map((row, i) => ['1', `value${i}`])
              }
            })
          }
        }
      };

      sheetsService.sheets = mockSheetsFull;
      try {
        await sheetsService.findEmptyRow(TEST_SPREADSHEET_ID, TEST_SHEET_NAME);
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert.strictEqual(error.message, '空き行がありません。');
      }
    });
  });

  describe('addEntry', () => {
    it('should add entry successfully', async () => {
      const result = await sheetsService.addEntry({
        userId: TEST_USER_ID,
        date: '2025-02-01',
        amount: 1000,
        details: 'テスト支出',
        memo: 'テストメモ'
      });

      assert.strictEqual(result.success, true);
      assert(result.sheetUrl.includes(TEST_SPREADSHEET_ID));
      assert(result.sheetUrl.includes(TEST_SHEET_ID));
    });
  });

  describe('getStatus', () => {
    it('should return status with correct totals', async () => {
      const status = await sheetsService.getStatus(TEST_USER_ID, '2025-02');
      assert.strictEqual(status.count, 2);
      assert.strictEqual(status.total, 3000);
      assert(status.sheetUrl.includes(TEST_SPREADSHEET_ID));
    });
  });

  describe('getList', () => {
    it('should return list with entries', async () => {
      const list = await sheetsService.getList(TEST_USER_ID, '2025-02');
      assert.strictEqual(list.entries.length, 2);
      assert.strictEqual(list.total, 3000);
      assert(list.sheetUrl.includes(TEST_SPREADSHEET_ID));
    });
  });
});