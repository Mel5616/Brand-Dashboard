-- Tracks the Asana task a campaign has been pushed to, so "Push to Asana"
-- updates the existing task on repeat clicks instead of creating duplicates.
alter table campaigns add column if not exists asana_task_gid text;
alter table campaigns add column if not exists asana_permalink_url text;
