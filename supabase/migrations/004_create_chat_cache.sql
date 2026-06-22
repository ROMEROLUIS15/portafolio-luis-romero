-- Migration 004: chat_cache — answer cache for repeated questions
-- The chat Edge Function caches final answers keyed by sha256(lang + normalized
-- message). Repeated questions (e.g. the widget's suggested ones) are served
-- from here, skipping embedding + vector search + the Groq LLM call.

CREATE TABLE IF NOT EXISTS chat_cache (
  cache_key   text         PRIMARY KEY,        -- sha256(lang + ':' + normalized message)
  lang        text         NOT NULL,
  answer      text         NOT NULL,
  sources     jsonb        NOT NULL DEFAULT '[]',
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- Lets the function discard stale entries cheaply (TTL filter on read)
CREATE INDEX IF NOT EXISTS chat_cache_created_at_idx ON chat_cache (created_at);

-- RLS on, no public policies: only the Edge Function (service_role, which
-- bypasses RLS) reads/writes this table.
ALTER TABLE chat_cache ENABLE ROW LEVEL SECURITY;
