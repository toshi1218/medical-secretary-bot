import { getTodayEvents, getPendingTasks, getUpcomingExams } from '../../lib/db.js';
import { sendTodaySchedule, sendExamAlert } from '../../lib/telegram.js';

/**
 * 朝の通知 Cron Job（毎日7:00実行）
 */
export default async function handler(req, res) {
  // Cron認証チェック
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Sending morning notification...');

    // 今日のイベントを取得
    const todayEvents = await getTodayEvents();

    // 今日期限の課題を取得
    const allTasks = await getPendingTasks();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTasks = allTasks.filter(task => {
      if (!task.deadline) return false;
      const deadline = new Date(task.deadline);
      return deadline >= today && deadline < tomorrow;
    });

    // 今後の試験を取得
    const upcomingExams = await getUpcomingExams();

    // 朝の通知を送信
    await sendTodaySchedule(todayEvents, todayTasks, upcomingExams);

    // 試験3日前アラートをチェック
    const now = new Date();
    for (const exam of upcomingExams) {
      const examDate = new Date(exam.exam_date);
      const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntil === 3) {
        await sendExamAlert(exam);
      }
    }

    return res.status(200).json({
      success: true,
      todayEvents: todayEvents.length,
      todayTasks: todayTasks.length,
      upcomingExams: upcomingExams.length
    });

  } catch (error) {
    console.error('Morning notification failed:', error);
    return res.status(500).json({ error: error.message });
  }
}
