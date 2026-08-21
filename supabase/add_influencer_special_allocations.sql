-- Some gifts are funded entirely outside the normal Influencer Marketing
-- budget (e.g. a supplier hands over free stock to gift out) — Mel wants
-- these tracked by QUANTITY SENT against a cap, never counted as budget
-- spend. Tag a gift entry with one of these on the log-gift form and it's
-- excluded from every budget/spend calculation but still shows on the
-- results board like any other gift.
create table if not exists influencer_special_allocations (
  id bigint generated always as identity primary key,
  name text not null,
  brand text,
  target_qty int not null default 0,
  created_at timestamptz not null default now()
);
alter table influencer_special_allocations disable row level security;

alter table influencer_entries add column if not exists special_allocation_id bigint references influencer_special_allocations(id);

insert into influencer_special_allocations (name, brand, target_qty) values
  ('UPPAbaby MINU V3 Stroller gifting', 'UPPAbaby', 40),
  ('Nanit floor camera gifting', 'Nanit', 30);
