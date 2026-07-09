-- Enable RLS on rate_limits.
--
-- The table was created in 002 without it. In production RLS is on, but only
-- because Supabase's `rls_auto_enable` event trigger switched it on when the
-- table was created — nothing in this repo did. Provisioning a fresh project
-- from these migrations alone yields a rate_limits table that the `anon` role
-- can read and update, letting any visitor reset their own request counter.
--
-- No policy is created on purpose: only the Edge Function touches this table,
-- and it uses the service_role key, which bypasses RLS. RLS enabled with zero
-- policies means "deny all" for every other role.

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
