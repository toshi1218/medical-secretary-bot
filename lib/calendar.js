import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * カレンダーをスクレイピング
 */
export async function scrapeCalendar() {
  const calendarUrl = process.env.SCHOOL_CALENDAR_URL;
  const section = process.env.SECTION || '3B';

  if (!calendarUrl) {
    throw new Error('SCHOOL_CALENDAR_URL is not set');
  }

  let browser = null;

  try {
    // Vercel環境用のChromium設定
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    // カレンダーページにアクセス
    await page.goto(calendarUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // セクションでフィルタリング（必要に応じて調整）
    const events = await page.evaluate((targetSection) => {
      const eventElements = document.querySelectorAll('.calendar-event, .event-item, [data-event]');
      const results = [];

      eventElements.forEach(el => {
        try {
          // イベントのセクションをチェック
          const sectionText = el.textContent || '';
          if (!sectionText.includes(targetSection)) {
            return;  // スキップ
          }

          // イベント情報を抽出（サイトの構造に応じて調整が必要）
          const title = el.querySelector('.event-title, .title, h3')?.textContent?.trim();
          const timeText = el.querySelector('.event-time, .time')?.textContent?.trim();
          const room = el.querySelector('.event-room, .room')?.textContent?.trim();
          const faculty = el.querySelector('.event-faculty, .faculty')?.textContent?.trim();
          const topic = el.querySelector('.event-topic, .topic')?.textContent?.trim();
          const color = el.getAttribute('data-color') || el.style.backgroundColor;

          // 試験かどうかを判定
          const isExam = color?.includes('red') || title?.toUpperCase().includes('EXAM');
          const activityType = isExam ? 'Exam' :
                               title?.includes('SGD') ? 'SGD' :
                               title?.includes('LGD') ? 'LGD' : 'Lecture';

          if (title && timeText) {
            results.push({
              title,
              timeText,
              room,
              faculty,
              topic,
              color,
              activityType,
              isExam
            });
          }
        } catch (err) {
          console.error('Error parsing event:', err);
        }
      });

      return results;
    }, section);

    // 日時をパース
    const parsedEvents = events.map(event => {
      try {
        // timeTextから日時を抽出（サイトの形式に応じて調整）
        // 例: "Feb 15, 2024 8:00 AM - 10:00 AM"
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
        console.error('Error parsing date:', err);
      }

      return null;
    }).filter(Boolean);

    return parsedEvents;

  } catch (error) {
    console.error('Calendar scraping failed:', error);
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
  // タイトルから科目名を抽出
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
