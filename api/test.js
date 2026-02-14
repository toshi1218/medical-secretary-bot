/**
 * ヘルスチェック用エンドポイント
 */
export default async function handler(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: 'Medical Secretary Bot (Vercel)',
    timestamp: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
      hasWhapiToken: !!process.env.WHAPI_TOKEN,
      hasGeminiKey: !!process.env.GEMINI_API_KEY
    }
  });
}
