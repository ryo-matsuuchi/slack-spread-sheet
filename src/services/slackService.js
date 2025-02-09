const config = require('../config/config');
const sheetsService = require('./sheetsService');
const driveService = require('./driveService');
// const ocrService = require('./ocrService'); // OCR機能は一時的に無効化
const axios = require('axios');

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

class SlackService {
  constructor() {
    this.app = null;
  }

  async initialize(app) {
    this.app = app;
    debugLog('Initializing SlackService');

    // エラーハンドリング
    this.app.error(async (error) => {
      errorLog('Slack app error:', error);
      
      // Socket Mode関連のエラーの場合、再接続を試みる
      if (error.code === 'slack_webapi_platform_error' && error.data?.error === 'not_allowed') {
        debugLog('Attempting to reconnect Socket Mode...');
        try {
          await this.app.client.apps.connections.open({
            token: process.env.SLACK_APP_TOKEN
          });
          debugLog('Successfully reconnected Socket Mode');
        } catch (reconnectError) {
          errorLog('Failed to reconnect Socket Mode:', reconnectError);
        }
      }
    });

    await this.initializeCommands();
    await this.initializeShortcuts();
    debugLog('SlackService initialized');
  }

  /**
   * エラーメッセージを送信する
   * @param {Object} client Slackクライアント
   * @param {string} userId ユーザーID
   * @param {Error} error エラーオブジェクト
   */
  async sendErrorMessage(client, userId, error) {
    try {
      errorLog('Error occurred:', error);
      await client.chat.postMessage({
        channel: userId,
        text: `エラーが発生しました: ${error.message}\nもう一度お試しください。`,
      });
    } catch (sendError) {
      errorLog('Failed to send error message:', sendError);
    }
  }

