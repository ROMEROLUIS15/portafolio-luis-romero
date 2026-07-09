-- pgTAP tests: RLS policies and match_documents function
-- Requirements: 8.4, 2.5

BEGIN;

SELECT plan(13);

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

-- ─── Test 2: Anonymous SELECT on chat_logs returns nothing ───────────────────
-- Not an exception: a SELECT under deny-all RLS succeeds and yields zero rows.
-- The previous assertion here expected a throw and had never been run.
SELECT is(
  (SELECT count(*)::bigint FROM chat_logs),
  0::bigint,
  'RLS hides every chat_logs row from anon'
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

-- ─── Tests 7-9: chat_cache is deny-all for anon ──────────────────────────────
-- RLS is enabled with zero policies. Postgres denies by default, but that is an
-- implicit guarantee: nothing in the schema states it, so assert it here.

RESET ROLE;

INSERT INTO chat_cache (cache_key, lang, answer, sources)
VALUES ('pgtap-probe', 'en', 'seeded by the test suite', '[]'::jsonb)
ON CONFLICT (cache_key) DO NOTHING;

SELECT is(
  (SELECT count(*)::bigint FROM chat_cache WHERE cache_key = 'pgtap-probe'),
  1::bigint,
  'chat_cache row is visible to the table owner'
);

SET LOCAL ROLE anon;

-- A SELECT under deny-all RLS does not raise: it silently returns nothing.
-- That distinction matters — a test asserting "it throws" would be wrong.
SELECT is(
  (SELECT count(*)::bigint FROM chat_cache),
  0::bigint,
  'RLS hides every chat_cache row from anon (deny-all, no policy)'
);

SELECT throws_ok(
  $$
    INSERT INTO chat_cache (cache_key, lang, answer, sources)
    VALUES ('anon-poison', 'en', 'pwned', '[]'::jsonb)
  $$,
  'new row violates row-level security policy for table "chat_cache"',
  'RLS blocks anonymous INSERT on chat_cache (no cache poisoning)'
);

-- ─── Tests 10-12: rate_limits is deny-all for anon ───────────────────────────

RESET ROLE;

INSERT INTO rate_limits (ip, count, window_start)
VALUES ('203.0.113.1', 7, now())
ON CONFLICT (ip) DO NOTHING;

SELECT is(
  (SELECT count(*)::bigint FROM rate_limits WHERE ip = '203.0.113.1'),
  1::bigint,
  'rate_limits row is visible to the table owner'
);

SET LOCAL ROLE anon;

SELECT is(
  (SELECT count(*)::bigint FROM rate_limits),
  0::bigint,
  'RLS hides every rate_limits row from anon (deny-all, no policy)'
);

-- If anon could UPDATE this table it would reset its own counter at will.
-- Under deny-all the UPDATE matches no rows rather than raising, so assert on
-- the surviving value instead of on an exception.
SELECT lives_ok(
  $$UPDATE rate_limits SET count = 0 WHERE ip = '203.0.113.1'$$,
  'anon UPDATE on rate_limits does not raise (it matches no rows)'
);

RESET ROLE;

SELECT is(
  (SELECT count FROM rate_limits WHERE ip = '203.0.113.1'),
  7,
  'RLS blocks anonymous UPDATE on rate_limits (counter survives untouched)'
);

-- Cleanup test data
RESET ROLE;
DELETE FROM documents   WHERE metadata->>'source' = 'test.pdf';
DELETE FROM chat_cache  WHERE cache_key = 'pgtap-probe';
DELETE FROM rate_limits WHERE ip = '203.0.113.1';

SELECT * FROM finish();

ROLLBACK;
