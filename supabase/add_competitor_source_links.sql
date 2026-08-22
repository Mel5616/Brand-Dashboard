-- Source article links for a competitor entry (e.g. press coverage), shown
-- under the competitor's notes in the Activations report.
alter table brand_competitors add column if not exists source_links jsonb not null default '[]';
