-- Line-item tradeshow expenses: each entry is allocated to a category
-- (Printing, Staff, Floor Space, Travel, Accommodation, Stand, Setup/Packdown,
-- Advertising) with a label (who/what), amount and optional note — so Staff can
-- hold "Melanie $300 · 4 hours" as its own row. Replaces the per-category totals
-- table (tradeshow_expenses), which can be dropped.
create table if not exists tradeshow_expense_items (
  id           uuid primary key default gen_random_uuid(),
  tradeshow_id text references tradeshows(id) on delete cascade,
  category     text not null,
  label        text default '',
  amount       numeric default 0,
  note         text default '',
  created_by   text,
  created_at   timestamptz default now()
);
alter table tradeshow_expense_items disable row level security;
create index if not exists tradeshow_expense_items_show_idx on tradeshow_expense_items (tradeshow_id);

drop table if exists tradeshow_expenses;
