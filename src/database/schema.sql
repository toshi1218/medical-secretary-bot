CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  title TEXT,
  subject TEXT,
  activity TEXT,
  start_time DATETIME,
  end_time DATETIME,
  room TEXT,
  faculty TEXT,
  topic TEXT,
  department TEXT,
  color TEXT,
  is_exam BOOLEAN DEFAULT 0,
  synced_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  subject TEXT,
  exam_date DATETIME,
  room TEXT,
  faculty TEXT,
  topic TEXT,
  color TEXT,
  reviews_completed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  deadline DATETIME,
  source TEXT,
  group_name TEXT,
  message_id TEXT,
  completed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS whatsapp_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  subject TEXT,
  group_name TEXT,
  file_type TEXT,
  file_path TEXT,
  mime_type TEXT,
  download_date DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS image_ocr (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER REFERENCES whatsapp_files(id),
  filename TEXT,
  subject TEXT,
  group_name TEXT,
  file_path TEXT,
  ocr_text TEXT,
  processed_at DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_exam ON calendar_events(is_exam);
CREATE INDEX IF NOT EXISTS idx_exams_date ON exams(exam_date);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_ocr_text ON image_ocr(ocr_text);
