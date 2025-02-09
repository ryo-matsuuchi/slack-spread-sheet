require('dotenv').config();

module.exports = {
  app: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },

  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
  },

  google: {
    credentials: process.env.PROJECT_DOMAIN 
      ? '/app/google-credentials.json'  // Glitch環境
      : process.env.GOOGLE_APPLICATION_CREDENTIALS,  // ローカル環境
    project: process.env.GOOGLE_CLOUD_PROJECT,
    spreadsheetTemplateId: process.env.SPREADSHEET_TEMPLATE_ID,
    domain: process.env.GOOGLE_WORKSPACE_DOMAIN,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata',
    ],
  },

  processing: {
    maxConcurrentProcesses: parseInt(process.env.MAX_CONCURRENT_PROCESSES) || 5,
    batchSize: parseInt(process.env.BATCH_SIZE) || 10,
  },

  glitch: {
    isGlitch: process.env.PROJECT_DOMAIN !== undefined,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    tempDir: process.env.PROJECT_DOMAIN ? '/app/tmp' : 'tmp',
    cleanupInterval: 5 * 60 * 1000, // 5分ごとにクリーンアップ
    apiToken: process.env.GLITCH_API_TOKEN,
  },
};