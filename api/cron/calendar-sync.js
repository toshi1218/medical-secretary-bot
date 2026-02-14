import { scrapeCalendar, formatCalendarEvent, formatExam } from '../../lib/calendar.js';
import { upsertCalendarEvent, upsertExam } from '../../lib/db.js';
import { sendCustomNotification } from '../../lib/telegram.js';

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting calendar sync...');

    const events = await scrapeCalendar();
    console.log(`Found ${events.length} events`);

    let syncedEvents = 0;
    let syncedExams = 0;

    for (const event of events) {
      try {
        const eventData = formatCalendarEvent(event);
        await upsertCalendarEvent(eventData);
        syncedEvents++;

        if (event.isExam) {
          const examData = formatExam(event);
          await upsertExam(examData);
          syncedExams++;
        }
      } catch (error) {
        console.error('Error syncing event:', event?.title, error);
      }
    }

    const message = `Calendar sync completed\nEvents: ${syncedEvents}\nExams: ${syncedExams}`;
    console.log(message);

    if (syncedExams > 0) {
      try {
        await sendCustomNotification('Calendar Sync', message);
      } catch (notifyError) {
        console.error('Failed to send calendar sync notification:', notifyError);
      }
    }

    return res.status(200).json({
      success: true,
      syncedEvents,
      syncedExams
    });
  } catch (error) {
    console.error('Calendar sync failed:', error);

    try {
      await sendCustomNotification('Calendar Sync Error', `Error: ${error.message}`);
    } catch (notifyError) {
      console.error('Failed to send error notification:', notifyError);
    }

    return res.status(500).json({ error: error.message });
  }
}
