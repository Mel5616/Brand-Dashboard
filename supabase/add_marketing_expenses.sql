-- Marketing expenses ledger: one row per expense (tradeshows, printing, etc.)
-- with an optional uploaded PDF receipt/invoice. Standalone from the monthly
-- budget actuals — this is the document-backed record of what was spent on what.
create table if not exists marketing_expenses (
  id          uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category    text not null,              -- Tradeshows, Printing, …
  vendor      text default '',            -- supplier / description
  amount      numeric default 0,
  brand_id    int,                        -- optional attribution (null = whole business)
  file_url    text,                       -- uploaded PDF (Supabase Storage)
  file_name   text,
  note        text default '',
  created_by  text,
  created_at  timestamptz default now()
);
alter table marketing_expenses disable row level security;
create index if not exists marketing_expenses_date_idx on marketing_expenses (expense_date desc);
create index if not exists marketing_expenses_cat_idx  on marketing_expenses (category);
