-- Shareable, open-tracked snapshot links. Each link hosts a frozen copy of the
-- snapshot HTML at /s/<token>; every open is logged. Run once in Supabase.

create table if not exists snapshot_shares (
  id bigint generated always as identity primary key,
  token text not null unique,
  brand_id int,
  brand text,
  month_key text,
  label text,
  html text not null,
  recipient text,
  created_by text,
  created_at timestamptz not null default now(),
  open_count int not null default 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  last_ip text,
  last_ua text
);
create index if not exists snapshot_shares_brand_idx on snapshot_shares (brand_id, month_key, created_at desc);
create index if not exists snapshot_shares_token_idx on snapshot_shares (token);
