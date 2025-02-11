const assert = require('assert');
const { describe, it } = require('@jest/globals');
const { SettingsError, OperationError } = require('../src/utils/errors');

describe('Error Classes', () => {
  describe('SettingsError', () => {
    it('should create a SettingsError with correct properties', () => {
      const message = 'Test settings error';
      const userId = 'U123456';
      const error = new SettingsError(message, userId);

      assert.strictEqual(error.name, 'SettingsError');
      assert.strictEqual(error.message, message);
      assert.strictEqual(error.userId, userId);
      assert(error instanceof Error);
    });

    it('should handle missing userId', () => {
      const message = 'Test settings error';
      const error = new SettingsError(message);

      assert.strictEqual(error.name, 'SettingsError');
      assert.strictEqual(error.message, message);
      assert.strictEqual(error.userId, undefined);
    });
  });

  describe('OperationError', () => {
    it('should create an OperationError with correct properties', () => {
      const message = 'Test operation error';
      const userId = 'U123456';
      const operation = 'testOperation';
      const error = new OperationError(message, userId, operation);

      assert.strictEqual(error.name, 'OperationError');
      assert.strictEqual(error.message, message);
      assert.strictEqual(error.userId, userId);
      assert.strictEqual(error.operation, operation);
      assert(error instanceof Error);
    });

    it('should handle missing operation', () => {
      const message = 'Test operation error';
      const userId = 'U123456';
      const error = new OperationError(message, userId);

      assert.strictEqual(error.name, 'OperationError');
      assert.strictEqual(error.message, message);
      assert.strictEqual(error.userId, userId);
      assert.strictEqual(error.operation, undefined);
    });
  });
});