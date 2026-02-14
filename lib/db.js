import { getSupabaseClient } from './supabase.js';

/**
 * データベース操作用のヘルパー関数
 */

// ========== 試験 (Exams) ==========

export async function getUpcomingExams() {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .gte('exam_date', now)
    .order('exam_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createExam(examData) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('exams')
    .insert([examData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateExam(id, updates) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('exams')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteExam(id) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('exams')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

// ========== 課題 (Tasks) ==========

export async function getPendingTasks() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('completed', false)
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function createTask(taskData) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('tasks')
    .insert([taskData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function completeTask(id) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('tasks')
    .update({ completed: true })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ========== カレンダーイベント (Calendar Events) ==========

export async function getTodayEvents() {
  const supabase = getSupabaseClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('start_time', today.toISOString())
    .lt('start_time', tomorrow.toISOString())
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getTomorrowEvents() {
  const supabase = getSupabaseClient();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('start_time', tomorrow.toISOString())
    .lt('start_time', dayAfterTomorrow.toISOString())
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createCalendarEvent(eventData) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('calendar_events')
    .insert([eventData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertCalendarEvent(eventData) {
  const supabase = getSupabaseClient();

  // 同じ時間とタイトルのイベントがあれば更新、なければ挿入
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('title', eventData.title)
    .eq('start_time', eventData.start_time)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('calendar_events')
      .update({ ...eventData, synced_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    return createCalendarEvent(eventData);
  }
}

// ========== WhatsAppファイル (WhatsApp Files) ==========

export async function createWhatsAppFile(fileData) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('whatsapp_files')
    .insert([fileData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getFilesBySubject(subject) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('whatsapp_files')
    .select('*')
    .eq('subject', subject)
    .order('download_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ========== OCR (Image OCR) ==========

export async function createOCRRecord(ocrData) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('image_ocr')
    .insert([ocrData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function searchOCRText(keyword) {
  const supabase = getSupabaseClient();

  // フルテキスト検索
  const { data, error } = await supabase
    .from('image_ocr')
    .select('*')
    .textSearch('ocr_text', keyword)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
