import axios from 'axios';

/**
 * Whapi API クライアント
 */
export class WhapiClient {
  constructor() {
    this.token = process.env.WHAPI_TOKEN;
    this.baseUrl = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

    if (!this.token) {
      throw new Error('WHAPI_TOKEN is not set');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * メディアファイルをダウンロード
   */
  async downloadMedia(mediaId) {
    try {
      const response = await this.client.get(`/media/${mediaId}`, {
        responseType: 'arraybuffer'
      });
      return response.data;
    } catch (error) {
      console.error('Failed to download media:', error);
      throw error;
    }
  }

  /**
   * メッセージを送信
   */
  async sendMessage(to, body) {
    try {
      const response = await this.client.post('/messages/text', {
        to,
        body
      });
      return response.data;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * グループ情報を取得
   */
  async getGroup(groupId) {
    try {
      const response = await this.client.get(`/groups/${groupId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get group info:', error);
      throw error;
    }
  }

  /**
   * すべてのグループを取得
   */
  async getGroups() {
    try {
      const response = await this.client.get('/groups');
      return response.data;
    } catch (error) {
      console.error('Failed to get groups:', error);
      throw error;
    }
  }
}

/**
 * 監視対象のグループかチェック
 */
export function isMonitoredGroup(groupName) {
  const monitoredGroups = process.env.MONITORED_GROUPS?.split(',').map(g => g.trim()) || [];
  return monitoredGroups.some(name => groupName.includes(name));
}

/**
 * ファイルタイプを判定
 */
export function getFileType(mimeType, filename) {
  if (mimeType?.startsWith('image/')) {
    return 'image';
  }

  const docExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
  const ext = filename?.toLowerCase().match(/\.[^.]+$/)?.[0];

  if (ext && docExtensions.includes(ext)) {
    return 'document';
  }

  return 'other';
}

/**
 * 科目名を抽出（簡易版）
 */
export function extractSubject(text) {
  const subjects = [
    'Surgery', 'Internal Medicine', 'Pediatrics', 'Obstetrics',
    'Gynecology', 'Psychiatry', 'Radiology', 'Pathology',
    'Anatomy', 'Physiology', 'Biochemistry', 'Pharmacology'
  ];

  for (const subject of subjects) {
    if (text?.includes(subject)) {
      return subject;
    }
  }

  return null;
}
