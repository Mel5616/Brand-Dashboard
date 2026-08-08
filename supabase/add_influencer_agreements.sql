-- Influencer Agreements module. Coolkidz Australia Pty Ltd (ABN 98 293 897 047)
-- is the contracting party on every agreement, not the brand — see the master
-- template's clause 1 preamble. References the EXISTING int-keyed `brands`
-- table; does not duplicate it.

-- Per-brand config for agreement generation (logo/handle/exclusivity/naming),
-- seeded from brands.json. One row per brand.
create table if not exists influencer_agreement_brand_config (
  brand_id              int primary key references brands(id) on delete cascade,
  code                  text not null,            -- 'UB' — used in agreement reference numbers
  legal_note            text,
  tier                  text,                     -- 'A' | 'B' | 'C'
  instagram_handle      text,
  exclusivity_category  text,                     -- null / 'TBC — ...' until confirmed
  naming_rule           text
);

-- One row per person, across all brands — the point of the module: two brand
-- managers can no longer gift the same creator in the same month unknowingly.
create table if not exists influencers (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null,
  email                 text not null,
  phone                 text,
  instagram_handle      text,
  tiktok_handle         text,
  address_line1         text,
  address_line2         text,
  suburb                text,
  state                 text,
  postcode              text,
  is_po_box             boolean not null default false,
  abn                   text,
  notes                 text,
  blocked               boolean not null default false,
  blocked_reason        text,
  created_at            timestamptz not null default now(),
  unique (email)
);
create index if not exists influencers_handle_idx on influencers (lower(instagram_handle));

