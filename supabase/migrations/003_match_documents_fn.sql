-- Migration 003: match_documents RPC function
-- Requirements: 3.1
-- Uses vector(384) to match Supabase gte-small embeddings

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding  vector(384),
  query_lang       text,
  match_count      int DEFAULT 5
)
RETURNS TABLE (
  id          bigint,
  content     text,
  source      text,
  lang        text,
  similarity  float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    (d.metadata->>'source')::text  AS source,
    (d.metadata->>'lang')::text    AS lang,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  ORDER BY
    -- Prioritize same language, then by cosine similarity
    CASE WHEN (d.metadata->>'lang') = query_lang THEN 0 ELSE 1 END,
    d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
