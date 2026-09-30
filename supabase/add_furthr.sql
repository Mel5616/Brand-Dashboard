-- Furthr card-linked cashback campaign (UPPAbaby, Sep 2026) — Mel uploads
-- Furthr's own transaction export CSV here (no API integration exists for
-- Furthr yet, same manual-upload pattern as Baby Bunting). Tracks the deal's
-- real performance (revenue, spend, transactions, customers, AOV) and lets
-- us cross-check against commission_factory_transactions by order_id so we
-- don't pay commission twice on the same Shopify order (confirmed real
-- case: UB#33749, tracked by both Furthr and Commission Factory's ShopBack
-- Australia affiliate, 29 Sep 2026).
create table if not exists furthr_transactions (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              int not null,
  transaction_id        text not null,          -- Furthr's own Transaction ID
  network_transaction_id text,
  transaction_date      timestamptz not null,
  amount                numeric not null,        -- sale amount
  cashback              numeric not null,        -- customer's cashback
  fee                    numeric not null,        -- our cost (== cashback in every row seen so far)
  bank                  text,                    -- blank in Furthr's transaction export today; kept for when/if they add it
  order_id              text,                    -- Shopify order name, e.g. "UB#33749" — the join key against commission_factory_transactions
  customer_id           text,                    -- Merchant Customer ID (Shopify gid)
  status                text,
  created_at            timestamptz not null default now(),
  created_by            text,
  unique (transaction_id)
);
create index if not exists furthr_transactions_brand_idx on furthr_transactions (brand_id, transaction_date);
create index if not exists furthr_transactions_order_idx on furthr_transactions (order_id);
alter table furthr_transactions disable row level security;

-- Manually-tracked campaign list (Program/bank, offer text, status, dates) —
-- Furthr's transaction export doesn't carry the bank per row, so this stays
-- a simple reference table Mel keeps in sync with Furthr's own dashboard,
-- not something computed from transactions.
create table if not exists furthr_campaigns (
  id              uuid primary key default gen_random_uuid(),
  brand_id        int not null,
  bank            text not null,
  offer           text not null,
  status          text not null default 'pending' check (status in ('active','pending','ended')),
  starts_at       date,
  ends_at         date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table furthr_campaigns disable row level security;

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists furthr_campaigns_touch on furthr_campaigns;
create trigger furthr_campaigns_touch before update on furthr_campaigns
  for each row execute function touch_updated_at();
