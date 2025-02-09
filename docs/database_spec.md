# データベース仕様書

## 1. 概要

ユーザーごとの設定情報を Google Spreadsheet で管理します。これにより：

- Glitch の制限を回避
- 既存の Google 連携を活用
- 設定の可視化と管理が容易

## 2. スプレッドシート構成

### 2.1 管理用スプレッドシート

アプリケーション管理者が所有する設定用スプレッドシート。

```
管理用スプレッドシート/
└── _settings （システム設定シート）
    └── user_settings （ユーザー設定シート）
```

### 2.2 user_settings シート構造

| user_id   | spreadsheet_id | email    | created_at    | updated_at    |
| --------- | -------------- | -------- | ------------- | ------------- |
| U8N2C078D | 17r0t3Pt5t...  | user@... | 2025-02-09... | 2025-02-09... |

#### カラム説明

- `user_id`: Slack のユーザー ID（例：`U8N2C078D`）
- `spreadsheet_id`: ユーザーの経費精算用スプレッドシート ID
- `email`: ユーザーのメールアドレス（Google Drive 権限設定用）
- `created_at`: レコード作成日時
- `updated_at`: レコード更新日時

## 3. 操作仕様

### 3.1 初期設定

1. `/keihi setup`コマンド実行時

```javascript
async function setupUserSettings(userId, spreadsheetId) {
  const sheet = await getSettingsSheet();
  const email = await getUserEmail(userId);

  // 既存設定の確認
  const row = await findUserRow(sheet, userId);

  if (row) {
    // 更新
    await updateUserSettings(sheet, row, {
      spreadsheetId,
      email,
      updated_at: new Date().toISOString(),
    });
  } else {
    // 新規追加
    await appendUserSettings(sheet, {
      user_id: userId,
      spreadsheet_id: spreadsheetId,
      email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}
```

2. 設定確認時

```javascript
async function getUserSettings(userId) {
  const sheet = await getSettingsSheet();
  return await findUserSettings(sheet, userId);
}
```

### 3.2 データ検索

1. スプレッドシート ID 取得

```javascript
async function getSpreadsheetId(userId) {
  const settings = await getUserSettings(userId);
  if (!settings) {
    throw new Error(
      "スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。"
    );
  }
  return settings.spreadsheet_id;
}
```

2. メールアドレス取得

```javascript
async function getUserEmail(userId) {
  const settings = await getUserSettings(userId);
  if (!settings?.email) {
    throw new Error(
      "メールアドレスの取得に失敗しました。Slack管理者に連絡してください。"
    );
  }
  return settings.email;
}
```

## 4. エラーハンドリング

### 4.1 データ不存在

1. スプレッドシート ID 未設定

```javascript
if (!settings) {
  throw new Error(
    "スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。"
  );
}
```

2. メールアドレス未設定

```javascript
if (!settings?.email) {
  throw new Error(
    "メールアドレスの取得に失敗しました。Slack管理者に連絡してください。"
  );
}
```

### 4.2 データ整合性

1. スプレッドシート ID のバリデーション

```javascript
if (!/^[a-zA-Z0-9-_]{43}$/.test(spreadsheetId)) {
  throw new Error("無効なスプレッドシートIDです。");
}
```

2. メールアドレスのバリデーション

```javascript
if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
  throw new Error("無効なメールアドレスです。");
}
```

## 5. バックアップ

### 5.1 自動バックアップ

Google Spreadsheet の版管理機能により自動的にバックアップされます。

### 5.2 手動バックアップ

1. スプレッドシートのコピーを作成
2. 特定の時点への復元が可能

## 6. セキュリティ

### 6.1 アクセス制御

1. 管理用スプレッドシート

   - アプリケーションのサービスアカウントのみがアクセス可能
   - 管理者のみが閲覧・編集可能

2. ユーザーのスプレッドシート
   - 各ユーザーが自身のスプレッドシートの権限を管理
   - アプリケーションのサービスアカウントに編集権限が必要

### 6.2 データ保護

1. 設定情報

   - ユーザー ID とメールアドレスの紐付けは管理用スプレッドシートでのみ管理
   - スプレッドシート ID は各ユーザーが提供

2. アクセスログ
   - Google Spreadsheet の変更履歴で追跡可能
   - 操作ログはアプリケーションでも記録
