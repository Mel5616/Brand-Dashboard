-- Klaviyo flow performance + portfolio campaign calendar (Email Marketing tab).
-- Filled nightly by scripts/sync_klaviyo.py from each brand's own Klaviyo account.

create table if not exists klaviyo_flow_metrics (
  brand_id int not null,
  flow_id text not null,
  month_key text not null,              -- YYYY-MM
  flow_name text not null,
  status text,                          -- live | draft | manual | paused
  trigger_type text,
  recipients int not null default 0,    -- unique profiles that received an email from this flow in the month
  opens int not null default 0,
  clicks int not null default 0,
  orders int not null default 0,        -- Placed Order attributed to this flow
  revenue numeric(12,2) not null default 0,
  synced_at timestamptz not null default now(),
  primary key (brand_id, flow_id, month_key)
);
alter table klaviyo_flow_metrics disable row level security;

-- Existing klaviyo_campaigns (sent results for the weekly brief) gains the
-- fields the portfolio calendar needs: what's scheduled, not just what went.
alter table klaviyo_campaigns add column if not exists status text;
alter table klaviyo_campaigns add column if not exists send_time timestamptz;
alter table klaviyo_campaigns add column if not exists subject text;
alter table klaviyo_campaigns add column if not exists audiences text;
alter table klaviyo_campaigns alter column sent_at drop not null;
create index if not exists klaviyo_campaigns_send_time on klaviyo_campaigns (send_time);
