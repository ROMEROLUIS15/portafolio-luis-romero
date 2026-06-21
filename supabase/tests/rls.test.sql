-- pgTAP tests: RLS policies and match_documents function
-- Requirements: 8.4, 2.5

BEGIN;

SELECT plan(6);

-- ─── Test 1: Anonymous INSERT on chat_logs is blocked by RLS ─────────────────
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$
    INSERT INTO chat_logs (session_token, lang, message_hash, chunks_retrieved, response_time_ms)
    VALUES (gen_random_uuid(), 'en', 'abc123', 3, 800)
  $$,
  'new row violates row-level security policy for table "chat_logs"',
  'RLS blocks anonymous INSERT on chat_logs'
);

-- ─── Test 2: Anonymous SELECT on chat_logs is blocked ────────────────────────
SELECT throws_ok(
  $$SELECT * FROM chat_logs LIMIT 1$$,
  NULL,
  'RLS blocks anonymous SELECT on chat_logs'
);

-- ─── Test 3: Public SELECT on documents works (anon role) ────────────────────
RESET ROLE;
SET LOCAL ROLE anon;

SELECT lives_ok(
  $$SELECT id, content, metadata FROM documents LIMIT 1$$,
  'Anonymous can SELECT from documents (public_read policy)'
);

-- ─── Test 4: Anonymous INSERT on documents is blocked ────────────────────────
SELECT throws_ok(
  $$
    INSERT INTO documents (content, embedding, metadata)
    VALUES ('test content', array_fill(0, ARRAY[384])::vector(384), '{"source":"test","lang":"en"}')
  $$,
  'new row violates row-level security policy for table "documents"',
  'RLS blocks anonymous INSERT on documents'
);

-- ─── Test 5: match_documents returns at most 5 results ───────────────────────
RESET ROLE;

-- Insert 10 test documents so we have enough to test the LIMIT
INSERT INTO documents (content, embedding, metadata)
SELECT
  'Test document ' || i,
  array_fill(0, ARRAY[384])::vector(384),
  json_build_object('source', 'test.pdf', 'lang', 'en', 'chunk_index', i)::jsonb
FROM generate_series(1, 10) AS i
ON CONFLICT DO NOTHING;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM match_documents(
      array_fill(0, ARRAY[384])::vector(384),
      'en',
      5
    )
  ),
  5::bigint,
  'match_documents returns exactly 5 results when match_count=5'
);

-- ─── Test 6: match_documents respects match_count parameter ──────────────────
SELECT is(
  (
    SELECT count(*)::bigint
    FROM match_documents(
      array_fill(0, ARRAY[384])::vector(384),
      'en',
      3
    )
  ),
  3::bigint,
  'match_documents respects match_count=3'
);

-- Cleanup test data
DELETE FROM documents WHERE metadata->>'source' = 'test.pdf';

SELECT * FROM finish();

ROLLBACK;
