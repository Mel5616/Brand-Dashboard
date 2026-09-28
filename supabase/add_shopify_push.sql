-- Structured line items (real Shopify variant ids, not the free-text
-- items/products field) + push tracking, for the "push to Shopify" action
-- on Giveaways and Product Requests. Kept separate from the free-text
-- field: that stays the human-readable description shown everywhere
-- (Timeline notes, emails); line_items is only consulted when actually
-- building the Shopify draft order.
alter table giveaways add column if not exists line_items jsonb not null default '[]';
alter table giveaways add column if not exists shopify_draft_order_id text;
alter table giveaways add column if not exists shopify_draft_order_url text;
alter table giveaways add column if not exists shopify_pushed_at timestamptz;
alter table giveaways add column if not exists shopify_pushed_by text;

alter table product_requests add column if not exists line_items jsonb not null default '[]';
alter table product_requests add column if not exists shopify_draft_order_id text;
alter table product_requests add column if not exists shopify_draft_order_url text;
alter table product_requests add column if not exists shopify_pushed_at timestamptz;
alter table product_requests add column if not exists shopify_pushed_by text;
