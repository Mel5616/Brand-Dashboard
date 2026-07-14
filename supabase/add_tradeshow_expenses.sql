-- Per-tradeshow expenses, one row per category, so each show's total cost (and
-- net vs booth revenue) can be tracked. Categories: Printing, Staff, Floor Space,
-- Travel, Accommodation, Stand, Setup/Packdown, Advertising.
create table if not exists tradeshow_expenses (
  tradeshow_id text references tradeshows(id) on delete cascade,
  category     text not null,
  amount       numeric default 0,
  primary key (tradeshow_id, category)
);
alter table tradeshow_expenses disable row level security;
