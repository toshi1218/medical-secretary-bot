import TelegramBot from 'node-telegram-bot-api';

let bot = null;

function getTimeZone() {
  const tz = process.env.TZ;
  if (!tz || tz === ':UTC' || tz === 'UTC') {
    return 'Asia/Manila';
  }
  return tz;
}

function formatTime(dateLike) {
  return new Date(dateLike).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: getTimeZone()
  });
}

function formatDate(dateLike) {
  return new Date(dateLike).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: getTimeZone()
  });
}

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

export async function sendMessage(text, options = {}) {
  const telegram = getTelegramBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID is not set');
  }

  try {
    return await telegram.sendMessage(chatId, text, {
      disable_web_page_preview: true,
      ...options
    });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    throw error;
  }
}

export async function sendCustomNotification(title, body) {
  const message = `${title}\n\n${body}`;
  return sendMessage(message);
}

export async function sendErrorNotification(title, error) {
  const message = `エラー: ${title}\n\n${error?.message || error}`;
  return sendMessage(message);
}

export async function sendTodaySchedule(events, tasks, exams) {
  const lines = [];
  lines.push('🌅 おはようございます、CEO');
  lines.push('');

  if (events?.length) {
    lines.push('📚 本日の予定');
    for (const event of events) {
      let row = `${formatTime(event.start_time)} - ${event.title}`;
      if (event.room) row += ` (${event.room})`;
      lines.push(row);
    }
    lines.push('');
  }

  if (tasks?.length) {
    lines.push('📝 本日の提出・タスク');
    for (const task of tasks) {
      let row = `・${task.title}`;
      if (task.deadline) row += ` - ${formatTime(task.deadline)}まで`;
      lines.push(row);
    }
    lines.push('');
  }

  if (exams?.length) {
    lines.push('🧪 直近の試験');
    for (const exam of exams) {
      const daysUntil = Math.ceil((new Date(exam.exam_date) - new Date()) / (1000 * 60 * 60 * 24));
      lines.push(`${exam.subject} - あと${daysUntil}日`);
    }
    lines.push('');
  }

  lines.push('🎒 忘れ物チェック');
  lines.push('・白衣');
  lines.push('・聴診器');

  return sendMessage(lines.join('\n'));
}

export async function sendTomorrowPreparation(events, tasks, exams) {
  const lines = [];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  lines.push('🌙 明日の準備リマインド');
  lines.push('');
  lines.push(`📅 ${formatDate(tomorrow)} の予定`);

  if (events?.length) {
    for (const event of events) {
      let row = `${formatTime(event.start_time)} - ${event.title}`;
      if (event.room) row += ` (${event.room})`;
      if (event.faculty) row += ` / ${event.faculty}`;
      lines.push(row);
    }
    lines.push('');
  } else {
    lines.push('予定はありません。');
    lines.push('');
  }

  if (tasks?.length) {
    lines.push('📝 明日締切のタスク');
    for (const task of tasks) {
      let row = `・${task.title}`;
      if (task.deadline) row += ` - ${formatTime(task.deadline)}まで`;
      lines.push(row);
    }
    lines.push('');
  }

  if (exams?.length) {
    lines.push('🧪 直近の試験');
    for (const exam of exams) {
      const daysUntil = Math.ceil((new Date(exam.exam_date) - new Date()) / (1000 * 60 * 60 * 24));
      lines.push(`${exam.subject} - あと${daysUntil}日`);
      lines.push(`・復習目安: 1日あたり${daysUntil}単元`);
    }
  }

  return sendMessage(lines.join('\n'));
}

export async function sendExamAlert(exam) {
  const examDate = new Date(exam.exam_date);
  const daysUntil = Math.ceil((examDate - new Date()) / (1000 * 60 * 60 * 24));

  const lines = [];
  lines.push('🚨 試験3日前アラート');
  lines.push('');
  lines.push(`🧪 ${exam.subject}`);
  lines.push(`📅 ${formatDate(examDate)} ${formatTime(examDate)}`);
  lines.push(`⏳ あと${daysUntil}日`);
  lines.push('');
  lines.push('📌 学習目安');
  lines.push(`・1日あたり復習単元: ${daysUntil}`);
  lines.push('・1-3時間の集中学習を推奨');

  return sendMessage(lines.join('\n'));
}
