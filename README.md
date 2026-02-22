# Medical Secretary Bot

Gullas College of Medicine 3B向け自動秘書 Telegram Bot。
GASカレンダー + WhatsApp監視を統合し、毎日自動プッシュ通知。

## 🏗️ 技術スタック

| 項目 | 採用 |
|------|------|
| 実行環境 | **Google Cloud e2-micro**（Always Free / Ubuntu 22.04） |
| データベース | **SQLite**（better-sqlite3 / WAL mode） |
| スケジューラ | **node-cron**（Asia/Manila） |
| カレンダー取得 | **Puppeteer**（GASレスポンスインターセプト） |
| OCR | **Gemini 2.0 Flash** |
| WhatsApp | **Whapi API** |
| 通知 | **Telegram Bot API** |
| プロセス管理 | **PM2** |

## 📁 ディレクトリ構成

```
src/
├── index.js                 # メインエントリ（Express + cron）
├── calendar/scraper.js      # GASカレンダー取得・保存
├── database/
│   ├── db.js                # SQLite初期化・ヘルパー
│   └── schema.sql           # テーブル定義
├── ocr/gemini.js            # Gemini 2.0 Flash OCR
├── telegram/
│   ├── bot.js               # コマンドハンドラ（9コマンド）
│   └── notifications.js     # 定時通知（4種）
├── utils/dateHelper.js      # Manila時間ユーティリティ
└── whapi/
    ├── client.js            # Whapi APIクライアント
    └── webhook.js           # Webhookハンドラ
data/bot.db                  # SQLiteデータベース（gitignore済）
downloads/                   # WhatsAppダウンロードファイル
```

## 🤖 Telegram コマンド

| コマンド | 説明 |
|---------|------|
| `/today` | 今日の予定詳細（時間順） |
| `/tomorrow` | 明日の予定詳細 |
| `/week` | 今週の予定概要 |
| `/exams` | 全試験一覧＋カウントダウン |
| `/tasks` | 未完了タスク一覧 |
| `/files [科目名]` | WhatsAppファイル一覧 |
| `/search [キーワード]` | OCRテキスト全文検索 |
| `/sync` | カレンダー手動同期 |
| `/help` | コマンド一覧 |

## ⏰ 定時通知スケジュール

| 時刻 | 内容 |
|-----|------|
| 07:00 | 今日のスケジュール＋締切 |
| 20:00 | 試験3日前アラートチェック |
| 22:00 | 明日の準備確認 |
| 3時間ごと | カレンダー自動同期 |

---

## 🚀 デプロイ手順（Google Cloud e2-micro）

### ステップ 1 — GCP VMを作成

> Always Free対象リージョン: `us-central1` / `us-east1` / `us-west1`

**Google Cloud Console** または gcloud CLI で作成:

```bash
gcloud compute instances create medical-bot \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=medical-bot
```

### ステップ 2 — 静的IPを取得（Webhook用）

VMのIPが再起動のたびに変わらないよう静的IPを予約（**VM稼働中は無料**）:

```bash
# 静的IP予約
gcloud compute addresses create medical-bot-ip --region=us-central1

# VMに割り当て
gcloud compute instances delete-access-config medical-bot \
  --access-config-name="External NAT" --zone=us-central1-a

gcloud compute instances add-access-config medical-bot \
  --access-config-name="External NAT" \
  --address=$(gcloud compute addresses describe medical-bot-ip \
    --region=us-central1 --format='value(address)') \
  --zone=us-central1-a

# IPアドレスを確認
gcloud compute addresses describe medical-bot-ip --region=us-central1 --format='value(address)'
```

### ステップ 3 — ファイアウォールを開放

```bash
gcloud compute firewall-rules create allow-medical-bot \
  --allow=tcp:3000 \
  --target-tags=medical-bot \
  --description="Medical Secretary Bot webhook port"
```

### ステップ 4 — VMにSSH接続してサーバーセットアップ

```bash
gcloud compute ssh medical-bot --zone=us-central1-a
```

**VM内で実行:**

```bash
# ========== Node.js 18 インストール ==========
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

node --version   # v18.x.x を確認

# ========== Puppeteer依存ライブラリ ==========
sudo apt-get install -y \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
  libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 \
  libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
  libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 lsb-release wget xdg-utils

# ========== スワップ追加（e2-microは1GBのため必須） ==========
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# ========== PM2インストール ==========
sudo npm install -g pm2

# ========== プロジェクトクローン ==========
git clone https://github.com/toshi1218/medical-secretary-bot.git
cd medical-secretary-bot

# claude/... ブランチをチェックアウト
git fetch origin
git checkout claude/medical-secretary-bot-qIXUD

# 依存パッケージインストール
npm install
```

