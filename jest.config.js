module.exports = {
  // テストファイルのパターン
  testMatch: [
    "**/test/test-*.js"
  ],

  // テスト環境
  testEnvironment: 'node',

  // カバレッジレポートの設定
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/config/**'
  ],

  // テスト実行前の環境設定
  setupFiles: ['<rootDir>/test/setup.js'],

  // モジュールの変換設定
  transform: {},

  // モックの自動クリア
  clearMocks: true,

  // テストのタイムアウト設定
  testTimeout: 10000,

  // 詳細なテスト結果の表示
  verbose: true
};