const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');

class FileManager {
  constructor() {
    this.tempDir = config.glitch.isGlitch ? config.glitch.tempDir : path.join(__dirname, '../../tmp');
    this.init();
    this.startCleanupInterval();
  }

  async init() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`Temporary directory created: ${this.tempDir}`);
    } catch (error) {
      console.error('Failed to create temporary directory:', error);
      throw error;
    }
  }

  async saveTempFile(buffer, extension) {
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
    const filePath = path.join(this.tempDir, fileName);
    
    try {
      await fs.writeFile(filePath, buffer);
      console.log(`Temporary file saved: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to save temporary file:', error);
      throw error;
    }
  }

  async deleteTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`Temporary file deleted: ${filePath}`);
    } catch (error) {
      console.error('Failed to delete temporary file:', error);
      // エラーは記録するだけで続行
    }
  }

  async cleanupTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        // 1時間以上前のファイルを削除
        if (now - stats.mtimeMs > 60 * 60 * 1000) {
          await this.deleteTempFile(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup temporary files:', error);
    }
  }

  startCleanupInterval() {
    // Glitch環境の場合のみ定期クリーンアップを実行
    if (config.glitch.isGlitch) {
      setInterval(() => {
        this.cleanupTempFiles().catch(console.error);
      }, config.glitch.cleanupInterval);
      
      console.log(`Cleanup interval started: ${config.glitch.cleanupInterval}ms`);
    }
  }

  // ファイルサイズのチェック
  async checkFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > config.glitch.maxFileSize) {
        throw new Error(`File size exceeds limit: ${stats.size} bytes`);
      }
      return true;
    } catch (error) {
      console.error('File size check failed:', error);
      throw error;
    }
  }

  // Base64文字列からファイルを保存
  async saveBase64File(base64String, extension) {
    const buffer = Buffer.from(base64String, 'base64');
    return this.saveTempFile(buffer, extension);
  }

  // ファイルをBase64文字列として読み込み
  async readFileAsBase64(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      return buffer.toString('base64');
    } catch (error) {
      console.error('Failed to read file as base64:', error);
      throw error;
    }
  }
}

module.exports = new FileManager();