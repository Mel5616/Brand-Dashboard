-- What the link is actually for, so the team doesn't have to guess from the
-- partner/source/medium alone.
alter table utm_links add column if not exists description text;
