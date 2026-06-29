-- Add an expiry to snapshot share links (auto-set to 5 days on creation).
-- Run once in Supabase.
alter table snapshot_shares add column if not exists expires_at timestamptz;
