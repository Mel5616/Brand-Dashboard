-- Post-show report per tradeshow: the one-page HTML report produced after each
-- expo, attached to its show. One current report per show (re-upload replaces).
create table if not exists tradeshow_reports (
  tradeshow_id text primary key references tradeshows(id) on delete cascade,
  title       text default '',
  html_url    text,
  file_name   text,
  uploaded_by text,
  uploaded_at timestamptz default now()
);
alter table tradeshow_reports disable row level security;
