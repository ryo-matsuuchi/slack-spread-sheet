class SessionService {
  constructor() {
    this.sessions = new Map();
    this.userStates = new Map(); // ユーザーの処理状態を管理
    this.timeout = 5 * 60 * 1000; // 5分でセッション期限切れ
  }

  /**
   * ユーザーの処理状態を設定
   * @param {string} userId - SlackユーザーID
   * @param {string} state - 処理状態 ('exporting' | 'creating' | null)
   * @returns {void}
   */
  setUserState(userId, state) {
    if (state === null) {
      this.userStates.delete(userId);
    } else {
      this.userStates.set(userId, {
        state,
        timestamp: Date.now()
      });
    }
  }

  /**
   * ユーザーの処理状態を取得
   * @param {string} userId - SlackユーザーID
   * @returns {Object|null} 処理状態の情報
   */
  getUserState(userId) {
    const state = this.userStates.get(userId);
    if (!state) {
      return null;
    }

    // タイムアウトチェック
    if (Date.now() - state.timestamp > this.timeout) {
      this.userStates.delete(userId);
      return null;
    }

    return state;
  }

  /**
   * ユーザーの処理状態に応じたメッセージを取得
   * @param {string} userId - SlackユーザーID
   * @returns {string|null} エラーメッセージ（処理中でない場合はnull）
   */
  getUserStateMessage(userId) {
    const state = this.getUserState(userId);
    if (!state) {
      return null;
    }

    switch (state.state) {
      case 'exporting':
        return '現在PDFの出力中です。完了までお待ちください。';
      case 'creating':
        return '現在経費精算書の作成中です。完了までお待ちください。';
      default:
        return null;
    }
  }

  /**
   * アップロード設定を保存
   * @param {string} userId - SlackユーザーID
   * @param {string} channelId - SlackチャンネルID
   * @param {Object} settings - アップロード設定
   * @returns {void}
   */
  saveUploadSettings(userId, channelId, settings) {
    console.log('Saving upload settings:', { userId, channelId, settings });
    const key = this.getSessionKey(userId, channelId);
    const session = {
      settings,
      timestamp: Date.now(),
      status: 'waiting_for_file', // ファイル待ち状態
    };
    this.sessions.set(key, session);
    console.log('Session saved:', this.sessions.get(key));

    // タイムアウト設定
    setTimeout(() => {
      this.clearSession(key);
    }, this.timeout);
  }

  /**
   * アップロード設定を取得
   * @param {string} userId - SlackユーザーID
   * @param {string} channelId - SlackチャンネルID
   * @returns {Object|null} 保存された設定またはnull
   */
  getUploadSettings(userId, channelId) {
    console.log('Getting upload settings for:', { userId, channelId });
    const key = this.getSessionKey(userId, channelId);
    const session = this.sessions.get(key);
    console.log('Found session:', session);

    if (!session) {
      console.log('No session found');
      return null;
    }

    // タイムアウトチェック
    if (Date.now() - session.timestamp > this.timeout) {
      console.log('Session expired');
      this.clearSession(key);
      return null;
    }

    return session.settings;
  }

  /**
   * セッションをクリア
   * @param {string} key - セッションキー
   */
  clearSession(key) {
    console.log('Clearing session:', key);
    if (this.sessions.has(key)) {
      this.sessions.delete(key);
      console.log('Session cleared');
    }
  }

  /**
   * セッションの状態を確認
   * @param {string} userId - SlackユーザーID
   * @param {string} channelId - SlackチャンネルID
   * @returns {boolean} ファイル待ち状態かどうか
   */
  isWaitingForFile(userId, channelId) {
    console.log('Checking file wait status for:', { userId, channelId });
    const key = this.getSessionKey(userId, channelId);
    const session = this.sessions.get(key);
    console.log('Found session:', session);

    if (!session) {
      console.log('No session found');
      return false;
    }

    // タイムアウトチェック
    if (Date.now() - session.timestamp > this.timeout) {
      console.log('Session expired');
      this.clearSession(key);
      return false;
    }

    const isWaiting = session.status === 'waiting_for_file';
    console.log('Is waiting for file:', isWaiting);
    return isWaiting;
  }

  /**
   * セッションキーを生成
   * @param {string} userId - SlackユーザーID
   * @param {string} channelId - SlackチャンネルID
   * @returns {string} セッションキー
   */
  getSessionKey(userId, channelId) {
    return `${userId}:${channelId}`;
  }

  /**
   * 全セッションの定期クリーンアップ
   */
  startCleanupInterval() {
    console.log('Starting session cleanup interval');
    setInterval(() => {
      console.log('Running session cleanup');
      const now = Date.now();

      // セッションのクリーンアップ
      for (const [key, session] of this.sessions.entries()) {
        if (now - session.timestamp > this.timeout) {
          console.log('Cleaning up expired session:', key);
          this.clearSession(key);
        }
      }

      // ユーザー状態のクリーンアップ
      for (const [userId, state] of this.userStates.entries()) {
        if (now - state.timestamp > this.timeout) {
          console.log('Cleaning up expired user state:', userId);
          this.userStates.delete(userId);
        }
      }
    }, 60 * 1000); // 1分ごとにクリーンアップ
  }

  /**
   * 現在のセッションと状態一覧を取得（デバッグ用）
   * @returns {Object} セッションと状態の一覧
   */
  debugGetSessions() {
    const now = Date.now();
    const debug = {
      sessions: {},
      userStates: {}
    };

    // セッション情報
    for (const [key, session] of this.sessions.entries()) {
      debug.sessions[key] = {
        ...session,
        age: Math.round((now - session.timestamp) / 1000) + '秒',
        expires: Math.round((this.timeout - (now - session.timestamp)) / 1000) + '秒後',
      };
    }

    // ユーザー状態情報
    for (const [userId, state] of this.userStates.entries()) {
      debug.userStates[userId] = {
        ...state,
        age: Math.round((now - state.timestamp) / 1000) + '秒',
        expires: Math.round((this.timeout - (now - state.timestamp)) / 1000) + '秒後',
      };
    }

    return debug;
  }
}

module.exports = new SessionService();