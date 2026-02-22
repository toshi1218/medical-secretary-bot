'use strict';

const https = require('https');
const puppeteer = require('puppeteer');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SCHOOL_CALENDAR_URL = process.env.SCHOOL_CALENDAR_URL || '';
const TELEGRAM_BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN  || '';
const TELEGRAM_CHAT_ID    = process.env.TELEGRAM_CHAT_ID    || '';
const DRY_RUN             = process.argv.includes('--dry-run');
const MODE                = ['morning', 'evening', 'night'].includes(process.argv[2])
  ? process.argv[2]
  : 'morning';

// ---------------------------------------------------------------------------
// Telegram helper
// ---------------------------------------------------------------------------
function sendTelegram(text) {
  if (DRY_RUN) {
    console.log('[DRY-RUN] Telegram message:\n' + text);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) resolve(data);
          else reject(new Error(`Telegram API ${res.statusCode}: ${data}`));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Date helpers (Manila time = UTC+8)
// ---------------------------------------------------------------------------
function getManilaDate() {
  const now = new Date();
  // Convert to Manila time
  const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  return manila;
}

function formatDate(date) {
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getDayLabel(date) {
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
  });
}

function diffDays(targetDate, fromDate) {
  const t = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const f = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  return Math.round((t - f) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Puppeteer: fetch calendar data from GAS
// ---------------------------------------------------------------------------
async function fetchCalendarData(url) {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );

    // The GAS URL is expected to return JSON like:
    // { "events": [ { "date": "2026-02-25", "title": "...", "type": "exam|class|holiday", "reviewCount": 3 }, ... ] }
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const content = await page.evaluate(() => document.body.innerText);
    const data = JSON.parse(content);
    return data;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------
function buildMorningMessage(data, today) {
  const todayStr = formatDate(today);
  const dayLabel = getDayLabel(today);

  const todayEvents = (data.events || []).filter((e) => e.date === todayStr);
  const upcomingExams = (data.events || [])
    .filter((e) => e.type === 'exam')
    .map((e) => {
      const examDate = new Date(e.date);
      const days = diffDays(examDate, today);
      return { ...e, days };
    })
    .filter((e) => e.days >= 0 && e.days <= 30)
    .sort((a, b) => a.days - b.days);

  let msg = `<b>おはようございます！ ${todayStr}（${dayLabel}）</b>\n\n`;

  // Today's schedule
  msg += `<b>📅 今日のスケジュール</b>\n`;
  if (todayEvents.length === 0) {
    msg += '  特定のイベントはありません\n';
  } else {
    todayEvents.forEach((e) => {
      const icon = e.type === 'exam' ? '📝' : e.type === 'holiday' ? '🎌' : '📖';
      msg += `  ${icon} ${e.title}\n`;
    });
  }

  // Exam countdown
  msg += `\n<b>📝 試験カウントダウン</b>\n`;
  if (upcomingExams.length === 0) {
    msg += '  直近30日に試験はありません\n';
  } else {
    upcomingExams.slice(0, 5).forEach((e) => {
      if (e.days === 0) {
        msg += `  🚨 <b>本日 ${e.title}</b>\n`;
      } else if (e.days === 1) {
        msg += `  ⚠️ <b>明日 ${e.title}</b>（あと1日）\n`;
      } else {
        msg += `  📌 ${e.title}（あと${e.days}日 / ${e.date}）\n`;
      }
    });
  }

  // Review counts
  const todayReviews = todayEvents.filter((e) => e.reviewCount > 0);
  if (todayReviews.length > 0) {
    msg += `\n<b>🔁 今日の復習</b>\n`;
    todayReviews.forEach((e) => {
      msg += `  ${e.title}：${e.reviewCount}回目\n`;
    });
  }

  msg += `\n今日も頑張りましょう！💪`;
  return msg;
}

function buildEveningMessage(data, today) {
  const upcomingExams = (data.events || [])
    .filter((e) => e.type === 'exam')
    .map((e) => {
      const examDate = new Date(e.date);
      const days = diffDays(examDate, today);
      return { ...e, days };
    })
    .filter((e) => e.days >= 1 && e.days <= 3)
    .sort((a, b) => a.days - b.days);

  if (upcomingExams.length === 0) {
    console.log('No exams within 3 days — skipping evening message.');
    return null;
  }

  let msg = `<b>⚠️ 試験アラート（3日前チェック）</b>\n\n`;
  upcomingExams.forEach((e) => {
    msg += `📝 <b>${e.title}</b>（あと${e.days}日 / ${e.date}）\n`;
    msg += `   しっかり準備できていますか？\n\n`;
  });
  msg += `集中して取り組みましょう！📚`;
  return msg;
}

function buildNightMessage(data, today) {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);
  const tomorrowLabel = getDayLabel(tomorrow);

  const tomorrowEvents = (data.events || []).filter((e) => e.date === tomorrowStr);
  const todayStr = formatDate(today);
  const todayReviews = (data.events || [])
    .filter((e) => e.date === todayStr && e.reviewCount > 0);

  let msg = `<b>🌙 おやすみ前チェック</b>\n\n`;

  msg += `<b>📅 明日（${tomorrowStr} ${tomorrowLabel}）</b>\n`;
  if (tomorrowEvents.length === 0) {
    msg += '  特定のイベントはありません\n';
  } else {
    tomorrowEvents.forEach((e) => {
      const icon = e.type === 'exam' ? '📝' : e.type === 'holiday' ? '🎌' : '📖';
      msg += `  ${icon} ${e.title}\n`;
    });
  }

  if (todayReviews.length > 0) {
    msg += `\n<b>🔁 今日の復習（完了確認）</b>\n`;
    todayReviews.forEach((e) => {
      msg += `  ${e.title}：${e.reviewCount}回目 ✅\n`;
    });
  }

  msg += `\nゆっくり休んで明日に備えましょう！😴`;
  return msg;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Mode: ${MODE}, DryRun: ${DRY_RUN}`);
  const today = getManilaDate();
  console.log(`Manila date: ${formatDate(today)}`);

  if (!SCHOOL_CALENDAR_URL && !DRY_RUN) {
    throw new Error('SCHOOL_CALENDAR_URL is not set');
  }
  if (!TELEGRAM_BOT_TOKEN && !DRY_RUN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }
  if (!TELEGRAM_CHAT_ID && !DRY_RUN) {
    throw new Error('TELEGRAM_CHAT_ID is not set');
  }

  let data;
  if (DRY_RUN && !SCHOOL_CALENDAR_URL) {
    // Sample data for dry-run
    data = {
      events: [
        { date: formatDate(today), title: 'Internal Medicine Class', type: 'class', reviewCount: 2 },
        { date: formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)), title: 'Anatomy Mid-term Exam', type: 'exam', reviewCount: 0 },
        { date: formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)), title: 'Pharmacology Exam', type: 'exam', reviewCount: 0 },
        { date: formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)), title: 'Physiology Class', type: 'class', reviewCount: 3 },
      ],
    };
    console.log('[DRY-RUN] Using sample data');
  } else {
    data = await fetchCalendarData(SCHOOL_CALENDAR_URL);
  }

  console.log(`Fetched ${(data.events || []).length} events`);

  let message;
  switch (MODE) {
    case 'morning':
      message = buildMorningMessage(data, today);
      break;
    case 'evening':
      message = buildEveningMessage(data, today);
      break;
    case 'night':
      message = buildNightMessage(data, today);
      break;
    default:
      message = buildMorningMessage(data, today);
  }

  if (message) {
    await sendTelegram(message);
    console.log('Message sent successfully.');
  } else {
    console.log('No message to send.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
