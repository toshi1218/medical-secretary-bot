# 医療秘書システム (Medical Secretary System)

Vercel + Supabase で動作する医学生向けの統合秘書システム。WhatsApp監視、カレンダー同期、Telegram通知を完全自動化。

## 🎯 主な機能

### 1. WhatsApp監視（Whapi API）
- 監視対象グループからファイル・画像を自動ダウンロード
- Supabase Storageに保存
- 画像はGemini OCRで自動テキスト抽出
- 科目名・期限を自動認識

### 2. カレンダー自動同期
- 学校カレンダーを毎時スクレイピング（Puppeteer）
- 授業・試験情報を自動抽出
- Supabase PostgreSQLに保存

### 3. Telegram通知
- **毎朝7:00** - 今日の予定 + 試験カウントダウン
- **毎晩22:00** - 明日の準備確認
- **試験3日前** - 特別アラート
- リアルタイムでWhatsApp通知

### 4. Gemini OCR
- 医学教育資料の画像から正確にテキスト抽出
- 科目名・モジュール番号・提出期限を自動認識

## 🛠️ 技術スタック

- **Frontend/Backend**: Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Scheduler**: Vercel Cron Jobs
- **WhatsApp**: Whapi API
- **OCR**: Google Gemini API
- **Notifications**: Telegram Bot API
- **Scraping**: Puppeteer + @sparticuz/chromium

## 📦 プロジェクト構造

```
medical-secretary-bot/
├── api/                          # Vercel Serverless Functions
│   ├── webhook/
│   │   └── whapi.js             # WhatsApp Webhook
│   ├── cron/
│   │   ├── calendar-sync.js     # カレンダー同期（毎時）
│   │   ├── morning-notification.js  # 朝の通知（7:00）
│   │   └── evening-notification.js  # 夜の通知（22:00）
│   └── test.js                  # ヘルスチェック
├── lib/                          # 共通ロジック
│   ├── supabase.js              # Supabase クライアント
│   ├── db.js                    # データベース操作
│   ├── telegram.js              # Telegram API
│   ├── whapi.js                 # Whapi API クライアント
│   ├── gemini.js                # Gemini OCR
│   └── calendar.js              # カレンダースクレイパー
├── supabase/
│   └── migrations/
│       └── 001_init.sql         # DBスキーマ
├── package.json
├── vercel.json                  # Vercel設定（Cron含む）
└── .env.example                 # 環境変数テンプレート
```

## 🚀 デプロイ手順

### 1. Supabase セットアップ

1. [Supabase](https://supabase.com) でプロジェクト作成
2. **SQL Editor** で `supabase/migrations/001_init.sql` を実行
3. **Storage** で以下のバケットを作成:
   - `whatsapp-images` (Public)
   - `whatsapp-documents` (Public)
4. **Settings > API** から以下をコピー:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`

### 2. API設定

#### Telegram Bot
1. [@BotFather](https://t.me/BotFather) で `/newbot` コマンド実行
2. Bot名とユーザー名を設定
3. `TELEGRAM_BOT_TOKEN` をコピー
4. Botに `/start` メッセージ送信
5. `https://api.telegram.org/bot<TOKEN>/getUpdates` にアクセスして `chat_id` を取得

#### Whapi API
1. [Whapi.cloud](https://whapi.cloud) でアカウント作成
2. WhatsAppアカウントを連携
3. `WHAPI_TOKEN` をコピー

#### Google Gemini API
1. [Google AI Studio](https://aistudio.google.com/app/apikey) にアクセス
2. API Keyを作成
3. `GEMINI_API_KEY` をコピー

### 3. Vercel デプロイ

```bash
# Vercel CLIインストール（初回のみ）
npm install -g vercel

# プロジェクトディレクトリに移動
cd medical-secretary-bot

# Vercelにログイン
vercel login

# 環境変数を設定
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_KEY
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_CHAT_ID
vercel env add WHAPI_TOKEN
vercel env add GEMINI_API_KEY
vercel env add SCHOOL_CALENDAR_URL
vercel env add SECTION
vercel env add TZ
vercel env add CRON_SECRET

# デプロイ
vercel --prod
```

### 4. Whapi Webhook設定

1. Whapi Dashboard > **Settings** > **Webhooks**
2. Webhook URL: `https://your-app.vercel.app/api/webhook/whapi`
3. Events: **messages** をチェック
4. **Save**

### 5. 動作確認

```bash
# ヘルスチェック
curl https://your-app.vercel.app/api/test

# カレンダー同期テスト
curl -X POST https://your-app.vercel.app/api/cron/calendar-sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## 📝 環境変数

`.env.example` を参考に以下を設定:

| 変数名 | 説明 |
|--------|------|
| `SUPABASE_URL` | Supabaseプロジェクト URL |
| `SUPABASE_ANON_KEY` | Supabase Anon Key |
| `SUPABASE_SERVICE_KEY` | Supabase Service Role Key |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | あなたのTelegram Chat ID |
| `WHAPI_TOKEN` | Whapi API Token |
| `GEMINI_API_KEY` | Google Gemini API Key |
| `SCHOOL_CALENDAR_URL` | 学校カレンダーのURL |
| `SECTION` | あなたのセクション（例: 3B） |
| `TZ` | タイムゾーン（例: Asia/Manila） |
| `CRON_SECRET` | Cron認証用シークレット（ランダム文字列） |

## 🔄 Cron Jobsスケジュール

`vercel.json` で設定済み:

- **毎時0分** - カレンダー同期
- **毎日7:00** - 朝の通知
- **毎日22:00** - 夜の準備通知

## 📊 データベーススキーマ

### exams（試験）
- 科目、試験日、教室、教員、トピック、試験範囲

### tasks（課題）
- タイトル、期限、ソース（WhatsApp/カレンダー）、完了状態

### whatsapp_files（WhatsAppファイル）
- ファイル名、科目、グループ名、ファイルタイプ、URL

### image_ocr（OCR結果）
- ファイル名、科目、グループ名、OCRテキスト

### calendar_events（カレンダーイベント）
- タイトル、開始時間、終了時間、教室、教員、活動タイプ

## 🎮 使い方

### 自動動作
- WhatsAppグループに投稿されたファイルは自動保存
- カレンダーは毎時自動同期
- Telegram通知は自動送信

### 手動操作
今後、Telegram Botコマンドを追加予定:
- `/today` - 今日の予定
- `/exams` - 今後の試験
- `/tasks` - 未完了の課題
- `/files <科目>` - ファイル一覧
- `/search <キーワード>` - OCR検索

## 🔐 セキュリティ

- Supabase Row Level Security（RLS）有効化
- Vercel環境変数で秘密情報を管理
- Cron Jobs認証（CRON_SECRET）
- HTTPS通信（Vercel自動対応）

## 📈 今後の拡張

- [ ] Telegram Botコマンド実装
- [ ] 課題自動抽出（AI）
- [ ] 成績管理機能
- [ ] 出席管理機能
- [ ] Web UIダッシュボード

## 📄 ライセンス

MIT License

## 🆘 サポート

問題が発生した場合:
1. `/api/test` でヘルスチェック
2. Vercel Logsを確認
3. Supabase Logsを確認
4. GitHub Issueを作成

---

**製作者**: CEO Medical Student
**バージョン**: 1.0.0
