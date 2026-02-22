'use strict';

const path = require('path');
const fs = require('fs');
const { downloadMedia, guessSubjectFromGroup, detectTaskKeywords } = require('./client');
const { createWhatsAppFile, createTask, createOCRRecord } = require('../database/db');
const { processImage } = require('../ocr/gemini');
const { sendErrorNotification } = require('../telegram/bot');

const DOCS_DIR = path.join(__dirname, '../../downloads/documents');
const IMGS_DIR = path.join(__dirname, '../../downloads/images');

// 監視対象グループ（env変数で上書き可能）
function getMonitoredGroups() {
  const envGroups = process.env.MONITORED_GROUPS;
  if (envGroups) {
    return envGroups.split(',').map((g) => g.trim().toLowerCase());
  }
  return [
    'official 3b',
    'open chat 3b',
    'main study group',
    'surgery',
    'internal medicine',
    'pediatrics',
    'ob-gyn',
    'obstetrics',
  ];
}

/**
 * グループが監視対象かどうか判定
 */
function isMonitoredGroup(groupName) {
  if (!groupName) return false;
  const lower = groupName.toLowerCase();
  return getMonitoredGroups().some((g) => lower.includes(g));
}

/**
 * ファイル名を安全な形式に変換
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._\-\u3040-\u30FF\u4E00-\u9FFF]/g, '_').substring(0, 100);
}

/**
 * Whapi Webhookメッセージを処理
 */
async function handleWhapiWebhook(req, res) {
  // 200を即返してWhapiのタイムアウトを避ける
  res.status(200).json({ status: 'ok' });

  try {
    const payload = req.body;
    const messages = payload.messages || [];

    for (const message of messages) {
      await processMessage(message);
    }
  } catch (err) {
    console.error('[Webhook] Error processing messages:', err.message);
    try {
      await sendErrorNotification('Webhook処理エラー', err);
    } catch (_) {}
  }
}

/**
 * 個別メッセージを処理
 */
async function processMessage(message) {
  const chatName = message.chat_name || message.from_name || '';
  const groupName = chatName;

  if (!isMonitoredGroup(groupName)) return;

  const subject = guessSubjectFromGroup(groupName);
  const msgType = message.type;

  console.log(`[Webhook] Message from "${groupName}" type=${msgType}`);

  if (msgType === 'document') {
    await handleDocument(message, groupName, subject);
  } else if (msgType === 'image') {
    await handleImage(message, groupName, subject);
  } else if (msgType === 'text') {
    await handleText(message, groupName, subject);
  }
}

/**
 * ドキュメントメッセージの処理
 */
async function handleDocument(message, groupName, subject) {
  try {
    const doc = message.document || {};
    const mediaUrl = doc.link || message.media_url;
    if (!mediaUrl) return;

    const originalName = doc.file_name || `doc_${message.id}`;
    const safeFilename = sanitizeFilename(originalName);
    const destPath = path.join(DOCS_DIR, safeFilename);

    await downloadMedia(mediaUrl, destPath);

    const fileId = createWhatsAppFile({
      filename: safeFilename,
      subject: subject || groupName,
      group_name: groupName,
      file_type: 'document',
      file_path: destPath,
      mime_type: doc.mime_type || 'application/octet-stream',
    });

    console.log(`[Webhook] Document saved: ${safeFilename} (id=${fileId})`);
  } catch (err) {
    console.error('[Webhook] Document handling error:', err.message);
  }
}

/**
 * 画像メッセージの処理（OCR付き）
 */
async function handleImage(message, groupName, subject) {
  try {
    const img = message.image || {};
    const mediaUrl = img.link || message.media_url;
    if (!mediaUrl) return;

    const ext = (img.mime_type || 'image/jpeg').includes('png') ? '.png' : '.jpg';
    const safeFilename = sanitizeFilename(`img_${message.id}${ext}`);
    const destPath = path.join(IMGS_DIR, safeFilename);

    await downloadMedia(mediaUrl, destPath);

    const fileId = createWhatsAppFile({
      filename: safeFilename,
      subject: subject || groupName,
      group_name: groupName,
      file_type: 'image',
      file_path: destPath,
      mime_type: img.mime_type || 'image/jpeg',
    });

    // Gemini OCR処理
    try {
      const ocrText = await processImage(destPath);
      if (ocrText) {
        createOCRRecord({
          file_id: fileId,
          filename: safeFilename,
          subject: subject || groupName,
          group_name: groupName,
          file_path: destPath,
          ocr_text: ocrText,
        });
        console.log(`[Webhook] Image OCR complete: ${safeFilename}`);
      }
    } catch (ocrErr) {
      console.error('[Webhook] OCR error:', ocrErr.message);
    }
  } catch (err) {
    console.error('[Webhook] Image handling error:', err.message);
  }
}

/**
 * テキストメッセージの処理（タスク検出）
 */
async function handleText(message, groupName, subject) {
  try {
    const text = message.text?.body || message.body || '';
    if (!text) return;

    if (detectTaskKeywords(text)) {
      // 締切日時を簡易パース（例: "due Feb 27", "deadline: 2/27"）
      const deadline = parseDateFromText(text);

      createTask({
        title: text.substring(0, 200),
        description: text,
        deadline: deadline,
        source: 'whatsapp',
        group_name: groupName,
        message_id: message.id,
      });

      console.log(`[Webhook] Task detected in "${groupName}": ${text.substring(0, 80)}`);
    }
  } catch (err) {
    console.error('[Webhook] Text handling error:', err.message);
  }
}

/**
 * テキストから日付を簡易パース
 */
function parseDateFromText(text) {
  try {
    // "Feb 27", "February 27", "2/27", "02/27" パターン
    const patterns = [
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i,
      /(\d{1,2})\/(\d{1,2})/,
      /deadline[:\s]+([^\n,]+)/i,
      /due[:\s]+([^\n,]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = new Date(match[0]);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
    }
  } catch (_) {}
  return null;
}

module.exports = { handleWhapiWebhook };
