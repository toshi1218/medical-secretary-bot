'use strict';

const puppeteer = require('puppeteer');
const { upsertCalendarEvent, upsertExam } = require('../database/db');
const { toManila } = require('../utils/dateHelper');

/**
 * アクティビティタイプと色から試験かどうかを判定
 */
function isExamEvent(event) {
  if (!event) return false;
  const activity = event.extendedProps?.activity || '';
  const color = event.color || '';
  return (
    color === '#FF6666' ||
    activity === 'Exam' ||
    activity === 'Exam (Manual)'
  );
}

/**
 * アクティビティ種別を正規化
 */
function normalizeActivity(activity) {
  if (!activity) return 'Other';
  const map = {
    'Lecture': 'Lecture',
    'SGD': 'SGD',
    'Clinics': 'Clinics',
    'Practical': 'Practical',
    'Reporting/Presentation': 'Reporting/Presentation',
    'HOLIDAY': 'HOLIDAY',
    'Exam': 'Exam',
    'Exam (Manual)': 'Exam',
    'Other': 'Other',
  };
  return map[activity] || activity;
}

/**
 * カレンダーイベントをDBレコード形式に変換
 * APIのstart/endはUTC → Manila時間に変換してDB保存
 */
function toDBRecord(event) {
  const ext = event.extendedProps || {};
  const startManila = toManila(event.start).format('YYYY-MM-DD HH:mm:ss');
  const endManila = event.end ? toManila(event.end).format('YYYY-MM-DD HH:mm:ss') : null;
  const isExam = isExamEvent(event) ? 1 : 0;

  // キャンセルイベントはスキップ用フラグ
  const isCancelled = (ext.topic || '').includes('[CLASS CANCELLED]');

  return {
    event_id: ext.meuTTid || null,
    title: event.title || '',
    subject: ext.subjectID || '',
    activity: normalizeActivity(ext.activity),
    start_time: startManila,
    end_time: endManila,
    room: ext.roomID || null,
    faculty: ext.faculty || null,
    topic: ext.topic || null,
    department: ext.departmentID || null,
    color: event.color || null,
    is_exam: isExam,
    _isCancelled: isCancelled,
  };
}

/**
 * GASカレンダーからデータを取得（Puppeteerでインターセプト）
 */
async function fetchCalendarData() {
  const calendarUrl = process.env.SCHOOL_CALENDAR_URL;
  const section = process.env.SECTION || '3B';

  if (!calendarUrl) {
    throw new Error('SCHOOL_CALENDAR_URL is not set');
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
  });

  let calendarData = null;

  try {
    const page = await browser.newPage();

    // メモリ節約のため不要リソースをブロック
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // GASコールバックレスポンスをインターセプト
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('callback?nocache_id=') || url.includes('callback?')) {
        try {
          const text = await response.text();
          // フォーマット: )\n]\n}'\n\n[["op.exec",[0,"ESCAPED_JSON"]],["di",N]]
          const startIdx = text.indexOf('[[');
          if (startIdx >= 0) {
            const payload = text.substring(startIdx);
            const outer = JSON.parse(payload);
            // outer[0][1][1] が内部JSONの文字列
            const innerStr = outer[0][1][1];
            if (innerStr) {
              calendarData = JSON.parse(innerStr);
              console.log(`[Calendar] Intercepted: ${calendarData?.events?.length || 0} total events`);
            }
          }
        } catch (e) {
          // 別のcallbackレスポンスの可能性あり、無視
        }
      }
    });

    await page.goto(calendarUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // ページロード完了後少し待機してcallbackを確実に受け取る
    await new Promise((resolve) => setTimeout(resolve, 2000));

  } finally {
    await browser.close();
  }

  if (!calendarData) {
    throw new Error('Failed to intercept calendar data from GAS');
  }

  // 対象セクションのみフィルタ
  const events = (calendarData.events || []).filter(
    (e) => e.extendedProps?.sectionID === section
  );

  console.log(`[Calendar] ${section} events: ${events.length}`);
  return events;
}

/**
 * カレンダーデータを取得してDBに保存
 */
async function syncCalendar() {
  console.log('[Calendar] Starting sync...');
  try {
    const events = await fetchCalendarData();
    let upserted = 0;
    let examCount = 0;
    let skipped = 0;

    for (const event of events) {
      const record = toDBRecord(event);

      // キャンセルイベントはスキップ
      if (record._isCancelled) {
        skipped++;
        continue;
      }

      // event_idがない場合はskip（meuTTidがないレコードは重複管理できない）
      if (!record.event_id) {
        skipped++;
        continue;
      }

      // _isCancelledフラグはDBに保存しない
      const { _isCancelled, ...dbRecord } = record;
      upsertCalendarEvent(dbRecord);
      upserted++;

      // 試験イベントは別テーブルにも保存
      if (record.is_exam) {
        upsertExam({
          event_id: record.event_id,
          subject: record.subject,
          exam_date: record.start_time,
          room: record.room,
          faculty: record.faculty,
          topic: record.topic,
          color: record.color,
        });
        examCount++;
      }
    }

    console.log(`[Calendar] Sync complete: ${upserted} upserted, ${examCount} exams, ${skipped} skipped`);
    return { upserted, examCount, skipped };
  } catch (err) {
    console.error('[Calendar] Sync failed:', err.message);
    throw err;
  }
}

module.exports = { syncCalendar, fetchCalendarData };
