-- Editable commentary per brand per month, rendered into the Monthly Snapshot report.
-- One row per (brand, month); re-saving upserts. Run once in the Supabase SQL editor.
create table if not exists snapshot_notes (
  brand_id   int  not null,
  month_key  text not null,
  content    text not null default '',
  updated_at timestamptz not null default now(),
  primary key (brand_id, month_key)
);
