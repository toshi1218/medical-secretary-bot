import { WhapiClient, isMonitoredGroup, getFileType, extractSubject } from '../../lib/whapi.js';
import { uploadFile } from '../../lib/supabase.js';
import { createWhatsAppFile, createOCRRecord } from '../../lib/db.js';
import { extractTextFromImage, extractSubjectFromOCR } from '../../lib/gemini.js';
import { sendCustomNotification } from '../../lib/telegram.js';

/**
 * Whapi Webhook ハンドラー（Vercel Function）
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;

    // Whapiは messages 配列または単一メッセージオブジェクトを送信する
    let messages = [];
    if (payload.messages && Array.isArray(payload.messages)) {
      messages = payload.messages;
    } else if (payload.event && payload.data) {
      // イベント形式の場合
      messages = [payload.data];
    } else if (payload.type) {
      // 単一メッセージの場合
      messages = [payload];
    }

    if (messages.length === 0) {
      return res.status(200).json({ success: true, message: 'No messages to process' });
    }

    const whapiClient = new WhapiClient();

    for (const message of messages) {
      try {
        const groupName = message.chat_name || message.from_name || '';
        const chatId = message.chat_id || message.from || '';

        // グループメッセージのみ処理（グループIDは @g.us で終わる）
        if (!chatId.includes('@g.us') && !groupName) {
          continue;
        }

        if (groupName && !isMonitoredGroup(groupName)) {
          continue;
        }

        // ドキュメントまたは画像がある場合
        if (message.type === 'document' || message.type === 'image') {
          await handleMediaMessage(message, groupName, whapiClient);
        }

        // テキストメッセージから課題情報を抽出（今後実装）
        if (message.type === 'text') {
          await handleTextMessage(message, groupName);
        }

      } catch (error) {
        console.error('Error processing message:', error);
        await sendCustomNotification(
          'WhatsApp処理エラー',
          `メッセージ処理中にエラー: ${error.message}`
        );
      }
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * メディアメッセージを処理
 */
async function handleMediaMessage(message, groupName, whapiClient) {
  const mediaId = message.media?.id || message.document?.id || message.image?.id;
  const filename = message.media?.filename || message.document?.filename || `image_${Date.now()}.jpg`;
  const mimeType = message.media?.mime_type || message.document?.mime_type || 'image/jpeg';

  if (!mediaId) {
    console.log('No media ID found');
    return;
  }

  // ファイルタイプを判定
  const fileType = getFileType(mimeType, filename);

  // メディアをダウンロード
  const mediaBuffer = await whapiClient.downloadMedia(mediaId);

  // Supabase Storageにアップロード
  const bucket = fileType === 'image' ? 'whatsapp-images' : 'whatsapp-documents';
  const path = `${groupName}/${Date.now()}_${filename}`;

  const { publicUrl } = await uploadFile(bucket, path, mediaBuffer, mimeType);

  // 科目名を抽出
  const subject = extractSubject(filename) || extractSubject(message.text || '');

  // データベースに保存
  await createWhatsAppFile({
    filename,
    subject,
    group_name: groupName,
    file_type: fileType,
    file_url: publicUrl
  });

  // 画像の場合、OCR処理
  if (fileType === 'image') {
    try {
      const ocrText = await extractTextFromImage(mediaBuffer, mimeType);
      const extractedSubject = subject || extractSubjectFromOCR(ocrText);

      await createOCRRecord({
        filename,
        subject: extractedSubject,
        group_name: groupName,
        file_url: publicUrl,
        ocr_text: ocrText
      });

      // Telegram通知
      await sendCustomNotification(
        `📷 新しい画像 - ${groupName}`,
        `ファイル: ${filename}\n科目: ${extractedSubject || '不明'}\n\nOCRテキスト:\n${ocrText.substring(0, 300)}...`
      );

    } catch (ocrError) {
      console.error('OCR processing failed:', ocrError);
    }
  } else {
    // ドキュメントの場合
    await sendCustomNotification(
      `📄 新しいドキュメント - ${groupName}`,
      `ファイル: ${filename}\n科目: ${subject || '不明'}\nURL: ${publicUrl}`
    );
  }
}

/**
 * テキストメッセージを処理（今後実装）
 */
async function handleTextMessage(message, groupName) {
  // 課題や期限の情報を抽出するロジック（今後実装）
  const text = message.text?.body || '';

  // キーワード検出: "due", "deadline", "submit", "assignment"
  const keywords = ['due', 'deadline', 'submit', 'assignment', '締切', '提出'];
  const hasKeyword = keywords.some(keyword => text.toLowerCase().includes(keyword));

  if (hasKeyword) {
    await sendCustomNotification(
      `⚠️ 課題情報 - ${groupName}`,
      text
    );
  }
}
