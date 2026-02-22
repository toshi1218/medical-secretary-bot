'use strict';

const {
  getEventsByDate,
  getUpcomingExams,
  getPendingTasks,
  getRecentFiles,
} = require('../database/db');
const { sendMessage, sendErrorNotification } = require('./bot');
const {
  todayManila,
  tomorrowManila,
  daysUntil,
  formatTime,
  formatDateJP,
  formatDateShort,
} = require('../utils/dateHelper');

/**
 * アクティビティ絵文字
 */
function activityEmoji(activity) {
  const map = {
    Lecture: '📖',
    SGD: '👥',
    Exam: '🔴',
    Clinics: '🏥',
    Practical: '🔬',
    'Reporting/Presentation': '🎤',
    HOLIDAY: '🎌',
    Other: '📌',
  };
  return map[activity] || '📌';
}

/**
 * イベントを通知用テキストにフォーマット
 */
function formatEventBlock(event) {
  const start = formatTime(event.start_time);
  const end = event.end_time ? formatTime(event.end_time) : '';
  const timeStr = end ? `${start}-${end}` : start;
  const emoji = event.is_exam ? '🔴' : activityEmoji(event.activity);
  const lines = [];
  lines.push(`${emoji} ${timeStr} [${event.activity || 'Other'}]`);
  lines.push(`   📖 ${event.subject || event.title}${event.topic ? ` - ${event.topic}` : ''}`);
  if (event.room) lines.push(`   🏫 Room: ${event.room}`);
  if (event.faculty) lines.push(`   👨‍⚕️ ${event.faculty}`);
  return lines.join('\n');
}

/**
 * 試験カウントダウンブロック
 */
function formatExamCountdown(exam) {
  const days = daysUntil(exam.exam_date);
  if (days < 0) return null;

  const urgencyEmoji = days <= 1 ? '🚨' : days <= 3 ? '🔴' : days <= 7 ? '🟡' : '🟢';
  const lines = [];
  lines.push(`${urgencyEmoji} ${exam.subject} EXAM — 残り${days}日`);
  lines.push(`   └ ${formatDateJP(exam.exam_date)} ${formatTime(exam.exam_date)}`);
  if (exam.room) lines.push(`   └ Room: ${exam.room}`);
  if (exam.topic) lines.push(`   └ 範囲: ${exam.topic}`);
  return lines.join('\n');
}

/**
 * 前日22:00 — 準備確認通知
 */
async function sendPreparationNotification() {
  console.log('[Notifications] Sending preparation notification...');
  try {
    const tomorrowDate = tomorrowManila();
    const events = getEventsByDate(tomorrowDate);
    const tasks = getPendingTasks();
    const exams = getUpcomingExams(5);
    const recentFiles = getRecentFiles(7);

    const lines = [];
    lines.push(`📚 明日の準備確認`);
    lines.push(`📅 ${formatDateJP(tomorrowDate + 'T00:00:00')}の予定`);
    lines.push('');

    if (events.length === 0) {
      lines.push('予定はありません。');
    } else {
      for (const e of events) {
        // キャンセルイベントはスキップ
        if (e.topic && e.topic.includes('[CLASS CANCELLED]')) continue;
        // Reserved Scheduleは簡略表示
        if (e.subject === 'Reserved Schedule') {
          lines.push(`📌 ${formatTime(e.start_time)}-${formatTime(e.end_time)} Reserved Schedule`);
          continue;
        }
        lines.push(formatEventBlock(e));
      }
    }

    // 未完了タスク
    const pendingTasks = tasks.filter((t) => {
      if (!t.deadline) return true;
      return daysUntil(t.deadline) <= 1;
    });
    if (pendingTasks.length > 0) {
      lines.push('');
      lines.push('⚠️ 提出物・タスク');
      for (const task of pendingTasks.slice(0, 5)) {
        let line = `・${task.title.substring(0, 80)}`;
        if (task.deadline) line += ` (${formatDateShort(task.deadline)})`;
        lines.push(line);
      }
    }

    // 過去7日の共有ファイル
    if (recentFiles.length > 0) {
      lines.push('');
      lines.push('📎 共有済みファイル（過去7日）');
      for (const f of recentFiles.slice(0, 5)) {
        lines.push(`✅ ${f.filename}`);
      }
    }

    // 試験カウントダウン
    const upcomingExams = exams.filter((e) => daysUntil(e.exam_date) >= 0);
    if (upcomingExams.length > 0) {
      lines.push('');
      lines.push('🔴 試験カウントダウン');
      for (const exam of upcomingExams.slice(0, 3)) {
        const block = formatExamCountdown(exam);
        if (block) lines.push(block);
      }
    }

    await sendMessage(lines.join('\n'));
    console.log('[Notifications] Preparation notification sent.');
  } catch (err) {
    console.error('[Notifications] sendPreparationNotification error:', err.message);
    await sendErrorNotification('前日通知エラー', err);
  }
}

