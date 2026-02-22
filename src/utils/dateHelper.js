'use strict';

const moment = require('moment-timezone');

const TZ = 'Asia/Manila';

/**
 * UTC日付文字列をManila時間のmomentオブジェクトに変換
 */
function toManila(utcDateStr) {
  return moment.utc(utcDateStr).tz(TZ);
}

/**
 * 今日のManila日付 (YYYY-MM-DD)
 */
function todayManila() {
  return moment().tz(TZ).format('YYYY-MM-DD');
}

/**
 * 明日のManila日付 (YYYY-MM-DD)
 */
function tomorrowManila() {
  return moment().tz(TZ).add(1, 'day').format('YYYY-MM-DD');
}

/**
 * 今週の開始・終了日 (YYYY-MM-DD)
 */
function thisWeekManila() {
  const now = moment().tz(TZ);
  return {
    start: now.clone().startOf('week').format('YYYY-MM-DD'),
    end: now.clone().endOf('week').format('YYYY-MM-DD'),
  };
}

/**
 * ターゲット日付までの残り日数（Manila時間ベース）
 */
function daysUntil(targetDateStr) {
  const now = moment().tz(TZ).startOf('day');
  const target = moment(targetDateStr).tz(TZ).startOf('day');
  return target.diff(now, 'days');
}

/**
 * 時刻フォーマット (08:00)
 */
function formatTime(dateStr) {
  return moment(dateStr).tz(TZ).format('HH:mm');
}

/**
 * 日付フォーマット (2月23日（月）)
 */
function formatDateJP(dateStr) {
  const m = moment(dateStr).tz(TZ);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${m.format('M月D日')}（${days[m.day()]}）`;
}

/**
 * 日付フォーマット (2/23)
 */
function formatDateShort(dateStr) {
  return moment(dateStr).tz(TZ).format('M/D');
}

/**
 * Manila時間の現在時刻
 */
function nowManila() {
  return moment().tz(TZ);
}

module.exports = {
  toManila,
  todayManila,
  tomorrowManila,
  thisWeekManila,
  daysUntil,
  formatTime,
  formatDateJP,
  formatDateShort,
  nowManila,
  TZ,
};
