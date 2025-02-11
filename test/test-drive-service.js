const assert = require('assert');
const { describe, it, beforeEach, afterEach, jest } = require('@jest/globals');
const { OperationError } = require('../src/utils/errors');
const driveService = require('../src/services/driveService');
const settingsService = require('../src/services/settingsService');

// モックデータ
const TEST_USER_ID = 'U123456';
const TEST_FOLDER_ID = 'test_folder_id';
const TEST_FILE_ID = 'test_file_id';
const TEST_EMAIL = 'test@example.com';

// Google Drive APIのモック
const mockDrive = {
  files: {
    list: async ({ q }) => {
      if (q.includes('nonexistent')) {
        return { data: { files: [] } };
      }
      return {
        data: {
          files: [{ id: TEST_FOLDER_ID }]
        }
      };
    },
    create: async ({ resource, media }) => {
      if (resource.mimeType === 'application/vnd.google-apps.folder') {
        return {
          data: {
            id: TEST_FOLDER_ID
          }
        };
      }
      return {
        data: {
          id: TEST_FILE_ID,
          webViewLink: `https://drive.google.com/file/d/${TEST_FILE_ID}/view`
        }
      };
    },
    delete: async () => ({})
  },
  permissions: {
    create: async () => ({})
  }
};

// settingsServiceのモック
jest.mock('../src/services/settingsService', () => ({
  getUserEmail: async () => TEST_EMAIL
}));

// driveServiceのdriveプロパティを一時的にモックに置き換える
const originalDrive = driveService.drive;
beforeEach(() => {
  driveService.drive = mockDrive;
});
afterEach(() => {
  driveService.drive = originalDrive;
});

describe('DriveService', () => {
  describe('ensureFolder', () => {
    it('should return existing folder ID when found', async () => {
      const folderId = await driveService.ensureFolder(
        TEST_USER_ID,
        'test_folder',
        'parent_folder_id'
      );
      assert.strictEqual(folderId, TEST_FOLDER_ID);
    });

    it('should create new folder when not found', async () => {
      const folderId = await driveService.ensureFolder(
        TEST_USER_ID,
        'nonexistent',
        'parent_folder_id'
      );
      assert.strictEqual(folderId, TEST_FOLDER_ID);
    });

    it('should set permissions when creating user folder', async () => {
      const folderId = await driveService.ensureFolder(
        TEST_USER_ID,
        'nonexistent',
        'parent_folder_id',
        true
      );
      assert.strictEqual(folderId, TEST_FOLDER_ID);
    });

    it('should throw OperationError on failure', async () => {
      const errorDrive = {
        files: {
          list: async () => { throw new Error('API Error'); }
        }
      };
      driveService.drive = errorDrive;

      try {
        await driveService.ensureFolder(TEST_USER_ID, 'test_folder', 'parent_folder_id');
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert(error instanceof OperationError);
        assert.strictEqual(error.operation, 'ensureFolder');
      }
    });
  });

  describe('getOrCreateMonthFolder', () => {
    it('should create folder structure and return month folder ID', async () => {
      const folderId = await driveService.getOrCreateMonthFolder(TEST_USER_ID, '2025-02');
      assert.strictEqual(folderId, TEST_FOLDER_ID);
    });

    it('should throw OperationError on failure', async () => {
      const errorDrive = {
        files: {
          list: async () => { throw new Error('API Error'); }
        }
      };
      driveService.drive = errorDrive;

      try {
        await driveService.getOrCreateMonthFolder(TEST_USER_ID, '2025-02');
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert(error instanceof OperationError);
        assert.strictEqual(error.operation, 'getOrCreateMonthFolder');
      }
    });
  });

  describe('deleteFileByName', () => {
    it('should delete existing file', async () => {
      await driveService.deleteFileByName(TEST_FOLDER_ID, 'test.pdf');
      // 例外が発生しなければ成功
    });

    it('should handle non-existent file', async () => {
      await driveService.deleteFileByName(TEST_FOLDER_ID, 'nonexistent.pdf');
      // 例外が発生しなければ成功
    });

    it('should throw OperationError on failure', async () => {
      const errorDrive = {
        files: {
          list: async () => { throw new Error('API Error'); }
        }
      };
      driveService.drive = errorDrive;

      try {
        await driveService.deleteFileByName(TEST_FOLDER_ID, 'test.pdf');
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert(error instanceof OperationError);
        assert.strictEqual(error.operation, 'deleteFileByName');
      }
    });
  });

  describe('uploadFile', () => {
    it('should upload file and return file info', async () => {
      const result = await driveService.uploadFile(
        TEST_USER_ID,
        '2025-02',
        Buffer.from('test'),
        'test.pdf',
        'application/pdf'
      );

      assert.strictEqual(result.id, TEST_FILE_ID);
      assert(result.webViewLink.includes(TEST_FILE_ID));
    });

    it('should throw OperationError on failure', async () => {
      const errorDrive = {
        files: {
          create: async () => { throw new Error('API Error'); }
        }
      };
      driveService.drive = errorDrive;

      try {
        await driveService.uploadFile(
          TEST_USER_ID,
          '2025-02',
          Buffer.from('test'),
          'test.pdf',
          'application/pdf'
        );
        assert.fail('Expected error was not thrown');
      } catch (error) {
        assert(error instanceof OperationError);
        assert.strictEqual(error.operation, 'uploadFile');
      }
    });
  });
});