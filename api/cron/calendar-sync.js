import { scrapeCalendar, extractExams, formatCalendarEvent, formatExam } from '../../lib/calendar.js';
import { upsertCalendarEvent, createExam } from '../../lib/db.js';
import { sendCustomNotification } from '../../lib/telegram.js';

/**
 * カレンダー同期 Cron Job（毎時実行）
 */
export default async function handler(req, res) {
  // Cron認証チェック（Vercel Cronからのみ許可）
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting calendar sync...');

    // カレンダーをスクレイピング
    const events = await scrapeCalendar();

    console.log(`Found ${events.length} events`);

    let syncedEvents = 0;
    let syncedExams = 0;

    // イベントをデータベースに保存
    for (const event of events) {
      try {
        // カレンダーイベントとして保存
        const eventData = formatCalendarEvent(event);
        await upsertCalendarEvent(eventData);
        syncedEvents++;

        // 試験の場合、試験テーブルにも保存
        if (event.isExam) {
          const examData = formatExam(event);

          // 既存の試験をチェック（重複回避）
          // 簡易実装: 同じ科目・同じ日付の試験があれば更新
          await createExam(examData);
          syncedExams++;
        }

      } catch (error) {
        console.error('Error syncing event:', event.title, error);
      }
    }

    const message = `✅ カレンダー同期完了\n\nイベント: ${syncedEvents}件\n試験: ${syncedExams}件`;
    console.log(message);

    // 新しい試験が見つかった場合のみ通知
    if (syncedExams > 0) {
      await sendCustomNotification('📅 カレンダー同期', message);
    }

    return res.status(200).json({
      success: true,
      syncedEvents,
      syncedExams
    });

  } catch (error) {
    console.error('Calendar sync failed:', error);

    await sendCustomNotification(
      'カレンダー同期エラー',
      `エラー: ${error.message}`
    );

    return res.status(500).json({ error: error.message });
  }
}
