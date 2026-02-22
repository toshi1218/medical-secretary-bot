'use strict';

require('dotenv').config();

const express = require('express');
const cron = require('node-cron');

const { initBot, sendErrorNotification } = require('./telegram/bot');
const { handleWhapiWebhook } = require('./whapi/webhook');
const { syncCalendar } = require('./calendar/scraper');
const {
  sendDailyBriefing,
  sendPreparationNotification,
  checkExamAlerts,
} = require('./telegram/notifications');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ======= Routes =======

// Whapi Webhook
app.post('/webhook/whapi', (req, res) => {
  handleWhapiWebhook(req, res);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ======= Cron Jobs (Asia/Manila) =======

// 前日22:00 — 明日の準備確認
cron.schedule('0 22 * * *', () => {
  console.log('[Cron] Running: sendPreparationNotification');
  sendPreparationNotification().catch((err) =>
    console.error('[Cron] sendPreparationNotification error:', err.message)
  );
}, { timezone: 'Asia/Manila' });

// 当日07:00 — 今日の予定・締切
cron.schedule('0 7 * * *', () => {
  console.log('[Cron] Running: sendDailyBriefing');
  sendDailyBriefing().catch((err) =>
    console.error('[Cron] sendDailyBriefing error:', err.message)
  );
}, { timezone: 'Asia/Manila' });

// 3時間ごと — カレンダー同期
cron.schedule('0 */3 * * *', () => {
  console.log('[Cron] Running: syncCalendar');
  syncCalendar().catch((err) =>
    console.error('[Cron] syncCalendar error:', err.message)
  );
}, { timezone: 'Asia/Manila' });

// 毎日20:00 — 試験3日前チェック
cron.schedule('0 20 * * *', () => {
  console.log('[Cron] Running: checkExamAlerts');
  checkExamAlerts().catch((err) =>
    console.error('[Cron] checkExamAlerts error:', err.message)
  );
}, { timezone: 'Asia/Manila' });

// ======= Startup =======

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[App] Medical Secretary Bot running on port ${PORT}`);
  console.log(`[App] Timezone: Asia/Manila`);
  console.log(`[App] Section: ${process.env.SECTION || '3B'}`);
});

// Telegram Bot 初期化
try {
  initBot();
} catch (err) {
  console.error('[App] Failed to init Telegram bot:', err.message);
}

// 起動時に初回カレンダー同期
console.log('[App] Running initial calendar sync...');
syncCalendar()
  .then((result) => {
    console.log(`[App] Initial sync complete: ${result.upserted} events, ${result.examCount} exams`);
  })
  .catch((err) => {
    console.error('[App] Initial sync failed:', err.message);
    sendErrorNotification('起動時カレンダー同期失敗', err).catch(() => {});
  });

// 未捕捉エラーハンドリング
process.on('uncaughtException', (err) => {
  console.error('[App] Uncaught exception:', err);
  sendErrorNotification('未捕捉エラー', err).catch(() => {});
});

process.on('unhandledRejection', (reason) => {
  console.error('[App] Unhandled rejection:', reason);
  sendErrorNotification('未処理Promise rejection', reason).catch(() => {});
});
