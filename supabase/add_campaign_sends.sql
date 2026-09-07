-- Every individual EDM send in the Campaign Stream, one row each, so the
-- Campaigns tab can show the full send schedule (not just per-campaign
-- briefs) — including "Momentum" and multi-brand "Portfolio"/"Black Friday"
-- sends that aren't tied to one campaign row.
create table if not exists campaign_sends (
  id uuid primary key default gen_random_uuid(),
  send_date date not null,
  brand text not null,               -- may be "Portfolio", "All participating brands", "TBC", etc.
  campaign text,                      -- campaign name this send belongs to, if any
  campaign_id uuid references campaigns(id) on delete set null,
  type text not null default 'Campaign',   -- Campaign | Momentum | Black Friday
  subject text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table campaign_sends disable row level security;

-- Black Friday planning: one row per brand, position + offer (offer is the
-- thing Mel fills in — "Offers are yours to set" per the stream doc).
create table if not exists black_friday_plan (
  brand text primary key,
  position text,                      -- e.g. "Go hard", "Bundle, not a discount", "Hold"
  pill text not null default 'part',  -- go | part | no
  offer text not null default 'TBC',
  sends text,                         -- which of the 5 BF sends this brand is in
  sort_order int not null default 0
);
alter table black_friday_plan disable row level security;
