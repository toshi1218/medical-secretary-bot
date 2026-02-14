import { createClient } from '@supabase/supabase-js';

let supabase = null;

/**
 * Supabase クライアントのシングルトンインスタンスを取得
 */
export function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials in environment variables');
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return supabase;
}

/**
 * Supabase Storage にファイルをアップロード
 */
export async function uploadFile(bucket, path, file, contentType) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: false
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // 公開URLを取得
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return { data, publicUrl };
}

/**
 * Supabase Storage からファイルを削除
 */
export async function deleteFile(bucket, path) {
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }

  return true;
}
