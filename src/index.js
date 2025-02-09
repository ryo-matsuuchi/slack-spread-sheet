const { App } = require('@slack/bolt');
const config = require('./config/config');
const slackService = require('./services/slackService');
const fs = require('fs');
const path = require('path');

// デバッグログの設定
const debugLog = (message, ...args) => {
  console.log(`[DEBUG] ${message}`, ...args);
};

// エラーログの設定
const errorLog = (message, error) => {
  console.error(`[ERROR] ${message}`, error);
  if (error.stack) {
    console.error(error.stack);
  }
};

// 一時ディレクトリの作成
const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
  console.log('Temporary directory created:', tmpDir);
}

// Slack Boltアプリの初期化
const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  appToken: config.slack.appToken,
});

// グローバルエラーハンドリング
process.on('unhandledRejection', (error) => {
  errorLog('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  errorLog('Uncaught exception:', error);
});

// アプリの起動
(async () => {
  try {
    // サービスの初期化
    await slackService.initialize(app);

    // アプリの起動
    await app.start();
    console.log('⚡️ Slack Bolt app is running!');

    // デバッグ情報の出力
    debugLog('App configuration:', {
      socketMode: true,
      botToken: config.slack.botToken ? 'Set' : 'Not set',
      signingSecret: config.slack.signingSecret ? 'Set' : 'Not set',
      appToken: config.slack.appToken ? 'Set' : 'Not set',
    });
  } catch (error) {
    errorLog('Error starting app:', error);
    process.exit(1);
  }
})();