/**
 * 当日07:00 — 朝の日次ブリーフィング
 */
async function sendDailyBriefing() {
  console.log('[Notifications] Sending daily briefing...');
  try {
    const todayDate = todayManila();
    const events = getEventsByDate(todayDate);
    const tasks = getPendingTasks();
    const exams = getUpcomingExams(5);

    const lines = [];
    lines.push(`☀️ おはようございます、CEO`);
    lines.push(`📅 ${formatDateJP(todayDate + 'T00:00:00')}`);
    lines.push('');
    lines.push('━━━ 今日のスケジュール ━━━');
    lines.push('');

    if (events.length === 0) {
      lines.push('今日の予定はありません。');
    } else {
      for (const e of events) {
        if (e.topic && e.topic.includes('[CLASS CANCELLED]')) continue;
        if (e.subject === 'Reserved Schedule') {
          lines.push(`📌 ${formatTime(e.start_time)}-${formatTime(e.end_time)} Reserved Schedule`);
          continue;
        }
        lines.push(formatEventBlock(e));
        lines.push('');
      }
    }

    // 締切タスク
    const todayTasks = tasks.filter((t) => {
      if (!t.deadline) return false;
      return daysUntil(t.deadline) === 0;
    });
    lines.push('━━━ 締切・タスク ━━━');
    if (todayTasks.length === 0) {
      lines.push('⚠️ なし');
    } else {
      for (const task of todayTasks) {
        lines.push(`⚠️ ${task.title.substring(0, 80)}`);
      }
    }
    lines.push('');

    // 試験カウントダウン（上位3件）
    const upcomingExams = exams.filter((e) => daysUntil(e.exam_date) >= 0);
    if (upcomingExams.length > 0) {
      lines.push('━━━ 試験まで ━━━');
      for (const exam of upcomingExams.slice(0, 3)) {
        const block = formatExamCountdown(exam);
        if (block) lines.push(block);
      }
    }

    await sendMessage(lines.join('\n'));
    console.log('[Notifications] Daily briefing sent.');
  } catch (err) {
    console.error('[Notifications] sendDailyBriefing error:', err.message);
    await sendErrorNotification('朝の通知エラー', err);
  }
}

/**
 * 毎日20:00 — 試験3日前アラートチェック
 */
async function checkExamAlerts() {
  console.log('[Notifications] Checking exam alerts...');
  try {
    const exams = getUpcomingExams(10);

    for (const exam of exams) {
      const days = daysUntil(exam.exam_date);

      // 3日前、2日前、1日前のみアラート
      if (days === 3 || days === 2 || days === 1) {
        await sendExamAlert(exam, days);
      }
    }
  } catch (err) {
    console.error('[Notifications] checkExamAlerts error:', err.message);
    await sendErrorNotification('試験アラートエラー', err);
  }
}

/**
 * 試験アラートメッセージを送信
 */
async function sendExamAlert(exam, daysLeft) {
  const lines = [];
  lines.push(`🚨 試験${daysLeft}日前アラート`);
  lines.push('');
  lines.push(`🔴 ${exam.subject} MODULE EXAM`);
  lines.push(`📅 ${formatDateJP(exam.exam_date)} ${formatTime(exam.exam_date)}`);
  if (exam.room) lines.push(`🏫 Room: ${exam.room}`);
  lines.push(`⏰ 残り：${daysLeft}日`);

  if (exam.topic) {
    lines.push('');
    lines.push(`📚 試験範囲：`);
    lines.push(exam.topic);
  }

  lines.push('');
  lines.push('✅ 復習計画');
  lines.push(`・残り復習可能回数：${daysLeft}回`);
  lines.push('・1回あたり推奨時間：2-3時間');
  lines.push('・今日中に1回目完了を推奨');

  lines.push('');
  lines.push('⚠️ 準備チェックリスト');
  lines.push('□ 過去問確認');
  lines.push('□ ノート総復習');
  lines.push('□ SGD資料整理');
  lines.push('□ WhatsApp共有ファイル確認');

  await sendMessage(lines.join('\n'));
  console.log(`[Notifications] Exam alert sent for ${exam.subject} (${daysLeft} days left)`);
}

module.exports = {
  sendPreparationNotification,
  sendDailyBriefing,
  checkExamAlerts,
  sendExamAlert,
};
