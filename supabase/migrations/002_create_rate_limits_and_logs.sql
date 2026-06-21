-- Migration 002: Create rate_limits and chat_logs tables
-- Requirements: 4.1, 8.1, 8.4

-- Rate limits table (sliding window per IP)
CREATE TABLE IF NOT EXISTS rate_limits (
  ip           text        NOT NULL,
  count        int         NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip)
);

-- Chat logs table (observability — stores hash, never plaintext)
CREATE TABLE IF NOT EXISTS chat_logs (
  id               bigserial    PRIMARY KEY,
  session_token    uuid         NOT NULL,
  lang             text         NOT NULL CHECK (lang IN ('es', 'en')),
  message_hash     text         NOT NULL,   -- SHA-256 hex of user message
  chunks_retrieved int          NOT NULL,
  response_time_ms int          NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- Enable RLS on chat_logs
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- Only service_role (Edge Function) can insert into chat_logs
-- No client-side reads or writes allowed
CREATE POLICY "service_role_insert_only" ON chat_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);
