-- Email Engine v1 (smarTrike Wonder) — data model per the build brief §5,
-- adapted to reference the existing brands table (integer id) rather than a
-- new brands table, since brands/colors/etc. already exist in this dashboard.

alter table brands add column if not exists feed_token text;
alter table brands add column if not exists klaviyo_account_ref text; -- which Klaviyo account this brand's campaigns/templates live in

-- One-off backfill: give every brand a random feed token now so the column
-- is never null. Rotate anytime from the Feeds screen.
update brands set feed_token = encode(gen_random_bytes(24), 'hex') where feed_token is null;

create table if not exists email_modules (
  id uuid primary key default gen_random_uuid(),
  brand_id integer not null references brands(id),
  key text not null,              -- e.g. 'hero', 'range_ladder' — matches build brief §12
  name text not null,
  html_partial text not null,     -- the locked, tested HTML for this module
  schema_json jsonb not null default '{}'::jsonb,  -- expected payload shape for this module
  sort_order integer not null default 0,
  locked boolean not null default false,  -- true for header/footer — cannot be removed from a build
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key)
);

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id integer not null references brands(id),
  campaign_idea_id uuid,  -- FK to Briefing Engine's campaigns table, nullable (ad hoc briefs have none)
  status text not null default 'draft' check (status in ('draft', 'generated', 'scheduled', 'sent', 'cancelled')),
  brief_text text,
  payload_json jsonb,          -- the campaign JSON served to the feed (build brief §8 schema)
  module_order text[] not null default '{}',
  subject_options text[] not null default '{}',
  subject_chosen text,
  preview_text text,
  klaviyo_template_id text,
  klaviyo_campaign_id text,
  scheduled_for timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_campaigns_brand_status_idx on email_campaigns(brand_id, status, scheduled_for);

create table if not exists email_campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists email_metrics (
  campaign_id uuid primary key references email_campaigns(id) on delete cascade,
  recipients integer,
  opens integer,
  clicks integer,
  revenue_aud numeric,
  unsubscribes integer,
  synced_at timestamptz not null default now()
);

-- Every fetch of the public feed, so the Feeds screen can show last-fetch
-- time and we can rate-limit / spot abuse (build brief §6).
create table if not exists email_feed_fetches (
  id bigint generated always as identity primary key,
  brand_id integer not null references brands(id),
  fetched_at timestamptz not null default now(),
  ip text,
  user_agent text
);
create index if not exists email_feed_fetches_brand_idx on email_feed_fetches(brand_id, fetched_at desc);