  /**
   * 経費入力用モーダルを表示する
   * @param {Object} client Slackクライアント
   * @param {string} triggerId トリガーID
   * @param {Object} options オプション（ファイル情報など）
   */
  async openExpenseModal(client, triggerId, options = {}) {
    try {
      debugLog('Opening expense modal with options:', options);
      const blocks = [
        {
          type: 'input',
          block_id: 'date_block',
          optional: true,
          element: {
            type: 'datepicker',
            action_id: 'date_input',
            initial_date: new Date().toISOString().split('T')[0],
            placeholder: {
              type: 'plain_text',
              text: '日付を選択',
            },
          },
          label: {
            type: 'plain_text',
            text: '日付',
          },
        },
        {
          type: 'input',
          block_id: 'amount_block',
          optional: false,
          element: {
            type: 'number_input',
            action_id: 'amount_input',
            is_decimal_allowed: false,
            placeholder: {
              type: 'plain_text',
              text: '金額を入力',
            },
          },
          label: {
            type: 'plain_text',
            text: '金額',
          },
        },
        {
          type: 'input',
          block_id: 'details_block',
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'details_input',
            placeholder: {
              type: 'plain_text',
              text: '利用目的/内容を入力',
            },
          },
          label: {
            type: 'plain_text',
            text: '利用目的/内容',
          },
        },
        {
          type: 'input',
          block_id: 'memo_block',
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'memo_input',
            placeholder: {
              type: 'plain_text',
              text: '備考を入力',
            },
          },
          label: {
            type: 'plain_text',
            text: '備考',
          },
        },
      ];

      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: options.hasFile ? 'expense_modal' : 'expense_direct_modal',
          private_metadata: JSON.stringify(options),
          title: {
            type: 'plain_text',
            text: '経費精算書の作成',
          },
          blocks: blocks,
          submit: {
            type: 'plain_text',
            text: '送信',
          },
        },
      });
      debugLog('Modal opened successfully');
    } catch (error) {
      errorLog('Error opening modal:', error);
      if (options.userId) {
        await this.sendErrorMessage(client, options.userId, error);
      }
    }
  }

  async initializeCommands() {
    debugLog('Initializing commands');
    // /keihi コマンド
    this.app.command('/keihi', async ({ command, ack, client }) => {
      try {
        await ack();
        debugLog('Handling /keihi command');

        await this.openExpenseModal(client, command.trigger_id, {
          hasFile: false,
          userId: command.user_id,
          channelId: command.channel_id,
        });
      } catch (error) {
        errorLog('Error handling /keihi command:', error);
        await this.sendErrorMessage(client, command.user_id, error);
      }
    });
    debugLog('Commands initialized');
  }

  async initializeShortcuts() {
    debugLog('Initializing shortcuts');
    // メッセージショートカットの処理
    this.app.shortcut('create_expense_entry', async ({ shortcut, ack, client }) => {
      try {
        await ack();
        debugLog('Handling create_expense_entry shortcut');
        debugLog('Shortcut payload:', JSON.stringify(shortcut, null, 2));

        // メッセージの情報を取得
        const message = shortcut.message;
        if (!message.files || message.files.length === 0) {
          debugLog('No files attached to message');
          throw new Error('このメッセージにはファイルが添付されていません。');
        }

        const file = message.files[0];
        debugLog('File info:', JSON.stringify(file, null, 2));

        await this.openExpenseModal(client, shortcut.trigger_id, {
          hasFile: true,
          fileId: file.id,
          fileName: file.name,
          fileType: file.mimetype,
          fileUrl: file.url_private,
          channelId: shortcut.channel.id,
          userId: shortcut.user.id,
          messageTs: message.ts
        });
      } catch (error) {
        errorLog('Error handling shortcut:', error);
        if (shortcut.user && shortcut.user.id) {
          await this.sendErrorMessage(client, shortcut.user.id, error);
        }
      }
    });

    // ファイル添付ありのモーダル送信処理
    this.app.view('expense_modal', async ({ ack, body, view, client }) => {
      try {
        await ack();
        debugLog('Handling expense_modal submission');
        debugLog('View payload:', JSON.stringify(view, null, 2));
        debugLog('Body payload:', JSON.stringify(body, null, 2));

        const metadata = JSON.parse(view.private_metadata);
        debugLog('Metadata:', JSON.stringify(metadata, null, 2));

        const { fileId, fileName, fileType, fileUrl, channelId, userId, messageTs } = metadata;
        const values = view.state.values;

        const date = values.date_block.date_input.selected_date || new Date().toISOString().split('T')[0];
        const amount = values.amount_block.amount_input.value ? parseInt(values.amount_block.amount_input.value, 10) : null;
        const details = values.details_block.details_input.value;
        const memo = values.memo_block.memo_input.value;

        // 金額が未入力の場合はエラー
        if (!amount) {
          debugLog('Amount is empty');
          throw new Error('金額を入力してください。');
        }

        debugLog('Downloading file from URL:', fileUrl);
        // ファイルのダウンロード
        const response = await axios.get(fileUrl, {
          headers: {
            'Authorization': `Bearer ${config.slack.botToken}`
          },
          responseType: 'arraybuffer'
        });

        if (response.status !== 200) {
          throw new Error('ファイルのダウンロードに失敗しました');
        }

        const fileContent = Buffer.from(response.data);

        // Google Driveにアップロード
        debugLog('Uploading file to Google Drive');
        const driveFile = await driveService.uploadFile(
          userId,
          date.substring(0, 7), // YYYY-MM
          fileContent,
          fileName,
          fileType
        );

        // スプレッドシートに登録
        debugLog('Adding entry to spreadsheet');
        const sheetResult = await sheetsService.addEntry({
          userId: userId,
          date: date,
          amount: amount,
          details: details || '（内容なし）',
          memo: memo || '',
          fileUrl: driveFile.webViewLink,
        });

        // 完了メッセージを送信
        const baseMessage = `• 日付: ${date}\n• 金額: ¥${amount.toLocaleString()}\n• 内容: ${details || '（内容なし）'}\n• メモ: ${memo || '（なし）'}`;
        const links = `\n\n<${sheetResult.sheetUrl}|スプレッドシートで開く> | <${driveFile.webViewLink}|領収書を確認>`;

        debugLog('Sending completion message');
        await client.chat.postMessage({
          channel: userId,
          text: sheetResult.success
            ? `経費精算書を作成しました。\n${baseMessage}${links}`
            : `${sheetResult.message}\n${baseMessage}\n\n経費精算書を確認: ${sheetResult.sheetUrl}`,
        });

      } catch (error) {
        errorLog('Error processing expense:', error);
        const metadata = JSON.parse(view.private_metadata);
        await this.sendErrorMessage(client, metadata.userId, error);
      }
    });

    // ファイル添付なしのモーダル送信処理
    this.app.view('expense_direct_modal', async ({ ack, body, view, client }) => {
      try {
        await ack();
        debugLog('Handling expense_direct_modal submission');
        debugLog('View payload:', JSON.stringify(view, null, 2));
        debugLog('Body payload:', JSON.stringify(body, null, 2));

        const metadata = JSON.parse(view.private_metadata);
        debugLog('Metadata:', JSON.stringify(metadata, null, 2));

        const { userId } = metadata;
        const values = view.state.values;

        const date = values.date_block.date_input.selected_date || new Date().toISOString().split('T')[0];
        const amount = values.amount_block.amount_input.value ? parseInt(values.amount_block.amount_input.value, 10) : null;
        const details = values.details_block.details_input.value;
        const memo = values.memo_block.memo_input.value;

        // 金額が未入力の場合はエラー
        if (!amount) {
          debugLog('Amount is empty');
          throw new Error('金額を入力してください。');
        }

        // スプレッドシートに登録
        debugLog('Adding entry to spreadsheet');
        const sheetResult = await sheetsService.addEntry({
          userId: userId,
          date: date,
          amount: amount,
          details: details || '（内容なし）',
          memo: memo || '',
          fileUrl: '', // ファイルなし
        });

        // 完了メッセージを送信
        const baseMessage = `• 日付: ${date}\n• 金額: ¥${amount.toLocaleString()}\n• 内容: ${details || '（内容なし）'}\n• メモ: ${memo || '（なし）'}`;
        const links = `\n\n<${sheetResult.sheetUrl}|スプレッドシートで開く>`;

        debugLog('Sending completion message');
        await client.chat.postMessage({
          channel: userId,
          text: sheetResult.success
            ? `経費精算書を作成しました。\n${baseMessage}${links}`
            : `${sheetResult.message}\n${baseMessage}\n\n経費精算書を確認: ${sheetResult.sheetUrl}`,
        });

      } catch (error) {
        errorLog('Error processing expense:', error);
        const metadata = JSON.parse(view.private_metadata);
        await this.sendErrorMessage(client, metadata.userId, error);
      }
    });

    debugLog('Shortcuts initialized');
  }
}

module.exports = new SlackService();