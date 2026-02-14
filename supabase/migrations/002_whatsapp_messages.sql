CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  group_name TEXT,
  sender_name TEXT,
  from_me BOOLEAN DEFAULT FALSE,
  message_type TEXT DEFAULT 'text',
  text_body TEXT,
  message_ts TIMESTAMPTZ,
  raw_payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat_id
  ON whatsapp_messages(chat_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_ts
  ON whatsapp_messages(message_ts DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_group_name
  ON whatsapp_messages(group_name);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_messages'
      AND policyname = 'service_role_all_whatsapp_messages'
  ) THEN
    CREATE POLICY service_role_all_whatsapp_messages
      ON whatsapp_messages
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
