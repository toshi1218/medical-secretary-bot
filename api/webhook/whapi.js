import { WhapiClient, isMonitoredGroup, getFileType, extractSubject } from '../../lib/whapi.js';
import { uploadFile } from '../../lib/supabase.js';
import { createWhatsAppFile, createOCRRecord, upsertWhatsAppMessage } from '../../lib/db.js';
import { extractTextFromImage, extractSubjectFromOCR } from '../../lib/gemini.js';
import { sendCustomNotification } from '../../lib/telegram.js';

export default async function handler(req, res) {
  const requestStartedAt = Date.now();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[whapi] request_received', {
      at: new Date().toISOString(),
      method: req.method
    });
    const payload = req.body;

    let messages = [];
    if (payload?.messages && Array.isArray(payload.messages)) {
      messages = payload.messages;
    } else if (payload?.event && payload?.data) {
      messages = [payload.data];
    } else if (payload?.type) {
      messages = [payload];
    }

    if (messages.length === 0) {
      return res.status(200).json({ success: true, message: 'No messages to process' });
    }

    const whapiClient = new WhapiClient();

    for (const message of messages) {
      const messageStartedAt = Date.now();
      try {
        const groupName = message.chat_name || message.from_name || '';
        const chatId = message.chat_id || message.from || '';

        if (!chatId.includes('@g.us') && !groupName) {
          continue;
        }

        if (groupName && !isMonitoredGroup(groupName)) {
          continue;
        }

        if (message.type === 'document' || message.type === 'image') {
          await handleMediaMessage(message, groupName, whapiClient);
        }

        if (message.type === 'text') {
          await handleTextMessage(message, groupName, chatId);
        }
        console.log('[whapi] message_processed', {
          type: message.type || 'unknown',
          groupName: groupName || null,
          chatId: chatId || null,
          durationMs: Date.now() - messageStartedAt
        });
      } catch (error) {
        console.error('Error processing message:', error);
        await sendCustomNotification('WhatsApp処理エラー', `メッセージ処理中にエラー: ${error.message}`);
      }
    }

    console.log('[whapi] request_completed', {
      messages: messages.length,
      durationMs: Date.now() - requestStartedAt
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleMediaMessage(message, groupName, whapiClient) {
  const mediaId = message.media?.id || message.document?.id || message.image?.id;
  const filename = message.media?.filename || message.document?.filename || `image_${Date.now()}.jpg`;
  const mimeType = message.media?.mime_type || message.document?.mime_type || 'image/jpeg';

  if (!mediaId) {
    console.log('No media ID found');
    return;
  }

  const fileType = getFileType(mimeType, filename);
  const mediaBuffer = await whapiClient.downloadMedia(mediaId);

  const bucket = fileType === 'image' ? 'whatsapp-images' : 'whatsapp-documents';
  const path = `${groupName || 'unknown-group'}/${Date.now()}_${filename}`;

  const { publicUrl } = await uploadFile(bucket, path, mediaBuffer, mimeType);
  const subject = extractSubject(filename) || extractSubject(message.text || '');

  await createWhatsAppFile({
    filename,
    subject,
    group_name: groupName || 'unknown-group',
    file_type: fileType,
    file_url: publicUrl
  });

  if (fileType === 'image') {
    try {
      const ocrText = await extractTextFromImage(mediaBuffer, mimeType);
      const extractedSubject = subject || extractSubjectFromOCR(ocrText);

      await createOCRRecord({
        filename,
        subject: extractedSubject,
        group_name: groupName || 'unknown-group',
        file_url: publicUrl,
        ocr_text: ocrText
      });

      await sendCustomNotification(
        `🖼 新しい画像 - ${groupName || 'unknown-group'}`,
        `ファイル: ${filename}\n教科: ${extractedSubject || '未判定'}\n\nOCR:\n${ocrText.substring(0, 300)}...`
      );
    } catch (ocrError) {
      console.error('OCR processing failed:', ocrError);
    }
  } else {
    await sendCustomNotification(
      `📄 新しいドキュメント - ${groupName || 'unknown-group'}`,
      `ファイル: ${filename}\n教科: ${subject || '未判定'}\nURL: ${publicUrl}`
    );
  }
}

function getTextBody(message) {
  if (typeof message.text === 'string') return message.text;
  if (typeof message.text?.body === 'string') return message.text.body;
  if (typeof message.body === 'string') return message.body;
  if (typeof message.caption === 'string') return message.caption;
  return '';
}

async function handleTextMessage(message, groupName, chatId) {
  const startedAt = Date.now();
  const text = getTextBody(message).trim();
  if (!text) return;

  const messageId = String(
    message.id ||
    message.message_id ||
    `${chatId || 'unknown'}:${message.timestamp || message.time || Date.now()}:${text.slice(0, 32)}`
  );
  const sender = message.from_name || message.pushname || 'Unknown';
  const source = groupName || chatId || 'unknown-chat';
  const ts = message.timestamp || message.time || message.created_at || Date.now();
  const messageTs = new Date(typeof ts === 'number' ? ts * 1000 : ts).toISOString();

  await upsertWhatsAppMessage({
    message_id: messageId,
    chat_id: chatId || 'unknown-chat',
    group_name: groupName || null,
    sender_name: sender,
    from_me: !!message.from_me,
    message_type: message.type || 'text',
    text_body: text,
    message_ts: messageTs,
    raw_payload: message
  });

  await sendCustomNotification(
    `💬 WhatsApp - ${source}`,
    `送信者: ${sender}\n${text}`
  );
  console.log('[whapi] text_forwarded', {
    source,
    sender,
    textLength: text.length,
    durationMs: Date.now() - startedAt
  });
}
