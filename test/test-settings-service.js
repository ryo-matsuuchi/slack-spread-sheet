const assert = require('assert');
const { describe, it, beforeEach, afterEach } = require('@jest/globals');
const { SettingsError } = require('../src/utils/errors');
const settingsService = require('../src/services/settingsService');

// モックデータ
const TEST_USER_ID = 'U123456';
const TEST_SPREADSHEET_ID = 'test_spreadsheet_id';
const TEST_EMAIL = 'test@example.com';

// Google APIのモック
const mockSheets = {
  spreadsheets: {
    values: {
      get: async () => ({
        data: {
          values: [
            ['user_id', 'spreadsheet_id', 'email', 'created_at', 'updated_at'],
            [TEST_USER_ID, TEST_SPREADSHEET_ID, TEST_EMAIL, '2025-01-01', '2025-01-01']
          ]
        }
      }),
      append: async () => ({}),
      update: async () => ({})
    }
  }
};

// settingsServiceのsheetsプロパティを一時的にモックに置き換える
const originalSheets = settingsService.sheets;
beforeEach(() => {
  settingsService.sheets = mockSheets;
});
afterEach(() => {
  settingsService.sheets = originalSheets;
});

describe('SettingsService', () => {
  describe('getUserSettings', () => {
    it('should return user settings when found', async () => {
      const settings = await settingsService.getUserSettings(TEST_USER_ID);
      assert.strictEqual(settings.user_id, TEST_USER_ID);
      assert.strictEqual(settings.spreadsheet_id, TEST_SPREADSHEET_ID);
      assert.strictEqual(settings.email, TEST_EMAIL);
    });

    it('should return null when user not found', async () => {
      const settings = await settingsService.getUserSettings('nonexistent');
      assert.strictEqual(settings, null);
    });
  });

  describe('getSpreadsheetId', () => {
    it('should return spreadsheet ID when found', async () => {
      const spreadsheetId = await settingsService.getSpreadsheetId(TEST_USER_ID);
      assert.strictEqual(spreadsheetId, TEST_SPREADSHEET_ID);
    });

    it('should throw SettingsError when spreadsheet ID not found', async () => {
      try {
        await settingsService.getSpreadsheetId('nonexistent');
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert(error instanceof SettingsError);
        assert.strictEqual(error.userId, 'nonexistent');
      }
    });
  });

  describe('getUserEmail', () => {
    it('should return email when found', async () => {
      const email = await settingsService.getUserEmail(TEST_USER_ID);
      assert.strictEqual(email, TEST_EMAIL);
    });

    it('should throw SettingsError when email not found', async () => {
      try {
        await settingsService.getUserEmail('nonexistent');
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert(error instanceof SettingsError);
        assert.strictEqual(error.userId, 'nonexistent');
      }
    });
  });

  describe('isValidSpreadsheetId', () => {
    it('should return true for valid spreadsheet ID', () => {
      assert.strictEqual(settingsService.isValidSpreadsheetId('1234567890abcdefghijklmnop'), true);
    });

    it('should return false for invalid spreadsheet ID', () => {
      assert.strictEqual(settingsService.isValidSpreadsheetId('invalid'), false);
      assert.strictEqual(settingsService.isValidSpreadsheetId(''), false);
      assert.strictEqual(settingsService.isValidSpreadsheetId('12345'), false);
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid email', () => {
      assert.strictEqual(settingsService.isValidEmail('test@example.com'), true);
    });

    it('should return false for invalid email', () => {
      assert.strictEqual(settingsService.isValidEmail('invalid'), false);
      assert.strictEqual(settingsService.isValidEmail(''), false);
      assert.strictEqual(settingsService.isValidEmail('@example.com'), false);
      assert.strictEqual(settingsService.isValidEmail('test@'), false);
    });
  });
});