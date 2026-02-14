import TelegramBot from 'node-telegram-bot-api';

let bot = null;

/**
 * Telegram Bot インスタンスを取得
 */
export function getTelegramBot() {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    bot = new TelegramBot(token);
  }
  return bot;
}

/**
 * メッセージを送信
 */
export async function sendMessage(text, options = {}) {
  const bot = getTelegramBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID is not set');
  }

  try {
    const result = await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    });
    return result;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    throw error;
  }
}

/**
 * カスタム通知を送信
 */
export async function sendCustomNotification(title, body) {
  const message = `*${title}*\n\n${body}`;
  return sendMessage(message);
}

/**
 * エラー通知を送信
 */
export async function sendErrorNotification(title, error) {
  const message = `🚨 *エラー: ${title}*\n\n\`\`\`\n${error.message || error}\n\`\`\``;
  return sendMessage(message);
}

/**
 * 今日の予定通知
 */
export async function sendTodaySchedule(events, tasks, exams) {
  let message = '🌅 *おはようございます、CEO*\n\n';

  // 今日の予定
  if (events && events.length > 0) {
    message += '📅 *今日の予定*\n';
    events.forEach(event => {
      const startTime = new Date(event.start_time);
      const timeStr = startTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: process.env.TZ || 'Asia/Manila'
      });
      message += `${timeStr} - ${event.title}`;
      if (event.room) message += ` (${event.room})`;
      message += '\n';
    });
    message += '\n';
  }

  // 今日の課題
  if (tasks && tasks.length > 0) {
    message += '⚠️ *提出物*\n';
    tasks.forEach(task => {
      message += `• ${task.title}`;
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const deadlineStr = deadline.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: process.env.TZ || 'Asia/Manila'
        });
        message += ` - ${deadlineStr}締切`;
      }
      message += '\n';
    });
    message += '\n';
  }

  // 試験カウントダウン
  if (exams && exams.length > 0) {
    message += '🔴 *試験カウントダウン*\n';
    exams.forEach(exam => {
      const examDate = new Date(exam.exam_date);
      const now = new Date();
      const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
      message += `${exam.subject} - 残り${daysUntil}日\n`;
    });
    message += '\n';
  }

  // 忘れ物チェック
  message += '🎒 *忘れ物チェック*\n';
  message += '✅ 白衣\n';
  message += '✅ 聴診器\n';

  return sendMessage(message);
}

/**
 * 明日の準備通知
 */
export async function sendTomorrowPreparation(events, tasks, exams) {
  let message = '📚 *明日の準備確認*\n\n';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: process.env.TZ || 'Asia/Manila'
  });

  message += `📅 *${dateStr}の予定*\n`;

  // 明日の予定
  if (events && events.length > 0) {
    events.forEach(event => {
      const startTime = new Date(event.start_time);
      const timeStr = startTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: process.env.TZ || 'Asia/Manila'
      });
      message += `${timeStr} - ${event.title}`;
      if (event.room) message += ` (${event.room})`;
      if (event.faculty) message += `, ${event.faculty}`;
      message += '\n';
    });
    message += '\n';
  }

  // 明日の課題
  if (tasks && tasks.length > 0) {
    message += '⚠️ *提出物*\n';
    tasks.forEach(task => {
      message += `• ${task.title}`;
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const deadlineStr = deadline.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: process.env.TZ || 'Asia/Manila'
        });
        message += ` - ${deadlineStr}締切`;
      }
      message += '\n';
    });
    message += '\n';
  }

  // 試験カウントダウン
  if (exams && exams.length > 0) {
    message += '🔴 *試験カウントダウン*\n';
    exams.forEach(exam => {
      const examDate = new Date(exam.exam_date);
      const now = new Date();
      const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
      message += `${exam.subject} - 残り${daysUntil}日\n`;
      message += `└ 復習可能回数：残り${daysUntil}回\n`;
    });
  }

  return sendMessage(message);
}

/**
 * 試験3日前アラート
 */
export async function sendExamAlert(exam) {
  const examDate = new Date(exam.exam_date);
  const dateStr = examDate.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: process.env.TZ || 'Asia/Manila'
  });
  const timeStr = examDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: process.env.TZ || 'Asia/Manila'
  });

  const now = new Date();
  const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

  const message = `🚨 *重要：試験3日前アラート*\n\n` +
    `🔴 ${exam.subject}\n` +
    `📅 ${dateStr} ${timeStr}\n` +
    `⏰ 残り：${daysUntil}日\n\n` +
    `✅ *復習計画*\n` +
    `• 残り復習可能回数：${daysUntil}回\n` +
    `• 1回あたり推奨時間：2-3時間`;

  return sendMessage(message);
}
