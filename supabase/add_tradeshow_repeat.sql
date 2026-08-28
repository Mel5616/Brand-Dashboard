-- Tradeshow → online repeat-purchase tracking: of the customers identified at
-- each show (own-store POS + UPPAbaby QR-channel orders only — Coolkidz booth
-- till sales are walk-up till transactions and typically carry no reliable
-- customer identity, so they're excluded from repeat-tracking), how many
-- placed a further paid order on that SAME brand's online store within 90
-- days after the show ended. Populated by scripts/sync_tradeshow_repeat.py.
--
-- Aggregate-only — no PII (no email/name stored) — matching the open-read
-- convention used by every other tradeshow_* table (RLS disabled).
--
-- window_complete is false until date_end + 90 days has actually elapsed;
-- the UI must treat window_complete = false as "still accumulating", NOT as
-- a 0% repeat rate, or an in-progress show will misreport.
create table if not exists tradeshow_repeat (
  tradeshow_id          text not null,
  brand_id              int  not null,
  show_customers        int  default 0,   -- distinct identified (customer-id) buyers at the show, this brand
  show_customers_no_id  int  default 0,   -- show orders on this brand with no customer id (guest/POS anonymous) — coverage flag
  repeat_customers      int  default 0,   -- of show_customers, how many placed a further paid online order within the window
  repeat_orders_90d     int  default 0,   -- count of those repeat orders
  repeat_revenue_90d    numeric default 0,-- ex-GST revenue of those repeat orders
  window_complete       boolean default false, -- true once date_end + 90d has elapsed (repeat figures are only "final" then)
  window_ends_at        date,             -- date_end + 90d, so the UI can show "final on <date>"
  synced_at             timestamptz default now(),
  primary key (tradeshow_id, brand_id)
);
alter table tradeshow_repeat disable row level security;
