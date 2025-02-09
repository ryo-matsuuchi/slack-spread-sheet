# トラブルシューティング

## 2025-02-08: Slack アプリのマニフェスト更新エラー

### 発生している問題

1. スプレッドシート ID の環境変数が設定されていない
2. Slack アプリのスコープ設定でエラーが発生

### エラー内容

1. `Error: Missing required parameters: spreadsheetId`
2. `Illegal bot scopes found 'shortcuts,views.publish'`

### 対処方法

#### スプレッドシート ID

1. スプレッドシート ID を取得済み: `17r0t3Pt5tuqfP-zWVX35RxYeWzjF5M92Z0kdRSWWGmM`
2. .env ファイルに設定済み:

```
GOOGLE_SPREADSHEET_ID=17r0t3Pt5tuqfP-zWVX35RxYeWzjF5M92Z0kdRSWWGmM
```

#### Slack アプリの必要なスコープ

##### メッセージショートカット関連

- `commands` - スラッシュコマンドとショートカットの使用
- `chat:write` - メッセージの送信

##### モーダルビュー関連

- `im:history` - DM の履歴の表示
- `im:write` - DM の送信
- `files:read` - ファイルの読み取り
- `files:write` - ファイルのアップロード

##### その他の基本機能

- `app_mentions:read` - アプリへのメンション
- `channels:history` - パブリックチャンネルの履歴
- `channels:read` - パブリックチャンネルの情報
- `groups:history` - プライベートチャンネルの履歴
- `groups:read` - プライベートチャンネルの情報
- `mpim:history` - グループ DM の履歴
- `mpim:read` - グループ DM の情報
- `users:read` - ユーザー情報の読み取り
- `users:read.email` - ユーザーのメールアドレスの読み取り

## 2025-02-08: Cloud Vision API 設定

### 発生している問題

1. Cloud Vision API が有効になっていない
2. プロジェクトの課金が有効になっていない

### エラー内容

```
Error: 7 PERMISSION_DENIED: This API method requires billing to be enabled. Please enable billing on project #546157438626
```

### 対処方法

#### 1. Cloud Vision API の有効化

1. Google Cloud Console にアクセス

   - https://console.cloud.google.com/

2. プロジェクトを選択

   - プロジェクト ID: 546157438626

3. Cloud Vision API を有効化
   - 左メニューから「API とサービス」→「ライブラリ」を選択
   - 検索バーで「Cloud Vision API」を検索
   - Cloud Vision API を選択
   - 「有効にする」をクリック

#### 2. プロジェクトの課金設定

1. Google Cloud Console にアクセス

   - https://console.cloud.google.com/

2. プロジェクトを選択

   - プロジェクト ID: 546157438626

3. 課金を有効化
   - 左メニューから「お支払い」を選択
   - 「お支払いアカウントをリンク」をクリック
   - 「新しいお支払いアカウントを作成」をクリック
   - 必要な情報を入力
   - 「続行」をクリック

## 2025-02-09: Slack 認証エラー

### 発生している問題

Socket Mode の接続時に認証エラーが発生

### エラー内容

```
Error: An API error occurred: invalid_auth
```

### 考えられる原因

1. トークンが無効または誤っている
2. アプリの権限が不足している
3. アプリが再インストールされた

### 対処方法

#### 1. トークンの確認

1. Slack API ダッシュボード（https://api.slack.com/apps）で以下を確認

   - App-Level Token（`xapp-`で始まる）
   - Bot User OAuth Token（`xoxb-`で始まる）
   - Signing Secret

2. .env ファイルの設定を確認

```
SLACK_APP_TOKEN=xapp-...（App-Level Token）
SLACK_BOT_TOKEN=xoxb-...（Bot User OAuth Token）
SLACK_SIGNING_SECRET=...（Signing Secret）
```

#### 2. アプリの権限確認

1. 「OAuth & Permissions」で必要なスコープが付与されているか確認
2. 不足している場合は追加してアプリを再インストール

#### 3. アプリの再インストール

1. 「Install App」からワークスペースにアプリを再インストール
2. 新しいトークンを.env ファイルに設定
3. アプリケーションを再起動

注意: トークンは定期的には期限切れしませんが、以下の場合に再生成が必要になります：

- セキュリティ上の理由でトークンを無効化した場合
- アプリの権限スコープを変更した場合
- アプリを再インストールした場合
- ワークスペースの設定を変更した場合
