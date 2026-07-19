-- Brand asset link directory (Operations > Brand Assets): where each brand's
-- assets live — Brandfolder, Dropbox, Drive, supplier portals. Quick links
-- only; the files stay wherever they are.
create table if not exists brand_asset_links (
  id         uuid primary key default gen_random_uuid(),
  brand      text not null,
  label      text not null,
  url        text not null,
  notes      text,
  sort_order int default 0,
  added_by   text,
  created_at timestamptz default now()
);
alter table brand_asset_links disable row level security;
