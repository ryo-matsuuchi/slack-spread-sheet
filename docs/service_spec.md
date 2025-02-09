# サービス仕様書

## 1. サービス構成

```
src/
└── services/
    ├── slackService.js      # Slackとの連携
    ├── sheetsService.js     # スプレッドシート操作
    ├── settingsService.js   # ユーザー設定管理（新規）
    └── driveService.js      # Google Drive操作
```

## 2. settingsService.js

ユーザー設定を管理する新しいサービス。

```javascript
class SettingsService {
  constructor() {
    this.spreadsheetId = process.env.SETTINGS_SPREADSHEET_ID;
    this.sheetName = "user_settings";
  }

  // ユーザー設定の取得
  async getUserSettings(userId) {
    // 設定シートからユーザー情報を検索
  }

  // ユーザー設定の保存
  async saveUserSettings(userId, settings) {
    // 設定シートにユーザー情報を保存
  }

  // スプレッドシートIDの取得
  async getSpreadsheetId(userId) {
    // ユーザーのスプレッドシートIDを取得
  }

  // メールアドレスの取得
  async getUserEmail(userId) {
    // ユーザーのメールアドレスを取得
  }
}
```

## 3. sheetsService.js

既存のサービスを修正して、ユーザーごとのスプレッドシートに対応。

```javascript
class SheetsService {
  constructor(settingsService) {
    this.settingsService = settingsService;
  }

  // スプレッドシートIDの取得
  async getSpreadsheetId(userId) {
    return await this.settingsService.getSpreadsheetId(userId);
  }

  // エントリーの追加
  async addEntry(userId, data) {
    const spreadsheetId = await this.getSpreadsheetId(userId);
    // 以降は既存の処理
  }

  // 月次シートの取得
  async getMonthlySheet(userId, yearMonth) {
    const spreadsheetId = await this.getSpreadsheetId(userId);
    // 以降は既存の処理
  }

  // ステータスの取得
  async getStatus(userId, yearMonth) {
    const spreadsheetId = await this.getSpreadsheetId(userId);
    // 以降は既存の処理
  }

  // 一覧の取得
  async getList(userId, yearMonth) {
    const spreadsheetId = await this.getSpreadsheetId(userId);
    // 以降は既存の処理
  }
}
```

## 4. driveService.js

既存のサービスを修正して、ユーザーごとのメールアドレスに対応。

```javascript
class DriveService {
  constructor(settingsService) {
    this.settingsService = settingsService;
  }

  // メールアドレスの取得
  async getUserEmail(userId) {
    return await this.settingsService.getUserEmail(userId);
  }

  // フォルダの作成
  async ensureFolder(userId, name, parentId) {
    const userEmail = await this.getUserEmail(userId);
    // 以降は既存の処理
  }

  // ファイルのアップロード
  async uploadFile(userId, yearMonth, content, fileName, mimeType) {
    const userEmail = await this.getUserEmail(userId);
    // 以降は既存の処理
  }
}
```

## 5. slackService.js

コマンド処理を追加して、設定管理に対応。

```javascript
class SlackService {
  constructor(settingsService, sheetsService, driveService) {
    this.settingsService = settingsService;
    this.sheetsService = sheetsService;
    this.driveService = driveService;
  }

  // 設定コマンドの処理
  async handleSetupCommand(command) {
    const { user_id, text } = command;
    const spreadsheetId = text.trim();

    // スプレッドシートIDの検証
    if (!this.isValidSpreadsheetId(spreadsheetId)) {
      return "無効なスプレッドシートIDです。";
    }

    // 設定の保存
    await this.settingsService.saveUserSettings(user_id, {
      spreadsheet_id: spreadsheetId,
    });

    return "スプレッドシートの設定が完了しました。";
  }

  // 設定確認コマンドの処理
  async handleConfigCommand(command) {
    const { user_id } = command;
    const settings = await this.settingsService.getUserSettings(user_id);

    if (!settings) {
      return "スプレッドシートが設定されていません。";
    }

    return `現在の設定:\nスプレッドシートID: ${settings.spreadsheet_id}`;
  }

  // ステータス確認コマンドの処理
  async handleStatusCommand(command) {
    const { user_id, text } = command;
    const yearMonth = text.trim() || this.getCurrentYearMonth();

    const status = await this.sheetsService.getStatus(user_id, yearMonth);
    return this.formatStatusMessage(status);
  }

  // 一覧表示コマンドの処理
  async handleListCommand(command) {
    const { user_id, text } = command;
    const yearMonth = text.trim() || this.getCurrentYearMonth();

    const list = await this.sheetsService.getList(user_id, yearMonth);
    return this.formatListMessage(list);
  }
}
```

## 6. 依存関係の注入

```javascript
// src/index.js

const settingsService = new SettingsService();
const sheetsService = new SheetsService(settingsService);
const driveService = new DriveService(settingsService);
const slackService = new SlackService(
  settingsService,
  sheetsService,
  driveService
);
```

## 7. エラーハンドリング

### 7.1 設定関連

```javascript
class SettingsError extends Error {
  constructor(message, userId) {
    super(message);
    this.name = "SettingsError";
    this.userId = userId;
  }
}

// 設定未完了
throw new SettingsError(
  "スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。",
  userId
);

// アクセス権限エラー
throw new SettingsError(
  "スプレッドシートにアクセスできません。アプリケーションに編集権限を付与してください。",
  userId
);
```

### 7.2 操作関連

```javascript
class OperationError extends Error {
  constructor(message, userId, operation) {
    super(message);
    this.name = "OperationError";
    this.userId = userId;
    this.operation = operation;
  }
}

// シート作成エラー
throw new OperationError("シートの作成に失敗しました。", userId, "createSheet");

// データ追加エラー
throw new OperationError("データの追加に失敗しました。", userId, "addEntry");
```

## 8. 環境変数

```bash
# 既存の環境変数
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# 新規追加の環境変数
SETTINGS_SPREADSHEET_ID=... # 設定管理用スプレッドシートのID
```
