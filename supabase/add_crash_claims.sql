-- Crash Exchange claims and product registrations from uppababy.com.au.
--
-- Both were going to be built in the Shopify Forms app. The app cannot be made
-- to look like the rest of the site, and a Shopify contact form cannot take a
-- file at all, which this needs: a claim is a receipt plus photographs.
--
-- Files do NOT live in a public bucket. A proof of purchase carries a name, an
-- address and what somebody paid, and the sales-hub bucket's public-URL pattern
-- would make every one of them readable by anyone who had the link. The bucket
-- below is private and the dashboard signs a short-lived URL when Mel opens a
-- claim. Create it once in Supabase Storage:
--
--     name: claim-files      public: OFF
--
-- (the API creates it on first use too, but only if it does not already exist,
--  so making it by hand and leaving it private is the safe order.)

create table if not exists crash_claims (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,        -- what the customer is told to quote
  kind              text not null default 'crash',  -- crash | registration

  -- who
  name              text not null,
  email             text not null,
  phone             text,
  postal_address    text,

  -- what
  product_type      text,
  model             text,
  serial_number     text,
  purchase_date     date,
  retailer          text,

  -- the accident. null on a registration.
  accident_date     date,
  seat_position     text,
  child_in_seat     text,
  report_number     text,
  notes             text,

  -- housekeeping
  status            text not null default 'new',    -- new | in_progress | approved | declined | closed
  handled_by        text,
  internal_note     text,
  source_ip         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists crash_claims_status_idx on crash_claims (status, created_at desc);
create index if not exists crash_claims_email_idx  on crash_claims (lower(email));
create index if not exists crash_claims_kind_idx   on crash_claims (kind, created_at desc);

-- One row per uploaded file. storage_path is a path inside the PRIVATE
-- claim-files bucket, never a public URL, so a row on its own grants nothing.
create table if not exists crash_claim_files (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references crash_claims(id) on delete cascade,
  storage_path  text not null,
  file_name     text not null,
  content_type  text,
  bytes         integer,
  kind          text not null default 'photo',   -- receipt | photo
  created_at    timestamptz not null default now()
);
create index if not exists crash_claim_files_claim_idx on crash_claim_files (claim_id);

alter table crash_claims      disable row level security;
alter table crash_claim_files disable row level security;
