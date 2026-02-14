import fs from 'node:fs';
import axios from 'axios';
import { upsertWhatsAppMessage } from '../lib/db.js';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    chatIds: [],
    input: null,
    limit: 200,
    pages: 5
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--chat-id' && argv[i + 1]) args.chatIds.push(argv[++i]);
    if (a === '--input' && argv[i + 1]) args.input = argv[++i];
    if (a === '--limit' && argv[i + 1]) args.limit = Number(argv[++i]);
    if (a === '--pages' && argv[i + 1]) args.pages = Number(argv[++i]);
  }

  return args;
}

function getTextBody(message) {
  if (typeof message?.text === 'string') return message.text;
  if (typeof message?.text?.body === 'string') return message.text.body;
  if (typeof message?.body === 'string') return message.body;
  if (typeof message?.caption === 'string') return message.caption;
  return '';
}

function toIsoTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  const normalized = typeof ts === 'number' ? ts * 1000 : ts;
  return new Date(normalized).toISOString();
}

function normalizeMessage(message) {
  const text = getTextBody(message).trim();
  const chatId = message.chat_id || message.from || 'unknown-chat';
  const ts = message.timestamp || message.time || message.created_at || Date.now();
  const messageId = String(
    message.id ||
    message.message_id ||
    `${chatId}:${ts}:${text.slice(0, 32)}`
  );

  return {
    message_id: messageId,
    chat_id: chatId,
    group_name: message.chat_name || message.from_name || null,
    sender_name: message.from_name || message.pushname || null,
    from_me: !!message.from_me,
    message_type: message.type || (text ? 'text' : 'unknown'),
    text_body: text || null,
    message_ts: toIsoTimestamp(ts),
    raw_payload: message
  };
}

function extractMessageArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

async function fetchMessagesFromWhapi(chatId, { limit, pages }) {
  const token = process.env.WHAPI_TOKEN;
  const baseUrl = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';
  const endpointTemplate = process.env.WHAPI_HISTORY_ENDPOINT_TEMPLATE || '/messages/list/{chatId}';

  if (!token) throw new Error('WHAPI_TOKEN is not set');

  const client = axios.create({
    baseURL: baseUrl,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000
  });

  const out = [];
  for (let page = 1; page <= pages; page++) {
    const endpoint = endpointTemplate.replace('{chatId}', encodeURIComponent(chatId));
    const { data } = await client.get(endpoint, {
      params: { count: limit, limit, page }
    });
    const arr = extractMessageArray(data);
    if (!arr.length) break;
    out.push(...arr);
    if (arr.length < limit) break;
  }
  return out;
}

async function run() {
  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const args = parseArgs(process.argv.slice(2));
  let messages = [];

  if (args.input) {
    const raw = fs.readFileSync(args.input, 'utf8');
    const parsed = JSON.parse(raw);
    messages = extractMessageArray(parsed);
    console.log(`[backfill] loaded ${messages.length} messages from file`);
  } else if (args.chatIds.length) {
    for (const chatId of args.chatIds) {
      const batch = await fetchMessagesFromWhapi(chatId, args);
      console.log(`[backfill] fetched ${batch.length} messages from ${chatId}`);
      messages.push(...batch);
    }
  } else {
    throw new Error('Specify either --input <file> or one/more --chat-id <id>');
  }

  let inserted = 0;
  let failed = 0;
  for (const m of messages) {
    try {
      await upsertWhatsAppMessage(normalizeMessage(m));
      inserted++;
    } catch (err) {
      failed++;
      console.error('[backfill] upsert failed:', err.message);
    }
  }

  console.log(`[backfill] done inserted_or_updated=${inserted} failed=${failed}`);
}

run().catch((err) => {
  console.error('[backfill] fatal:', err.message);
  process.exit(1);
});
