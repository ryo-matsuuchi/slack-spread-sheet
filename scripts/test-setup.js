const fs = require('fs').promises;
const path = require('path');

async function setupTestEnvironment() {
  try {
    // テストディレクトリの作成
    await fs.mkdir(path.join(__dirname, '../test/data'), { recursive: true });
    
    // テスト用の環境変数ファイルの作成
    const envExample = `# Slack設定
SLACK_BOT_TOKEN=xoxb-your-test-token
SLACK_SIGNING_SECRET=your-test-secret
SLACK_APP_TOKEN=xapp-your-test-token

# Google Cloud設定
GOOGLE_CLOUD_PROJECT=your-test-project
GOOGLE_APPLICATION_CREDENTIALS=credentials/test-credentials.json
SPREADSHEET_TEMPLATE_ID=your-test-spreadsheet-id

# アプリケーション設定
NODE_ENV=development
PORT=3000

# 処理設定
MAX_CONCURRENT_PROCESSES=2
BATCH_SIZE=5
`;

    await fs.writeFile(path.join(__dirname, '../test/.env.test'), envExample);

    // テスト用のログディレクトリの作成
    await fs.mkdir(path.join(__dirname, '../logs'), { recursive: true });

    // テスト用のサンプルデータの作成
    const sampleData = {
      receipt1: {
        date: '2025-02-01',
        amount: 1234,
        details: 'テスト領収書1',
      },
      receipt2: {
        date: '2025-02-02',
        amount: 5678,
        details: 'テスト領収書2',
      },
    };

    await fs.writeFile(
      path.join(__dirname, '../test/data/sample.json'),
      JSON.stringify(sampleData, null, 2)
    );

    console.log('✅ テスト環境のセットアップが完了しました');
    console.log('📁 作成されたディレクトリ:');
    console.log('  - test/data');
    console.log('  - logs');
    console.log('\n📝 作成されたファイル:');
    console.log('  - test/.env.test');
    console.log('  - test/data/sample.json');
    console.log('\n次のステップ:');
    console.log('1. test/.env.test を .env にコピーして必要な値を設定');
    console.log('2. Google Cloud の認証情報を credentials/ に配置');
    console.log('3. npm run dev で開発サーバーを起動');

  } catch (error) {
    console.error('❌ セットアップ中にエラーが発生しました:', error);
    process.exit(1);
  }
}

setupTestEnvironment();