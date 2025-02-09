const express = require('express');
const router = express.Router();
const { WebClient } = require('@slack/web-api');
const config = require('../config/config');
const ocrService = require('../services/ocrService');
const driveService = require('../services/driveService');
const sheetsService = require('../services/sheetsService');

// Slackクライアントの初期化
const slack = new WebClient(config.slack.botToken);

// 認証ミドルウェア
const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== config.glitch.apiToken) {
    return res.status(403).json({ error: '無効なトークンです' });
  }

  next();
};

// バリデーションミドルウェア
const validateExpenseData = (req, res, next) => {
  const { user_id, file } = req.body;

  if (!user_id || !file) {
    return res.status(400).json({ error: '必須パラメータが不足しています' });
  }

  next();
};

// 経費精算処理のエンドポイント
router.post('/', authenticateRequest, validateExpenseData, async (req, res) => {
  const { user_id, file, date, amount, details, memo } = req.body;

  try {
    // ファイル情報の取得
    const fileInfo = await slack.files.info({
      file: file,
      full: true,
    });

    // ファイルのダウンロードとバッファへの変換
    const fileContent = Buffer.from(fileInfo.content);
    const fileName = fileInfo.file.name;
    const mimeType = fileInfo.file.mimetype;

    // 年月の取得（YYYY-MM）
    const yearMonth = date ? date.substring(0, 7) : new Date().toISOString().substring(0, 7);

    // Google Driveにアップロード
    const driveFile = await driveService.uploadFile(
      user_id,
      yearMonth,
      fileContent,
      fileName,
      mimeType
    );

    let finalAmount = amount;
    let finalDetails = details;

    // 必要な場合のみOCR処理を実行
    if (!finalAmount || !finalDetails) {
      const ocrResult = await ocrService.extractText(fileContent);
      finalAmount = amount || ocrResult.amount;
      finalDetails = details || ocrResult.details;
    }

    // スプレッドシートに登録
    await sheetsService.addEntry({
      userId: user_id,
      date: date || new Date().toISOString().split('T')[0],
      amount: finalAmount,
      details: finalDetails,
      memo: memo || '',
      fileUrl: driveFile.webViewLink,
    });

    // 成功レスポンスを返す
    res.json({
      success: true,
      date: date || new Date().toISOString().split('T')[0],
      amount: finalAmount,
      details: finalDetails,
      file_url: driveFile.webViewLink,
    });

  } catch (error) {
    console.error('Expense processing error:', error);
    res.status(500).json({
      error: 'エラーが発生しました',
      message: error.message,
    });
  }
});

module.exports = router;