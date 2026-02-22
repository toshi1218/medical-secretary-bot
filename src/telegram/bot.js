'use strict';

const TelegramBot = require('node-telegram-bot-api');
const {
  getEventsByDate,
  getEventsForWeek,
  getAllExams,
  getUpcomingExams,
  getPendingTasks,
  getFilesBySubject,
  searchOCRText,
} = require('../database/db');
const { syncCalendar } = require('../calendar/scraper');
const {
  todayManila,
  tomorrowManila,
  thisWeekManila,
  daysUntil,
  formatTime,
  formatDateJP,
  formatDateShort,
} = require('../utils/dateHelper');

let bot = null;

function getBot() {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    bot = new TelegramBot(token, { polling: true });
  }
  return bot;
}

function getChatId() {
  return process.env.TELEGRAM_CHAT_ID;
}

/**
 * メッセージを送信
 */
async function sendMessage(text, options = {}) {
  const chatId = getChatId();
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');
  return getBot().sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...options,
  });
}

/**
 * エラーをTelegramに通知
 */
async function sendErrorNotification(title, error) {
  try {
    const msg = `⚠️ エラー: ${title}\n\`${error?.message || error}\``;
    await sendMessage(msg);
  } catch (_) {}
}

/**
 * アクティビティ絵文字
 */
function activityEmoji(activity) {
  const map = {
    Lecture: '📖',
    SGD: '👥',
    Exam: '🔴',
    'Exam (Manual)': '🔴',
    Clinics: '🏥',
    Practical: '🔬',
    'Reporting/Presentation': '🎤',
    HOLIDAY: '🎌',
    Other: '📌',
  };
  return map[activity] || '📌';
}

/**
 * カレンダーイベントを1行にフォーマット
 */
function formatEventLine(event) {
  const start = formatTime(event.start_time);
  const end = event.end_time ? formatTime(event.end_time) : '';
  const timeStr = end ? `${start}-${end}` : start;
  const emoji = event.is_exam ? '🔴' : activityEmoji(event.activity);
  let line = `${emoji} \`${timeStr}\` *${event.subject || event.title}*`;
  if (event.activity && event.activity !== 'Other') line += ` [${event.activity}]`;
  if (event.room) line += `\n   🏫 Room: ${event.room}`;
  if (event.faculty) line += `  👨‍⚕️ ${event.faculty}`;
  if (event.topic && event.activity !== 'Other') line += `\n   📝 ${event.topic}`;
  return line;
}

// ======= コマンドハンドラ =======

