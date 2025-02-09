#!/bin/bash

# Glitch環境用の起動スクリプト

# 一時ディレクトリの作成
mkdir -p /app/tmp

# 環境変数からGoogle認証情報を復元
if [ ! -z "$GOOGLE_CREDENTIALS_BASE64" ]; then
  echo "$GOOGLE_CREDENTIALS_BASE64" | base64 -d > /app/google-credentials.json
  export GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json
fi

# Node.jsアプリケーションの起動
npm start