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
        // No列（findEmptyRow用）: A2:A27
        if (range.includes('A2:A27')) {
          return { data: { values: [['1'], ['2'], ['3']] } };
        }
        // 合計セル（新フォーマット）: C28
        if (range.includes('C28')) {
          return { data: { values: [['3000']] } };
        }
        // 明細データ（B列起点の範囲: B2:C27 / B2:D27 / B2:E27 等）
        if (range.includes('!B2:')) {
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

// settingsService / driveService はシングルトンのインスタンス。
// transform:{} 環境では jest.mock の巻き上げが効かないため、
// 各テスト前にメソッドを直接差し替え、afterEachで元に戻す。
const originalSheets = sheetsService.sheets;
const originalGetSpreadsheetId = settingsService.getSpreadsheetId;
const originalGetOrCreateMonthFolder = driveService.getOrCreateMonthFolder;
beforeEach(() => {
  sheetsService.sheets = mockSheets;
  settingsService.getSpreadsheetId = async () => TEST_SPREADSHEET_ID;
  driveService.getOrCreateMonthFolder = async () => 'test_folder_id';
});
afterEach(() => {
  sheetsService.sheets = originalSheets;
  settingsService.getSpreadsheetId = originalGetSpreadsheetId;
  driveService.getOrCreateMonthFolder = originalGetOrCreateMonthFolder;
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
      // モックはNo=1,2が入力済み・3件目(No=3)が空。範囲先頭A2基準でindex2→4行目が空き行
      assert.strictEqual(rowNumber, 4);
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

  // 旧フォーマットのシート（合計C27・データ7〜26行）でも正しく読めることを保証する。
  // 合計行はラベルがA列・B列が空のため明細(B列起点)に含まれず、二重計上されない。
  // 合計セルC28は旧シートでは空になるため、明細合算へフォールバックする。
  describe('旧フォーマット互換', () => {
    // 旧フォーマットを模したモック（C28は空、明細範囲に合計行(B空)が混入）
    const oldFormatSheets = {
      spreadsheets: {
        get: mockSheets.spreadsheets.get,
        values: {
          get: async ({ range }) => {
            if (range.includes('C28')) {
              return { data: { values: [] } }; // 旧シートはC28が空
            }
            if (range.includes('!B2:')) {
              return {
                data: {
                  values: [
                    ['2025-02-01', '1000', '支出1'],
                    ['2025-02-02', '2000', '支出2'],
                    ['', '110319', ''] // 合計行: B列が空 → 明細から除外されるべき
                  ]
                }
              };
            }
            return { data: { values: [] } };
          },
          update: async () => ({})
        },
        batchUpdate: mockSheets.spreadsheets.batchUpdate
      }
    };

    beforeEach(() => {
      sheetsService.sheets = oldFormatSheets;
    });

    it('getStatus: C28が空でも明細合算で合計を算出し、合計行を除外する', async () => {
      const status = await sheetsService.getStatus(TEST_USER_ID, '2025-02');
      assert.strictEqual(status.count, 2);    // 合計行(B空)は除外
      assert.strictEqual(status.total, 3000); // 110319は含めず明細合算
    });

    it('getList: C28が空でも明細合算で合計を算出し、合計行を除外する', async () => {
      const list = await sheetsService.getList(TEST_USER_ID, '2025-02');
      assert.strictEqual(list.entries.length, 2);
      assert.strictEqual(list.total, 3000);
    });
  });
});