async function handleToday(chatId) {
  const date = todayManila();
  const events = getEventsByDate(date);
  const lines = [`☀️ *今日の予定* — ${formatDateJP(date + 'T00:00:00')}\n`];

  if (events.length === 0) {
    lines.push('予定はありません。');
  } else {
    for (const e of events) {
      lines.push(formatEventLine(e));
    }
  }
  return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

async function handleTomorrow(chatId) {
  const date = tomorrowManila();
  const events = getEventsByDate(date);
  const lines = [`📅 *明日の予定* — ${formatDateJP(date + 'T00:00:00')}\n`];

  if (events.length === 0) {
    lines.push('予定はありません。');
  } else {
    for (const e of events) {
      lines.push(formatEventLine(e));
    }
  }
  return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

async function handleWeek(chatId) {
  const { start, end } = thisWeekManila();
  const events = getEventsForWeek(start, end);
  const lines = [`📅 *今週の予定* (${formatDateShort(start + 'T00:00:00')} - ${formatDateShort(end + 'T00:00:00')})\n`];

  if (events.length === 0) {
    lines.push('今週の予定はありません。');
  } else {
    let lastDate = '';
    for (const e of events) {
      const dateStr = e.start_time.substring(0, 10);
      if (dateStr !== lastDate) {
        lines.push(`\n*${formatDateJP(e.start_time)}*`);
        lastDate = dateStr;
      }
      const emoji = e.is_exam ? '🔴' : activityEmoji(e.activity);
      const start_t = formatTime(e.start_time);
      const end_t = e.end_time ? formatTime(e.end_time) : '';
      const timeStr = end_t ? `${start_t}-${end_t}` : start_t;
      lines.push(`  ${emoji} \`${timeStr}\` ${e.subject || e.title}${e.room ? ` (${e.room})` : ''}`);
    }
  }
  return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

async function handleExams(chatId) {
  const exams = getAllExams();
  const now = new Date().toISOString();
  const upcoming = exams.filter((e) => e.exam_date >= now);
  const past = exams.filter((e) => e.exam_date < now);

  const lines = ['🔴 *試験一覧*\n'];

  if (upcoming.length > 0) {
    lines.push('*今後の試験:*');
    for (const exam of upcoming) {
      const days = daysUntil(exam.exam_date);
      const dayLabel = days === 0 ? '今日！' : days > 0 ? `残り${days}日` : '終了';
      lines.push(`🔴 *${exam.subject}*`);
      lines.push(`   📅 ${formatDateJP(exam.exam_date)} ${formatTime(exam.exam_date)}`);
      lines.push(`   ⏰ ${dayLabel}`);
      if (exam.room) lines.push(`   🏫 ${exam.room}`);
      if (exam.topic) lines.push(`   📚 ${exam.topic}`);
      lines.push('');
    }
  }

  if (past.length > 0) {
    lines.push(`*過去の試験: ${past.length}件*`);
  }

  if (exams.length === 0) {
    lines.push('試験情報がありません。/sync でカレンダーを同期してください。');
  }

  return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

async function handleTasks(chatId) {
  const tasks = getPendingTasks();
  const lines = ['📝 *未完了タスク*\n'];

  if (tasks.length === 0) {
    lines.push('未完了のタスクはありません。');
  } else {
    for (const task of tasks) {
      let line = `• ${task.title}`;
      if (task.deadline) line += ` _(${formatDateJP(task.deadline)})_`;
      if (task.group_name) line += `\n  📱 ${task.group_name}`;
      lines.push(line);
    }
  }
  return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

async function handleFiles(chatId, subject) {
  const files = subject ? getFilesBySubject(subject) : getFilesBySubject('');
  const lines = [`📎 *ファイル一覧*${subject ? ` — ${subject}` : ''}\n`];

  if (files.length === 0) {
    lines.push('ファイルがありません。');
  } else {
    for (const f of files) {
      const dateStr = f.download_date ? f.download_date.substring(0, 10) : '';
      lines.push(`• \`${f.filename}\``);
      lines.push(`  ${f.group_name || ''} | ${dateStr}`);
    }
  }
  return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

async function handleSearch(chatId, keyword) {
  if (!keyword) {
    return bot.sendMessage(chatId, '使い方: /search [キーワード]');
  }
  const results = searchOCRText(keyword);
  const lines = [`🔍 *検索結果: "${keyword}"*\n`];

  if (results.length === 0) {
    lines.push('一致するOCRテキストが見つかりませんでした。');
  } else {
    for (const r of results) {
      lines.push(`📄 \`${r.filename}\` (${r.group_name || ''})`);
      // OCRテキストのマッチ周辺を抜粋
      const idx = r.ocr_text.toLowerCase().indexOf(keyword.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(r.ocr_text.length, idx + keyword.length + 100);
        const excerpt = r.ocr_text.substring(start, end).replace(/\n/g, ' ');
        lines.push(`  ...${excerpt}...`);
      }
      lines.push('');
    }
  }
  return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

async function handleSync(chatId) {
  await bot.sendMessage(chatId, '🔄 カレンダーを同期中...');
  try {
    const result = await syncCalendar();
    return bot.sendMessage(
      chatId,
      `✅ 同期完了\n・更新: ${result.upserted}件\n・試験: ${result.examCount}件\n・スキップ: ${result.skipped}件`
    );
  } catch (err) {
    return bot.sendMessage(chatId, `❌ 同期失敗: ${err.message}`);
  }
}

async function handleHelp(chatId) {
  const helpText = `
🤖 *Medical Secretary Bot*

*コマンド一覧:*
/today — 今日の予定
/tomorrow — 明日の予定
/week — 今週の予定
/exams — 全試験一覧＋カウントダウン
/tasks — 未完了タスク一覧
/files [科目名] — WhatsAppファイル一覧
/search [キーワード] — OCRテキスト全文検索
/sync — カレンダー手動同期
/help — このヘルプを表示
  `.trim();
  return bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
}

/**
 * Telegram Botを初期化してコマンドを登録
 */
function initBot() {
  const b = getBot();

  b.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text || '';

    // 登録されたCHAT_IDからのメッセージのみ処理
    const allowedChatId = getChatId();
    if (allowedChatId && chatId !== allowedChatId) {
      console.log(`[Bot] Ignoring message from unknown chat: ${chatId}`);
      return;
    }

    try {
      if (text.startsWith('/today')) {
        await handleToday(chatId);
      } else if (text.startsWith('/tomorrow')) {
        await handleTomorrow(chatId);
      } else if (text.startsWith('/week')) {
        await handleWeek(chatId);
      } else if (text.startsWith('/exams')) {
        await handleExams(chatId);
      } else if (text.startsWith('/tasks')) {
        await handleTasks(chatId);
      } else if (text.startsWith('/files')) {
        const subject = text.replace('/files', '').trim();
        await handleFiles(chatId, subject);
      } else if (text.startsWith('/search')) {
        const keyword = text.replace('/search', '').trim();
        await handleSearch(chatId, keyword);
      } else if (text.startsWith('/sync')) {
        await handleSync(chatId);
      } else if (text.startsWith('/help') || text === '/start') {
        await handleHelp(chatId);
      }
    } catch (err) {
      console.error('[Bot] Command error:', err.message);
      try {
        await b.sendMessage(chatId, `❌ エラー: ${err.message}`);
      } catch (_) {}
    }
  });

  b.on('polling_error', (err) => {
    console.error('[Bot] Polling error:', err.message);
  });

  console.log('[Bot] Telegram bot initialized');
  return b;
}

module.exports = { initBot, sendMessage, sendErrorNotification };
