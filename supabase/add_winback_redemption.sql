-- Tracks whether a win-back discount code actually got used, so the panel
-- can show a real redemption rate instead of just send status.
alter table winback_sends add column if not exists redeemed boolean not null default false;
alter table winback_sends add column if not exists redeemed_at timestamptz;
alter table winback_sends add column if not exists order_id text;
alter table winback_sends add column if not exists order_value numeric;