### ステップ 5 — 環境変数を設定

```bash
cp .env.example .env
nano .env
```

`.env` の内容（各自の値で埋める）:

```dotenv
WHAPI_TOKEN=your_whapi_token
WHAPI_WEBHOOK_URL=http://YOUR_VM_IP:3000/webhook/whapi

TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

GEMINI_API_KEY=your_gemini_api_key

SCHOOL_CALENDAR_URL=https://script.google.com/macros/s/AKfycby.../exec
SECTION=3B
TIMEZONE=Asia/Manila
PORT=3000
```

> `YOUR_VM_IP` はステップ2で取得した静的IPアドレス

### ステップ 6 — 起動・永続化

```bash
# PM2で起動
pm2 start src/index.js --name medical-bot

# ログ確認
pm2 logs medical-bot

# 自動起動設定（VM再起動後も復活）
pm2 save
pm2 startup
# 表示されたコマンド（sudo env PATH=...）をコピー&実行
```

### ステップ 7 — Whapi Webhook設定

1. [Whapi.cloud](https://panel.whapi.cloud) にログイン
2. **Channel** → **Settings** → **Webhooks**
3. Webhook URL: `http://YOUR_VM_IP:3000/webhook/whapi`
4. Events: **messages** にチェック
5. **Save**

### ステップ 8 — 動作確認

```bash
# ヘルスチェック
curl http://YOUR_VM_IP:3000/health

# Telegramでコマンドテスト
# /sync → カレンダー同期
# /today → 今日の予定
# /exams → 試験一覧
```

---

## 📝 環境変数一覧

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `WHAPI_TOKEN` | Whapi APIトークン | ✅ |
| `WHAPI_WEBHOOK_URL` | Webhook公開URL（VM IP:3000/webhook/whapi） | ✅ |
| `TELEGRAM_BOT_TOKEN` | @BotFatherで取得したToken | ✅ |
| `TELEGRAM_CHAT_ID` | 通知送信先のChat ID | ✅ |
| `GEMINI_API_KEY` | Google AI Studio APIキー | ✅ |
| `SCHOOL_CALENDAR_URL` | GASカレンダーのURL | ✅ |
| `SECTION` | 対象セクション（例: 3B） | ✅ |
| `TIMEZONE` | タイムゾーン（Asia/Manila） | — |
| `PORT` | Expressポート（デフォルト3000） | — |
| `MONITORED_GROUPS` | 監視WhatsAppグループ（カンマ区切り） | — |

## 🔑 各APIの取得方法

### Telegram Bot Token + Chat ID
```bash
# 1. @BotFatherに /newbot メッセージ送信 → TOKEN取得
# 2. 作成したBotに /start 送信
# 3. Chat IDを取得:
curl "https://api.telegram.org/bot<TOKEN>/getUpdates" | python3 -m json.tool
# → result[0].message.chat.id が TELEGRAM_CHAT_ID
```

### Whapi Token
1. [whapi.cloud](https://whapi.cloud) でアカウント作成
2. Channel作成 → WhatsApp QRコードをスキャン
3. Dashboard → APIトークンをコピー

### Gemini API Key
1. [aistudio.google.com](https://aistudio.google.com/app/apikey) にアクセス
2. **Create API key** → コピー

---

## 🛠️ 運用コマンド

```bash
# ログ確認
pm2 logs medical-bot --lines 100

# 再起動
pm2 restart medical-bot

# 停止・起動
pm2 stop medical-bot
pm2 start medical-bot

# ステータス確認
pm2 status

# カレンダー手動同期（Telegram経由でも可）
# Telegramで /sync を送信

# DB直接確認
sqlite3 data/bot.db ".tables"
sqlite3 data/bot.db "SELECT COUNT(*) FROM calendar_events;"
sqlite3 data/bot.db "SELECT subject, exam_date FROM exams ORDER BY exam_date LIMIT 10;"
```

## 📊 データベーススキーマ

| テーブル | 説明 |
|---------|------|
| `calendar_events` | 全カレンダーイベント（704件 3B分） |
| `exams` | 試験イベント専用（115件 3B分） |
| `tasks` | タスク・締切（WhatsApp/手動） |
| `whatsapp_files` | ダウンロード済みファイル情報 |
| `image_ocr` | 画像OCR結果 |

---

**バージョン**: 2.0.0 (Oracle Cloud → Google Cloud e2-micro)
