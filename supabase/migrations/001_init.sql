-- Medical Secretary Bot Database Schema for Supabase (PostgreSQL)

-- 試験テーブル
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  exam_date TIMESTAMPTZ NOT NULL,
  room TEXT,
  faculty TEXT,
  topic TEXT,
  exam_range TEXT,
  color TEXT,
  reviews_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 課題テーブル
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  source TEXT CHECK (source IN ('whatsapp', 'calendar')),
  group_name TEXT,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsAppファイルテーブル
CREATE TABLE IF NOT EXISTS whatsapp_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  subject TEXT,
  group_name TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('document', 'image')),
  file_url TEXT NOT NULL,  -- Supabase Storage URL
  download_date TIMESTAMPTZ DEFAULT NOW()
);

-- OCRテーブル
CREATE TABLE IF NOT EXISTS image_ocr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  subject TEXT,
  group_name TEXT,
  file_url TEXT,  -- Supabase Storage URL
  ocr_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- カレンダーイベントテーブル
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  room TEXT,
  faculty TEXT,
  topic TEXT,
  activity_type TEXT CHECK (activity_type IN ('Lecture', 'SGD', 'LGD', 'Exam', 'Other')),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_exams_date ON exams(exam_date);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_whatsapp_files_group ON whatsapp_files(group_name);
CREATE INDEX IF NOT EXISTS idx_image_ocr_subject ON image_ocr(subject);

-- フルテキスト検索用のインデックス（OCR検索用）
CREATE INDEX IF NOT EXISTS idx_image_ocr_text ON image_ocr USING GIN (to_tsvector('english', ocr_text));

-- Row Level Security (RLS) 有効化
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_ocr ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Service Role用のポリシー（すべての操作を許可）
CREATE POLICY "Service role can do everything on exams" ON exams
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on tasks" ON tasks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on whatsapp_files" ON whatsapp_files
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on image_ocr" ON image_ocr
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can do everything on calendar_events" ON calendar_events
  FOR ALL USING (auth.role() = 'service_role');
