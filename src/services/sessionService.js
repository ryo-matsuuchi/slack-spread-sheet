class SessionService {
  constructor() {
    this.sessions = new Map();
    this.timeout = 5 * 60 * 1000; // 5分でセッション期限切れ
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
      for (const [key, session] of this.sessions.entries()) {
        if (now - session.timestamp > this.timeout) {
          console.log('Cleaning up expired session:', key);
          this.clearSession(key);
        }
      }
    }, 60 * 1000); // 1分ごとにクリーンアップ
  }

  /**
   * 現在のセッション一覧を取得（デバッグ用）
   * @returns {Object} セッション一覧
   */
  debugGetSessions() {
    const sessions = {};
    for (const [key, session] of this.sessions.entries()) {
      sessions[key] = {
        ...session,
        age: Math.round((Date.now() - session.timestamp) / 1000) + '秒',
        expires: Math.round((this.timeout - (Date.now() - session.timestamp)) / 1000) + '秒後',
      };
    }
    return sessions;
  }
}

module.exports = new SessionService();