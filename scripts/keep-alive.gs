// Glitchアプリケーションのヘルスチェック用スクリプト

// 環境設定
const GLITCH_APP_URL = "https://slack2keihi.glitch.me"; // GlitchのアプリケーションのURL
const HEALTH_CHECK_INTERVAL = 5; // 分単位でのチェック間隔

/**
 * ヘルスチェックを実行する関数
 */
function checkHealth() {
  try {
    const response = UrlFetchApp.fetch(`${GLITCH_APP_URL}/health`);
    const statusCode = response.getResponseCode();
    const content = JSON.parse(response.getContentText());

    Logger.log(`Health check result: ${statusCode}`);
    Logger.log(`Server status: ${content.status}`);
    Logger.log(`Server ready: ${content.ready}`);
    Logger.log(`Timestamp: ${content.timestamp}`);

    if (statusCode !== 200 || !content.ready) {
      sendNotification(
        `Warning: Server health check failed. Status: ${statusCode}, Ready: ${content.ready}`
      );
    }
  } catch (error) {
    Logger.log(`Error during health check: ${error.toString()}`);
    sendNotification(`Error: Server health check failed. ${error.toString()}`);
  }
}

/**
 * 通知を送信する関数
 * @param {string} message - 通知メッセージ
 */
function sendNotification(message) {
  // ここにSlackやメールでの通知処理を追加
  // 例: Slack Incoming Webhookを使用する場合
  /*
  const SLACK_WEBHOOK_URL = 'your-webhook-url';
  const payload = {
    text: message
  };
  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
  */
}

/**
 * トリガーを設定する関数
 */
function setupTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  // 新しいトリガーを設定
  ScriptApp.newTrigger("checkHealth")
    .timeBased()
    .everyMinutes(HEALTH_CHECK_INTERVAL)
    .create();

  Logger.log(`Trigger set to run every ${HEALTH_CHECK_INTERVAL} minutes`);
}

/**
 * 手動でヘルスチェックを実行するための関数
 */
function manualCheck() {
  checkHealth();
}
