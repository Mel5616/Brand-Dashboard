-- Fortnightly content calendar: a "planned" row is a topic + suggested date
-- with no draft written yet — the AI Blog Writer generates the actual post
-- when you click through to it.
alter table blog_drafts add column if not exists scheduled_for date;
