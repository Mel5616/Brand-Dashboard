-- Cin7 push tracking + structured line items, mirroring add_shopify_push.sql.
-- Giveaways also gets ship_to_name/ship_to_address (product_requests already
-- has these) since a Cin7 delivery needs somewhere to send the winner's
-- product once one's picked.
alter table giveaways add column if not exists ship_to_name text;
alter table giveaways add column if not exists ship_to_address text;
alter table giveaways add column if not exists cin7_line_items jsonb not null default '[]';
alter table giveaways add column if not exists cin7_sales_order_id text;
alter table giveaways add column if not exists cin7_sales_order_ref text;
alter table giveaways add column if not exists cin7_pushed_at timestamptz;
alter table giveaways add column if not exists cin7_pushed_by text;

alter table product_requests add column if not exists cin7_line_items jsonb not null default '[]';
alter table product_requests add column if not exists cin7_sales_order_id text;
alter table product_requests add column if not exists cin7_sales_order_ref text;
alter table product_requests add column if not exists cin7_pushed_at timestamptz;
alter table product_requests add column if not exists cin7_pushed_by text;
