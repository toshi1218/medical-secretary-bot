import { getTomorrowEvents, getPendingTasks, getUpcomingExams } from '../../lib/db.js';
import { sendTomorrowPreparation } from '../../lib/telegram.js';

/**
 * 夜の通知 Cron Job（毎日22:00実行）
 */
export default async function handler(req, res) {
  // Cron認証チェック
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Sending evening notification...');

    // 明日のイベントを取得
    const tomorrowEvents = await getTomorrowEvents();

    // 明日期限の課題を取得
    const allTasks = await getPendingTasks();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const tomorrowTasks = allTasks.filter(task => {
      if (!task.deadline) return false;
      const deadline = new Date(task.deadline);
      return deadline >= tomorrow && deadline < dayAfterTomorrow;
    });

    // 今後の試験を取得
    const upcomingExams = await getUpcomingExams();

    // 夜の準備通知を送信
    await sendTomorrowPreparation(tomorrowEvents, tomorrowTasks, upcomingExams);

    return res.status(200).json({
      success: true,
      tomorrowEvents: tomorrowEvents.length,
      tomorrowTasks: tomorrowTasks.length,
      upcomingExams: upcomingExams.length
    });

  } catch (error) {
    console.error('Evening notification failed:', error);
    return res.status(500).json({ error: error.message });
  }
}
