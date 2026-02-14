import TelegramBot from 'node-telegram-bot-api';

let bot = null;
function getTimeZone() {
  const tz = process.env.TZ;
  if (!tz || tz === ':UTC' || tz === 'UTC') {
    return 'Asia/Manila';
  }
  return tz;
}

/**
 * Telegram Bot 繧､繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ繧貞叙蠕・
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
 * 繝｡繝・そ繝ｼ繧ｸ繧帝∽ｿ｡
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
 * 繧ｫ繧ｹ繧ｿ繝騾夂衍繧帝∽ｿ｡
 */
export async function sendCustomNotification(title, body) {
  const message = `*${title}*\n\n${body}`;
  return sendMessage(message);
}

/**
 * 繧ｨ繝ｩ繝ｼ騾夂衍繧帝∽ｿ｡
 */
export async function sendErrorNotification(title, error) {
  const message = `圷 *繧ｨ繝ｩ繝ｼ: ${title}*\n\n\`\`\`\n${error.message || error}\n\`\`\``;
  return sendMessage(message);
}

/**
 * 莉頑律縺ｮ莠亥ｮ夐夂衍
 */
export async function sendTodaySchedule(events, tasks, exams) {
  let message = '桁 *縺翫・繧医≧縺斐＊縺・∪縺吶，EO*\n\n';

  // 莉頑律縺ｮ莠亥ｮ・
  if (events && events.length > 0) {
    message += '套 *莉頑律縺ｮ莠亥ｮ・\n';
    events.forEach(event => {
      const startTime = new Date(event.start_time);
      const timeStr = startTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: getTimeZone()
      });
      message += `${timeStr} - ${event.title}`;
      if (event.room) message += ` (${event.room})`;
      message += '\n';
    });
    message += '\n';
  }

  // 莉頑律縺ｮ隱ｲ鬘・
  if (tasks && tasks.length > 0) {
    message += '笞・・*謠仙・迚ｩ*\n';
    tasks.forEach(task => {
      message += `窶｢ ${task.title}`;
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const deadlineStr = deadline.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: getTimeZone()
        });
        message += ` - ${deadlineStr}邱蛻㌔;
      }
      message += '\n';
    });
    message += '\n';
  }

  // 隧ｦ鬨薙き繧ｦ繝ｳ繝医ム繧ｦ繝ｳ
  if (exams && exams.length > 0) {
    message += '閥 *隧ｦ鬨薙き繧ｦ繝ｳ繝医ム繧ｦ繝ｳ*\n';
    exams.forEach(exam => {
      const examDate = new Date(exam.exam_date);
      const now = new Date();
      const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
      message += `${exam.subject} - 谿九ｊ${daysUntil}譌･\n`;
    });
    message += '\n';
  }

  // 蠢倥ｌ迚ｩ繝√ぉ繝・け
  message += '賜 *蠢倥ｌ迚ｩ繝√ぉ繝・け*\n';
  message += '笨・逋ｽ陦｣\n';
  message += '笨・閨ｴ險ｺ蝎ｨ\n';

  return sendMessage(message);
}

/**
 * 譏取律縺ｮ貅門ｙ騾夂衍
 */
export async function sendTomorrowPreparation(events, tasks, exams) {
  let message = '答 *譏取律縺ｮ貅門ｙ遒ｺ隱・\n\n';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: getTimeZone()
  });

  message += `套 *${dateStr}縺ｮ莠亥ｮ・\n`;

  // 譏取律縺ｮ莠亥ｮ・
  if (events && events.length > 0) {
    events.forEach(event => {
      const startTime = new Date(event.start_time);
      const timeStr = startTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: getTimeZone()
      });
      message += `${timeStr} - ${event.title}`;
      if (event.room) message += ` (${event.room})`;
      if (event.faculty) message += `, ${event.faculty}`;
      message += '\n';
    });
    message += '\n';
  }

  // 譏取律縺ｮ隱ｲ鬘・
  if (tasks && tasks.length > 0) {
    message += '笞・・*謠仙・迚ｩ*\n';
    tasks.forEach(task => {
      message += `窶｢ ${task.title}`;
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const deadlineStr = deadline.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: getTimeZone()
        });
        message += ` - ${deadlineStr}邱蛻㌔;
      }
      message += '\n';
    });
    message += '\n';
  }

  // 隧ｦ鬨薙き繧ｦ繝ｳ繝医ム繧ｦ繝ｳ
  if (exams && exams.length > 0) {
    message += '閥 *隧ｦ鬨薙き繧ｦ繝ｳ繝医ム繧ｦ繝ｳ*\n';
    exams.forEach(exam => {
      const examDate = new Date(exam.exam_date);
      const now = new Date();
      const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
      message += `${exam.subject} - 谿九ｊ${daysUntil}譌･\n`;
      message += `笏・蠕ｩ鄙貞庄閭ｽ蝗樊焚・壽ｮ九ｊ${daysUntil}蝗杤n`;
    });
  }

  return sendMessage(message);
}

/**
 * 隧ｦ鬨・譌･蜑阪い繝ｩ繝ｼ繝・
 */
export async function sendExamAlert(exam) {
  const examDate = new Date(exam.exam_date);
  const dateStr = examDate.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: getTimeZone()
  });
  const timeStr = examDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: getTimeZone()
  });

  const now = new Date();
  const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

  const message = `圷 *驥崎ｦ・ｼ夊ｩｦ鬨・譌･蜑阪い繝ｩ繝ｼ繝・\n\n` +
    `閥 ${exam.subject}\n` +
    `套 ${dateStr} ${timeStr}\n` +
    `竢ｰ 谿九ｊ・・{daysUntil}譌･\n\n` +
    `笨・*蠕ｩ鄙定ｨ育判*\n` +
    `窶｢ 谿九ｊ蠕ｩ鄙貞庄閭ｽ蝗樊焚・・{daysUntil}蝗杤n` +
    `窶｢ 1蝗槭≠縺溘ｊ謗ｨ螂ｨ譎る俣・・-3譎る俣`;

  return sendMessage(message);
}


