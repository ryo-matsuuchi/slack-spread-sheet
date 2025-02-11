// テスト用の環境変数を設定
process.env.GOOGLE_CLIENT_EMAIL = 'test@example.com';
process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE...test...key\n-----END PRIVATE KEY-----\n';
process.env.SETTINGS_SPREADSHEET_ID = 'test_settings_spreadsheet_id';
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = 'test_root_folder_id';

// コンソール出力のモック化（必要に応じて）
global.console = {
  ...console,
  log: jest.fn(),    // デバッグログ
  error: jest.fn(),  // エラーログ
};

// エラー時のスタックトレース表示を改善
Error.stackTraceLimit = Infinity;

// テスト終了時のクリーンアップ
afterAll(() => {
  // モックをリセット
  jest.clearAllMocks();
});