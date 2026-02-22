'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'bot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ========== Calendar Events ==========

function upsertCalendarEvent(event) {
  const stmt = db.prepare(`
    INSERT INTO calendar_events
      (event_id, title, subject, activity, start_time, end_time, room, faculty, topic, department, color, is_exam, synced_at)
    VALUES
      (@event_id, @title, @subject, @activity, @start_time, @end_time, @room, @faculty, @topic, @department, @color, @is_exam, datetime('now'))
    ON CONFLICT(event_id) DO UPDATE SET
      title = excluded.title,
      subject = excluded.subject,
      activity = excluded.activity,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      room = excluded.room,
      faculty = excluded.faculty,
      topic = excluded.topic,
      department = excluded.department,
      color = excluded.color,
      is_exam = excluded.is_exam,
      synced_at = datetime('now')
  `);
  return stmt.run(event);
}

function getEventsByDate(dateStr) {
  // dateStr: 'YYYY-MM-DD' in Manila time
  return db.prepare(`
    SELECT * FROM calendar_events
    WHERE date(start_time) = ?
    ORDER BY start_time ASC
  `).all(dateStr);
}

function getEventsForWeek(startDateStr, endDateStr) {
  return db.prepare(`
    SELECT * FROM calendar_events
    WHERE date(start_time) >= ? AND date(start_time) <= ?
    ORDER BY start_time ASC
  `).all(startDateStr, endDateStr);
}

// ========== Exams ==========

function upsertExam(exam) {
  const stmt = db.prepare(`
    INSERT INTO exams
      (event_id, subject, exam_date, room, faculty, topic, color)
    VALUES
      (@event_id, @subject, @exam_date, @room, @faculty, @topic, @color)
    ON CONFLICT(event_id) DO UPDATE SET
      subject = excluded.subject,
      exam_date = excluded.exam_date,
      room = excluded.room,
      faculty = excluded.faculty,
      topic = excluded.topic,
      color = excluded.color
  `);
  return stmt.run(exam);
}

function getUpcomingExams(limit = 10) {
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM exams
    WHERE exam_date >= ?
    ORDER BY exam_date ASC
    LIMIT ?
  `).all(now, limit);
}

function getAllExams() {
  return db.prepare(`
    SELECT * FROM exams
    ORDER BY exam_date ASC
  `).all();
}

// ========== Tasks ==========

function createTask(task) {
  const stmt = db.prepare(`
    INSERT INTO tasks (title, description, deadline, source, group_name, message_id)
    VALUES (@title, @description, @deadline, @source, @group_name, @message_id)
  `);
  return stmt.run(task);
}

function getPendingTasks() {
  return db.prepare(`
    SELECT * FROM tasks
    WHERE completed = 0
    ORDER BY deadline ASC NULLS LAST
  `).all();
}

function completeTask(id) {
  return db.prepare(`UPDATE tasks SET completed = 1 WHERE id = ?`).run(id);
}

// ========== WhatsApp Files ==========

function createWhatsAppFile(file) {
  const stmt = db.prepare(`
    INSERT INTO whatsapp_files (filename, subject, group_name, file_type, file_path, mime_type)
    VALUES (@filename, @subject, @group_name, @file_type, @file_path, @mime_type)
  `);
  const result = stmt.run(file);
  return result.lastInsertRowid;
}

function getFilesBySubject(subject) {
  return db.prepare(`
    SELECT * FROM whatsapp_files
    WHERE subject LIKE ?
    ORDER BY download_date DESC
  `).all(`%${subject}%`);
}

function getRecentFiles(days = 7) {
  return db.prepare(`
    SELECT * FROM whatsapp_files
    WHERE download_date >= datetime('now', ?)
    ORDER BY download_date DESC
  `).all(`-${days} days`);
}

// ========== Image OCR ==========

function createOCRRecord(ocr) {
  const stmt = db.prepare(`
    INSERT INTO image_ocr (file_id, filename, subject, group_name, file_path, ocr_text)
    VALUES (@file_id, @filename, @subject, @group_name, @file_path, @ocr_text)
  `);
  return stmt.run(ocr);
}

function searchOCRText(keyword) {
  return db.prepare(`
    SELECT * FROM image_ocr
    WHERE ocr_text LIKE ?
    ORDER BY processed_at DESC
    LIMIT 20
  `).all(`%${keyword}%`);
}

module.exports = {
  db,
  upsertCalendarEvent,
  getEventsByDate,
  getEventsForWeek,
  upsertExam,
  getUpcomingExams,
  getAllExams,
  createTask,
  getPendingTasks,
  completeTask,
  createWhatsAppFile,
  getFilesBySubject,
  getRecentFiles,
  createOCRRecord,
  searchOCRText,
};