create table if not exists influencer_agreements (
  id                          uuid primary key default gen_random_uuid(),
  reference                   text not null unique,       -- e.g. 'UB-2026-0043'
  influencer_id               uuid not null references influencers(id),
  brand_id                    int not null references brands(id),
  agreement_type              text not null default 'gifted_social',  -- gifted_social | ugc_only | event_attendance
  template_version            text not null default '2.0',
  campaign_name               text,

  status                      text not null default 'draft',  -- draft | sent | signed | complete | lapsed | terminated
  agreement_date              date,
  token                       uuid not null default gen_random_uuid(),

  content_due_days            int not null default 21,
  content_due_date            date,
  minimum_live_period_months  int not null default 6,

  exclusivity_applies         boolean not null default true,
  exclusivity_category        text,
  exclusivity_months          int not null default 6,
  exclusivity_end_date        date,

  usage_term_months           int not null default 12,
  usage_paid_media            boolean not null default false,
  usage_retail_partners       boolean not null default true,
  usage_print                 boolean not null default false,

  discount_code               text,
  discount_start              date,
  discount_end                date,

  representative_name         text,
  representative_position     text,

  rendered_html                text,          -- the exact contract text the influencer saw/signed, snapshotted — never regenerated from a possibly-changed template
  sent_at                      timestamptz,
  signed_at                    timestamptz,
  signed_name                  text,
  signature_data_url           text,          -- base64 PNG, drawn signature
  signed_ip                    text,
  signed_user_agent            text,
  document_hash                text,          -- sha256 of rendered_html at signing, for evidential weight

  created_by                  text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists influencer_agreements_influencer_idx on influencer_agreements (influencer_id);
create index if not exists influencer_agreements_brand_status_idx on influencer_agreements (brand_id, status);
create index if not exists influencer_agreements_excl_idx on influencer_agreements (exclusivity_end_date) where exclusivity_applies;
create unique index if not exists influencer_agreements_token_idx on influencer_agreements (token);

create table if not exists influencer_agreement_products (
  id                uuid primary key default gen_random_uuid(),
  agreement_id      uuid not null references influencer_agreements(id) on delete cascade,
  product_name      text not null,
  variant           text,
  quantity          int not null default 1,
  cost_price        numeric(10,2),   -- app-layer restricted to admin, same as the existing gifting budget tracker
  rrp               numeric(10,2)
);

create table if not exists influencer_agreement_deliverables (
  id                uuid primary key default gen_random_uuid(),
  agreement_id      uuid not null references influencer_agreements(id) on delete cascade,
  deliverable_type  text not null,    -- 'grid post' | 'reel' | 'story' | 'hi-res image' | 'TikTok'
  platform          text not null,    -- 'Instagram' | 'TikTok' | 'YouTube' | 'delivered to Coolkidz'
  quantity          int not null default 1,
  due_date          date,
  status            text not null default 'pending',  -- pending | submitted | live | overdue | waived
  live_url          text,
  posted_at         date,
  reach             int,
  engagement        int,
  notes             text
);
create index if not exists influencer_agreement_deliverables_agr_idx on influencer_agreement_deliverables (agreement_id, status);

alter table influencer_agreement_brand_config disable row level security;
alter table influencers disable row level security;
alter table influencer_agreements disable row level security;
alter table influencer_agreement_products disable row level security;
alter table influencer_agreement_deliverables disable row level security;

-- Who's currently locked up, and in what category — the conflict check.
create or replace view v_active_exclusivity as
select
  a.id                as agreement_id,
  a.reference,
  i.id                as influencer_id,
  i.full_name,
  i.instagram_handle,
  b.name              as brand,
  a.exclusivity_category,
  a.exclusivity_end_date,
  (a.exclusivity_end_date - current_date) as days_remaining
from influencer_agreements a
join influencers i on i.id = a.influencer_id
join brands b      on b.id = a.brand_id
where a.exclusivity_applies
  and a.exclusivity_end_date >= current_date
  and a.status not in ('draft', 'terminated', 'lapsed');

-- Overdue content
create or replace view v_overdue_deliverables as
select
  d.id, a.reference, b.name as brand, i.full_name, i.email,
  d.deliverable_type, d.quantity, d.due_date,
  (current_date - d.due_date) as days_overdue
from influencer_agreement_deliverables d
join influencer_agreements a on a.id = d.agreement_id
join influencers i on i.id = a.influencer_id
join brands b      on b.id = a.brand_id
where d.status = 'pending'
  and d.due_date < current_date
  and a.status not in ('draft', 'terminated', 'lapsed');

-- Cost of gifting vs delivered reach, per brand. cost_price stays behind the
-- admin-only role at the app layer, same as the existing gifting tracker.
create or replace view v_gifting_roi as
select
  b.name                                  as brand,
  count(distinct a.id)                    as agreements,
  sum(p.quantity * p.rrp)                 as total_rrp_gifted,
  sum(p.quantity * p.cost_price)          as total_cost_gifted,
  sum(d.reach)                            as total_reach,
  sum(d.engagement)                       as total_engagement
from influencer_agreements a
join brands b                                        on b.id = a.brand_id
left join influencer_agreement_products p             on p.agreement_id = a.id
left join influencer_agreement_deliverables d          on d.agreement_id = a.id and d.status = 'live'
where a.status not in ('draft', 'terminated')
group by b.name;

-- Seed per-brand config from brands.json — maps brands.json's text ids to
-- this app's existing integer brand ids.
insert into influencer_agreement_brand_config (brand_id, code, legal_note, tier, instagram_handle, exclusivity_category, naming_rule) values
  (5,  'UB',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor. Do not contract in the brand''s name.', 'A', '@uppababy_australia', 'Prams, travel systems and capsules', 'Capital U, capital P, capital P, lowercase b. Model generations as supplied, e.g. Vista V3.'),
  (8,  'FR',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'A', '@frida.aus', 'TBC — confirm scope, likely postpartum and baby care', null),
  (0,  'NN',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'A', '@nanit_au', 'Baby monitors and sleep tracking', null),
  (12, 'ST',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'A', '@smartrikeaus', 'TBC — confirm scope, likely trikes and ride-ons', 'smarTrike Wonder(tm), Wonder+(tm), Wonder max(tm). Trademark on first use, lowercase max.'),
  (4,  'WF',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'B', '@wonderfold.au', 'Stroller wagons and multi-child prams', 'WonderFold, capital W and capital F.'),
  (3,  'GB',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'B', '@gaiababynursery.au', 'Nursery furniture', 'Gaia Baby.'),
  (2,  'HN',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'B', '@hannie.australia', 'TBC — confirm product category', 'Hannie(r) where the registered mark is used.'),
  (1,  'MG',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'B', '@magicbaby.australia', 'TBC — confirm product category', 'Magic.'),
  (6,  'ZZ',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'C', '@zazu_australia', 'TBC — confirm scope, likely sleep aids and night lights', null),
  (11, 'MV',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'C', '@_mamave', 'TBC — confirm product category', null),
  (10, 'MM',  'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'C', '@matchstickmonkeyau', 'Teethers and feeding', 'Matchstick Monkey(tm) where the mark is used.'),
  (7,  'MIA', 'Coolkidz Australia Pty Ltd is the authorised Australian distributor.', 'C', '@miamily.au', 'Baby carriers', 'MiaMily, capital M capital M.'),
  (9,  'CK',  'House agreement. Use only for multi-brand gifting or Coolkidz-level activity, not for single-brand collaborations.', null, 'coolkidz_australia', 'TBC — must be set per agreement when multiple brands are gifted', null)
on conflict (brand_id) do update set
  code = excluded.code, legal_note = excluded.legal_note, tier = excluded.tier, instagram_handle = excluded.instagram_handle,
  exclusivity_category = excluded.exclusivity_category, naming_rule = excluded.naming_rule;
