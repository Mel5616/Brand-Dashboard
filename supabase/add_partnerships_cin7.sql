-- Some partners (wholesale/reseller accounts) aren't tracked via a Shopify
-- discount code at all — they're a customer account in Cin7 instead (e.g.
-- Baby and Car). cin7_email identifies which partnership_entries row this
-- is; cin7_customer_sales holds the auto-synced monthly totals for it,
-- mirroring influencer_sales' shape so the Revenue tab can merge both.
alter table partnership_entries add column if not exists cin7_email text;

create table if not exists cin7_customer_sales (
  customer_email text not null,
  month_key      text not null,
  orders         int not null default 0,
  revenue        numeric not null default 0,
  synced_at      timestamptz not null default now(),
  primary key (customer_email, month_key)
);
alter table cin7_customer_sales disable row level security;
