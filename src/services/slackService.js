const config = require('../config/config');
const sheetsService = require('./sheetsService');
const driveService = require('./driveService');
const settingsService = require('./settingsService');
const exportService = require('./exportService');
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

    // サーバー状態チェックミドルウェア
    this.app.use(async ({ next }) => {
      if (!this.app.isServerReady()) {
        throw new Error('サーバーの準備が完了していません。しばらく待ってから再度お試しください。');
      }
      await next();
    });

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
        await client.chat.postMessage({
          channel: options.userId,
          text: `エラーが発生しました: ${error.message}\nもう一度お試しください。`,
        });
      }
    }
  }

  async initializeCommands() {
    debugLog('Initializing commands');

    // /keihi コマンド
    this.app.command('/keihi', async ({ command, ack, client }) => {
      debugLog('Received /keihi command:', { command_text: command.text, user_id: command.user_id });
      await ack();

      try {
        // サーバーの状態をチェック
        if (!this.app.isServerReady()) {
          throw new Error('サーバーが起動していません。しばらく待ってから再度お試しください。');
        }

        // コマンドテキストを解析
        const text = command.text.trim();
        let subCommand = '';
        let args = [];

        if (text) {
          const parts = text.split(/\s+/);
          subCommand = parts[0].toLowerCase();
          args = parts.slice(1);
          debugLog('Parsed command:', { text, subCommand, args });
        } else {
          debugLog('No command text provided, using default command');
          subCommand = '';
        }

        debugLog('Processing command:', { subCommand, args, user_id: command.user_id });

        // コマンドの処理
        switch (subCommand) {
          case 'help':
            debugLog('Processing help command');
            await client.chat.postMessage({
              channel: command.user_id,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: '*経費精算書作成ボットの使い方*'
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: '*初期設定*\n1. 経費精算用のGoogleスプレッドシートを作成\n2. スプレッドシートに`_base`シートを作成（テンプレート用）\n3. アプリケーションのサービスアカウントに編集権限を付与\n4. `/keihi setup [スプレッドシートID]`を実行'
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: '*使用可能なコマンド*\n• `/keihi setup [スプレッドシートID]` - スプレッドシートを設定\n• `/keihi config` - 現在の設定を確認\n• `/keihi` - 経費を登録（直接入力）\n• `/keihi status [YYYY-MM]` - 登録状況を確認\n• `/keihi list [YYYY-MM]` - 登録一覧を表示\n• `/keihi export [YYYY-MM]` - 経費精算書をPDFに出力（領収書も含む）\n• `/keihi help` - このヘルプを表示'
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: '*領収書添付での登録*\n1. Slackに領収書（PDFまたは画像）をアップロード\n2. メッセージの「その他のアクション」から「経費精算書の作成」を選択\n3. フォームに必要事項を入力して送信'
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: '*注意事項*\n• スプレッドシートには`_base`シートが必要です\n• アプリケーションに編集権限を付与してください\n• 領収書はユーザーごとにGoogle Driveで管理されます'
                  }
                }
              ]
            });
            debugLog('Help message sent');
            return;

          case 'setup':
            debugLog('Processing setup command');
            const spreadsheetId = args[0];
            if (!spreadsheetId) {
              throw new Error('スプレッドシートIDを指定してください。\n使用例: `/keihi setup [スプレッドシートID]`');
            }
            if (!settingsService.isValidSpreadsheetId(spreadsheetId)) {
              throw new Error('無効なスプレッドシートIDです。');
            }

            // メールアドレスを取得
            const userInfo = await client.users.info({ user: command.user_id });
            const email = userInfo.user.profile.email;

            // 設定を保存
            await settingsService.saveUserSettings(command.user_id, {
              spreadsheet_id: spreadsheetId,
              email: email
            });

            await client.chat.postMessage({
              channel: command.user_id,
              text: 'スプレッドシートの設定が完了しました。'
            });
            debugLog('Setup completed');
            return;

          case 'config':
            debugLog('Processing config command');
            const settings = await settingsService.getUserSettings(command.user_id);
            if (!settings) {
              throw new Error('スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。');
            }

            await client.chat.postMessage({
              channel: command.user_id,
              text: `現在の設定:\nスプレッドシートID: ${settings.spreadsheet_id}\nメールアドレス: ${settings.email}`
            });
            debugLog('Config displayed');
            return;

          case 'status':
            debugLog('Processing status command');
            const statusSettings = await settingsService.getUserSettings(command.user_id);
            if (!statusSettings) {
              throw new Error('スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。');
            }

            const statusYearMonth = args[0] || new Date().toISOString().substring(0, 7);
            const status = await sheetsService.getStatus(command.user_id, statusYearMonth);

            await client.chat.postMessage({
              channel: command.user_id,
              text: `${statusYearMonth}の登録状況:\n• 登録件数: ${status.count}件\n• 合計金額: ¥${status.total.toLocaleString()}\n• 最終更新: ${status.lastUpdate || 'なし'}\n\n<${status.sheetUrl}|スプレッドシートで開く>`
            });
            debugLog('Status displayed');
            return;

          case 'list':
            debugLog('Processing list command');
            const listSettings = await settingsService.getUserSettings(command.user_id);
            if (!listSettings) {
              throw new Error('スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。');
            }

            const listYearMonth = args[0] || new Date().toISOString().substring(0, 7);
            const list = await sheetsService.getList(command.user_id, listYearMonth);

            const entries = list.entries.map(entry =>
              `• ${entry.date}: ¥${entry.amount.toLocaleString()} - ${entry.details}`
            ).join('\n');

            await client.chat.postMessage({
              channel: command.user_id,
              text: `${listYearMonth}の登録一覧:\n${entries || 'データがありません'}\n\n<${list.sheetUrl}|スプレッドシートで開く>`
            });
            debugLog('List displayed');
            return;

          case 'export':
            debugLog('Processing export command');
            const exportSettings = await settingsService.getUserSettings(command.user_id);
            if (!exportSettings) {
              throw new Error('スプレッドシートが設定されていません。/keihi setup [スプレッドシートID] で設定してください。');
            }

            // 年月の取得（指定がない場合は現在の年月）
            const exportYearMonth = args[0] || new Date().toISOString().substring(0, 7);
            
            // 即座に応答を返す
            const initialMessage = await client.chat.postMessage({
              channel: command.user_id,
              text: `${exportYearMonth}の経費精算書のPDF出力を開始しました。完了までしばらくお待ちください...`
            });

            // 非同期でPDFを生成
            exportService.exportExpenseReport(command.user_id, exportYearMonth)
              .then(async ({ pdfBuffer, fileUrl }) => {
                // 成功時：PDFをアップロードしてスレッドで通知
                await client.files.upload({
                  channels: command.user_id,
                  thread_ts: initialMessage.ts,
                  filename: `経費精算書_${exportYearMonth}.pdf`,
                  filetype: 'pdf',
                  file: pdfBuffer,
                  initial_comment: `${exportYearMonth}の経費精算書をPDFに出力しました。\n\nGoogle Driveにも保存しました: <${fileUrl}|リンク>`
                });
              })
              .catch(async (error) => {
                // エラー時：スレッドでエラーを通知
                await client.chat.postMessage({
                  channel: command.user_id,
                  thread_ts: initialMessage.ts,
                  text: `PDFの出力中にエラーが発生しました: ${error.message}`
                });
              });

            debugLog('Export process started');
            return;

          default:
            // 無効なコマンドの場合はヘルプを表示
            if (subCommand && !['add', 'export'].includes(subCommand)) {
              debugLog('Invalid command received:', { subCommand });
              throw new Error('無効なコマンドです。`/keihi help`でヘルプを表示します。');
            }

            // デフォルトの処理（直接入力）
            debugLog('Opening expense modal for direct input');
            await this.openExpenseModal(client, command.trigger_id, {
              hasFile: false,
              userId: command.user_id,
              channelId: command.channel_id,
            });
            debugLog('Modal opened');
            return;
        }
      } catch (error) {
        errorLog('Error handling command:', error);
        await client.chat.postMessage({
          channel: command.user_id,
          text: `エラーが発生しました: ${error.message}`
        });
      }
    });

    debugLog('Commands initialized');
  }

  async initializeShortcuts() {
    debugLog('Initializing shortcuts');

    // メッセージショートカットの処理
    this.app.shortcut('create_expense_entry', async ({ shortcut, ack, client }) => {
      await ack();
      debugLog('Handling create_expense_entry shortcut');

      try {
        // サーバーの状態をチェック
        if (!this.app.isServerReady()) {
          throw new Error('サーバーが起動していません。しばらく待ってから再度お試しください。');
        }

        debugLog('Shortcut payload:', JSON.stringify(shortcut, null, 2));

        // メッセージの情報を取得
        const message = shortcut.message;
        if (!message.files || message.files.length === 0) {
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
          await client.chat.postMessage({
            channel: shortcut.user.id,
            text: `エラーが発生しました: ${error.message}`
          });
        }
      }
    });

    // ファイル添付ありのモーダル送信処理
    this.app.view('expense_modal', async ({ ack, body, view, client }) => {
      await ack();
      debugLog('Handling expense_modal submission');

      try {
        // サーバーの状態をチェック
        if (!this.app.isServerReady()) {
          throw new Error('サーバーが起動していません。しばらく待ってから再度お試しください。');
        }

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
          throw new Error('金額を入力してください。');
        }

        // 即座に処理開始メッセージを送信
        const initialMessage = await client.chat.postMessage({
          channel: userId,
          text: '経費精算書の作成を開始しました。完了までしばらくお待ちください...'
        });

        // 非同期で処理を実行
        (async () => {
          try {
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
              thread_ts: initialMessage.ts,
              text: sheetResult.success
                ? `経費精算書を作成しました。\n${baseMessage}${links}`
                : `${sheetResult.message}\n${baseMessage}\n\n経費精算書を確認: ${sheetResult.sheetUrl}`,
            });

          } catch (error) {
            errorLog('Error processing expense:', error);
            await client.chat.postMessage({
              channel: userId,
              thread_ts: initialMessage.ts,
              text: `エラーが発生しました: ${error.message}`
            });
          }
        })();

      } catch (error) {
        errorLog('Error processing expense:', error);
        const metadata = JSON.parse(view.private_metadata);
        await client.chat.postMessage({
          channel: metadata.userId,
          text: `エラーが発生しました: ${error.message}`
        });
      }
    });

    // ファイル添付なしのモーダル送信処理
    this.app.view('expense_direct_modal', async ({ ack, body, view, client }) => {
      await ack();
      debugLog('Handling expense_direct_modal submission');

      try {
        // サーバーの状態をチェック
        if (!this.app.isServerReady()) {
          throw new Error('サーバーが起動していません。しばらく待ってから再度お試しください。');
        }

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
        await client.chat.postMessage({
          channel: metadata.userId,
          text: `エラーが発生しました: ${error.message}`
        });
      }
    });

    debugLog('Shortcuts initialized');
  }
}

module.exports = new SlackService();