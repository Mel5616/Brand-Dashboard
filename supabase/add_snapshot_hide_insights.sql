-- Per-brand, per-month toggle to suppress the "Insights and opportunities"
-- section of the Monthly Snapshot report entirely (AI insight + SEO
-- opportunities table) — some months there's nothing worth surfacing there.
alter table snapshot_notes add column if not exists hide_insights boolean default false;
