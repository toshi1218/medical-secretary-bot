import axios from 'axios';

/**
 * カレンダーデータを取得
 * Google Apps Script エンドポイントからJSON取得を試み、
 * 失敗した場合はPuppeteerフォールバック
 */
export async function scrapeCalendar() {
  const calendarUrl = process.env.SCHOOL_CALENDAR_URL;
  const section = process.env.SECTION || '3B';

  if (!calendarUrl) {
    throw new Error('SCHOOL_CALENDAR_URL is not set');
  }

  // Google Apps Script URLの場合、JSON APIとして取得
  if (calendarUrl.includes('script.google.com') || calendarUrl.includes('spreadsheets')) {
    return await fetchCalendarJSON(calendarUrl, section);
  }

  // その他のURLはHTMLスクレイピング（Puppeteer）
  return await scrapeCalendarHTML(calendarUrl, section);
}

/**
 * Google Apps Script / JSON APIからカレンダーデータを取得
 */
async function fetchCalendarJSON(url, section) {
  try {
    const response = await axios.get(url, {
      params: { section },
      timeout: 30000
    });

    const data = response.data;

    // レスポンスが配列の場合
    const events = Array.isArray(data) ? data : (data.events || data.data || []);

    // イベントをパース正規化
    return events
      .filter(event => {
        // セクションフィルタ（データにsectionフィールドがある場合）
        if (event.section && !event.section.includes(section)) {
          return false;
        }
        return true;
      })
      .map(event => {
        const title = event.title || event.subject || event.name || '';
        const isExam = (event.color === 'red' || event.type === 'exam' ||
                       title.toUpperCase().includes('EXAM'));
        const activityType = isExam ? 'Exam' :
                            title.includes('SGD') ? 'SGD' :
                            title.includes('LGD') ? 'LGD' : 'Lecture';

        return {
          title,
          start_time: new Date(event.start || event.start_time || event.date).toISOString(),
          end_time: event.end || event.end_time ? new Date(event.end || event.end_time).toISOString() : null,
          room: event.room || event.location || null,
          faculty: event.faculty || event.teacher || event.instructor || null,
          topic: event.topic || event.description || null,
          color: event.color || null,
          activityType,
          isExam
        };
      })
      .filter(event => event.title && event.start_time);

  } catch (error) {
    console.error('Calendar JSON fetch failed:', error.message);
    throw new Error(`Calendar fetch failed: ${error.message}`);
  }
}

/**
 * HTMLページからカレンダーをスクレイピング（フォールバック用）
 * 注意: Vercel Hobby Planではバンドルサイズ制限により動作しない可能性あり
 */
async function scrapeCalendarHTML(calendarUrl, section) {
  let browser = null;

  try {
    // 動的インポート（Puppeteerが不要な場合にバンドルサイズを節約）
    const puppeteer = await import('puppeteer-core');
    const chromium = await import('@sparticuz/chromium');

    browser = await puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless
    });

    const page = await browser.newPage();

    await page.goto(calendarUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const events = await page.evaluate((targetSection) => {
      const eventElements = document.querySelectorAll('.calendar-event, .event-item, [data-event], tr, .fc-event');
      const results = [];

      eventElements.forEach(el => {
        try {
          const sectionText = el.textContent || '';
          if (targetSection && !sectionText.includes(targetSection)) {
            return;
          }

          const title = el.querySelector('.event-title, .title, h3, td:first-child')?.textContent?.trim();
          const timeText = el.querySelector('.event-time, .time, td:nth-child(2)')?.textContent?.trim();
          const room = el.querySelector('.event-room, .room, td:nth-child(3)')?.textContent?.trim();
          const faculty = el.querySelector('.event-faculty, .faculty, td:nth-child(4)')?.textContent?.trim();
          const topic = el.querySelector('.event-topic, .topic, td:nth-child(5)')?.textContent?.trim();
          const color = el.getAttribute('data-color') || el.style.backgroundColor;

          const isExam = color?.includes('red') || title?.toUpperCase().includes('EXAM');
          const activityType = isExam ? 'Exam' :
                               title?.includes('SGD') ? 'SGD' :
                               title?.includes('LGD') ? 'LGD' : 'Lecture';

          if (title && timeText) {
            results.push({ title, timeText, room, faculty, topic, color, activityType, isExam });
          }
        } catch (err) {
          // skip
        }
      });

      return results;
    }, section);

    const parsedEvents = events.map(event => {
      try {
        const dateMatch = event.timeText.match(/(\w+ \d{1,2},? \d{4})/);
        const timeMatch = event.timeText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/gi);

        if (dateMatch && timeMatch && timeMatch.length > 0) {
          const dateStr = dateMatch[1];
          const startTimeStr = timeMatch[0];
          const endTimeStr = timeMatch[1];

          const startTime = new Date(`${dateStr} ${startTimeStr}`);
          const endTime = endTimeStr ? new Date(`${dateStr} ${endTimeStr}`) : null;

          return {
            ...event,
            start_time: startTime.toISOString(),
            end_time: endTime?.toISOString() || null
          };
        }
      } catch (err) {
        // skip
      }
      return null;
    }).filter(Boolean);

    return parsedEvents;

  } catch (error) {
    console.error('Calendar HTML scraping failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 試験イベントのみを抽出
 */
export function extractExams(events) {
  return events.filter(event => event.isExam || event.activityType === 'Exam');
}

/**
 * イベントをデータベース形式に変換
 */
export function formatCalendarEvent(event) {
  return {
    title: event.title,
    start_time: event.start_time,
    end_time: event.end_time,
    room: event.room || null,
    faculty: event.faculty || null,
    topic: event.topic || null,
    activity_type: event.activityType || 'Other'
  };
}

/**
 * 試験をデータベース形式に変換
 */
export function formatExam(event) {
  const subjectMatch = event.title.match(/^([A-Za-z\s]+?)(?:\s+Module|\s+Exam|\s+\d+|$)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : event.title;

  return {
    subject,
    exam_date: event.start_time,
    room: event.room || null,
    faculty: event.faculty || null,
    topic: event.topic || null,
    exam_range: event.topic || null,
    color: event.color || 'red'
  };
}
