-- Migration 001: Create documents table with pgvector
-- Requirements: 2.3, 2.5
-- Embeddings: Supabase built-in gte-small model (384 dims, free)

-- Enable pgvector extension (must be done in Supabase dashboard if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table (Vector Store)
CREATE TABLE IF NOT EXISTS documents (
  id          bigserial    PRIMARY KEY,
  content     text         NOT NULL,
  embedding   vector(384)  NOT NULL,   -- gte-small: 384 dims (free via Supabase)
  metadata    jsonb        NOT NULL DEFAULT '{}',
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- HNSW index for cosine similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx
  ON documents
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Public read policy (Edge Function uses anon key for RPC)
CREATE POLICY "public_read" ON documents
  FOR SELECT
  USING (true);

-- Only service_role can insert (ingestion script)
CREATE POLICY "service_role_insert" ON documents
  FOR INSERT
  TO service_role
  WITH CHECK (true);
