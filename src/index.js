const { App, ExpressReceiver } = require('@slack/bolt');
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

// 環境変数のデバッグ出力
console.log('[DEBUG] Environment variables:', {
  PORT: process.env.PORT,
  PROJECT_DOMAIN: process.env.PROJECT_DOMAIN,
  NODE_ENV: process.env.NODE_ENV
});

// 一時ディレクトリの作成
const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
  console.log('Temporary directory created:', tmpDir);
}

// サーバー状態の管理
let isServerReady = false;

// レシーバーの初期化
const receiver = new ExpressReceiver({
  signingSecret: config.slack.signingSecret,
  processBeforeResponse: true,
  endpoints: '/slack/events'  // エンドポイントを明示的に指定
});

// リクエストのデバッグログ
receiver.app.use((req, res, next) => {
  console.log('[DEBUG] Incoming request:', {
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
  next();
});

// Expressアプリの取得
const expressApp = receiver.app;

// Slack Boltアプリの初期化
const app = new App({
  token: config.slack.botToken,
  receiver,
  processBeforeResponse: true
});

// ヘルスチェックエンドポイント
expressApp.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ready: isServerReady,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// サーバー状態を公開
app.isServerReady = () => isServerReady;

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

    // アプリの起動（Glitchのポートを使用）
    const port = process.env.PORT || 3000;
    await receiver.start(port);
    console.log(`⚡️ Server is running on port ${port}!`);
    
    // サーバーの準備完了を設定
    isServerReady = true;

    // デバッグ情報の出力
    debugLog('App configuration:', {
      port: port,
      env: process.env.NODE_ENV,
      botToken: config.slack.botToken ? 'Set' : 'Not set',
      signingSecret: config.slack.signingSecret ? 'Set' : 'Not set'
    });

    // Slack接続の確認
    app.client.auth.test()
      .then(response => {
        debugLog('Successfully connected to Slack:', response);
      })
      .catch(error => {
        errorLog('Failed to connect to Slack:', error);
      });
  } catch (error) {
    errorLog('Error starting app:', error);
    process.exit(1);
  }
})();