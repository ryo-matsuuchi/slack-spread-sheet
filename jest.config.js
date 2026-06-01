module.exports = {
  // テストファイルのパターン
  testMatch: [
    "**/test/test-*.js"
  ],

  // 実認証情報(.env.test)が必要なスタンドアロン結合スクリプトは自動実行対象から除外する
  // （describe/itを持たず process.exit を呼ぶため jest ランナーを停止させてしまう。
  //  個別実行は `node test/test-export-service.js` のように行う）
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/test/test-export-service.js",
    "<rootDir>/test/test-pdf-export.js"
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

  // テスト実行前の環境設定（フレームワーク導入後に実行し、jest等のグローバルを利用可能にする）
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],

  // モジュールの変換設定
  transform: {},

  // グローバル関数を自動注入しない（各テストは @jest/globals から明示的にimportする）
  // 注入とimportの二重宣言による "Identifier 'jest' has already been declared" を防ぐ
  injectGlobals: false,

  // モックの自動クリア
  clearMocks: true,

  // テストのタイムアウト設定
  testTimeout: 10000,

  // 詳細なテスト結果の表示
  verbose: true
};