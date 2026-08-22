-- Activations: a per-brand report (Reports > Activations, sub of Snapshot)
-- combining a competitor tracker, that brand's tradeshows, a 6-month forward
-- activation timeline (reads the existing campaigns table), and top Google Ads
-- copy snippets — built to hand to Global, not for everyday internal use.

-- Manually-maintained competitor notes (qualitative — positioning, distribution,
-- tactics). Not automated: there's no scraping/monitoring source for this.
create table if not exists brand_competitors (
  id bigint generated always as identity primary key,
  brand_id int not null,
  name text not null,
  notes text,
  updated_by text,
  updated_at timestamptz not null default now()
);
create index if not exists brand_competitors_brand_idx on brand_competitors (brand_id);
create unique index if not exists brand_competitors_brand_name_idx on brand_competitors (brand_id, name);
alter table brand_competitors disable row level security;

-- Open-tracked share links for the Activations report, same pattern as
-- snapshot_shares — a frozen copy of the rendered HTML, served publicly at
-- /activation/<token>.
create table if not exists activation_shares (
  id bigint generated always as identity primary key,
  token text not null unique,
  brand_id int,
  brand text,
  label text,
  html text not null,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  open_count int not null default 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  last_ip text,
  last_ua text
);
create index if not exists activation_shares_brand_idx on activation_shares (brand_id, created_at desc);
create index if not exists activation_shares_token_idx on activation_shares (token);
alter table activation_shares disable row level security;

-- Top-performing Google Ads copy (headlines/descriptions), refreshed by
-- scripts/sync.py. Replaced wholesale per brand each run — no history kept,
-- this is "what's live now", not a trend.
create table if not exists google_ads_creatives (
  id bigint generated always as identity primary key,
  brand_id int not null,
  campaign_name text,
  ad_group text,
  headlines jsonb not null default '[]',
  descriptions jsonb not null default '[]',
  final_url text,
  clicks int default 0,
  impressions int default 0,
  synced_at timestamptz not null default now()
);
create index if not exists google_ads_creatives_brand_idx on google_ads_creatives (brand_id);
alter table google_ads_creatives disable row level security;

-- Seed Frida's competitor tracker (researched 2026-08-21).
insert into brand_competitors (brand_id, name, notes, updated_by) values
  ((select id from brands where name = 'Frida'), 'Due (by The Memo)',
   E'- Ranged in 419+ Priceline stores (first major pharmacy partnership, launched Apr 2026), pricing $9.95-$139.95\n- Leaning hard on influencers and founder-led content off the back of The Memo''s existing audience\n- Positioning: "breaking the taboo" / anti "behind closed doors" messaging - marketing itself as leading the postpartum care conversation in Australia',
   'mel@coolkidz.com.au'),
  ((select id from brands where name = 'Frida'), 'New Beginnings',
   E'- Broader maternity/postpartum range (bras, pumps, feeding + recovery) rather than postpartum-only - positions as one-stop "hospital bag to home" essentials\n- Proprietary tech angle (UGrow(TM) adaptive nursing bra) as a differentiator vs commodity postpartum kits\n- Bundle/kit-led merchandising (Hospital Bag Essentials Kit, Build-Your-Own Postpartum Kit) - basket-size play rather than single-SKU',
   'mel@coolkidz.com.au'),
  ((select id from brands where name = 'Frida'), 'Ninja Mama',
   E'- Australia''s first dedicated postpartum recovery brand (2018), Perth-based, 100% Australian owned - leans on that "OG" positioning\n- Strong earned media (Marie Claire, Woman''s Day, New Idea) and a hero SKU (peri bottle, 30k+ units/year)\n- Directly benchmarking against Frida - runs a public "Ninja Mama vs Frida Mom" comparison blog',
   'mel@coolkidz.com.au')
on conflict (brand_id, name) do nothing;
