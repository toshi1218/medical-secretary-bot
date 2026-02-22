'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const WHAPI_BASE = 'https://gate.whapi.cloud';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHAPI_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * メッセージ一覧を取得
 */
async function getMessages(chatId, count = 20) {
  const response = await axios.get(`${WHAPI_BASE}/messages/list/${chatId}`, {
    headers: getHeaders(),
    params: { count },
    timeout: 15000,
  });
  return response.data;
}

/**
 * メディアファイルをダウンロード
 * @param {string} mediaUrl - Whapi提供のメディアURL
 * @param {string} destPath  - 保存先パス
 */
async function downloadMedia(mediaUrl, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const response = await axios.get(mediaUrl, {
    headers: getHeaders(),
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  fs.writeFileSync(destPath, response.data);
  return destPath;
}

/**
 * テキストメッセージを送信
 */
async function sendTextMessage(chatId, text) {
  const response = await axios.post(
    `${WHAPI_BASE}/messages/text`,
    { to: chatId, body: text },
    { headers: getHeaders(), timeout: 15000 }
  );
  return response.data;
}

/**
 * グループ名から科目名を推定
 * 例: "Surgery - Group 11" → "Surgery 2"
 */
function guessSubjectFromGroup(groupName) {
  if (!groupName) return null;
  const name = groupName.toLowerCase();

  const subjectMap = [
    { keywords: ['surgery'], subject: 'Surgery 2' },
    { keywords: ['internal med', 'im group', 'internal medicine'], subject: 'Internal Medicine' },
    { keywords: ['pediatric', 'pedia'], subject: 'Pediatrics' },
    { keywords: ['ob-gyn', 'obstetrics', 'ob gyn', 'obgyn'], subject: 'Obstetrics' },
    { keywords: ['gynecology', 'gynecol'], subject: 'Gynecology' },
    { keywords: ['psychiatry', 'psych'], subject: 'Psychiatry' },
    { keywords: ['ent', 'ear, nose'], subject: 'ENT' },
    { keywords: ['dermatology', 'derm'], subject: 'Dermatology' },
    { keywords: ['neurology', 'neuro'], subject: 'Neurology' },
    { keywords: ['radiology', 'radio'], subject: 'Radiology' },
    { keywords: ['ophthalmology', 'optha', 'ophth'], subject: 'Ophthalmology' },
    { keywords: ['legal medicine', 'legal med', 'medico'], subject: 'Legal Medicine' },
    { keywords: ['pcm', 'community medicine'], subject: 'PCM 3' },
    { keywords: ['official 3b', 'open chat 3b', '3b main', 'main study'], subject: null },
  ];

  for (const entry of subjectMap) {
    if (entry.keywords.some((kw) => name.includes(kw))) {
      return entry.subject;
    }
  }
  return null;
}

/**
 * テキストからキーワードを検出してタスク候補かどうか判定
 */
function detectTaskKeywords(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const keywords = ['exam', 'quiz', 'deadline', 'submit', 'due', 'report', 'assignment', 'homework', 'case', 'presentation'];
  return keywords.some((kw) => lower.includes(kw));
}

module.exports = {
  getMessages,
  downloadMedia,
  sendTextMessage,
  guessSubjectFromGroup,
  detectTaskKeywords,
};
