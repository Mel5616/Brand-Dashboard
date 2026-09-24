-- WonderFold Warriors applications from wonderfold.com.au.
--
-- Replaces the downloadable PDF form (WF-WarriorForm-V3.pdf) that families
-- printed, had signed and emailed to info@coolkidz.com.au. The form now lives on
-- the site and posts here. It carries health information about a child, so:
--   * the table has RLS on and no policies: only the service role reads it;
--   * files (a signed practitioner letter, a plan page) go to a PRIVATE bucket,
--     never a public URL. Create it once in Supabase Storage:
--         name: warriors-files      public: OFF
--     (the API creates it on first use too, private, only if it is absent).

create table if not exists warriors_applications (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,          -- WW-XXXXXX, quoted by the family

  -- parent or guardian
  parent_name           text not null,
  email                 text not null,
  phone                 text,
  address               text,
  suburb                text,
  state                 text,
  postcode              text,

  -- the child
  child_name            text,
  child_age             text,
  needs                 text[],                       -- mobility, sensory, physical, neurodivergent, anxiety, complex medical, other
  how_it_helps          text,                          -- in the family's words

  -- what they want and how they'll pay
  wagon_interest        text,
  ndis_status           text,                          -- not NDIS | self-managed | plan-managed | NDIA-managed | not sure
  plan_manager_email    text,
  wants_ndis_quote      boolean not null default false,

  -- the practitioner (replaces the signed section of the PDF)
  practitioner_name     text,
  practitioner_title    text,
  provider_number       text,
  practice_name         text,
  practitioner_email    text,
  practitioner_phone    text,
  diagnosis             text,                          -- optional; what the practitioner is happy to share
  treatment_plan        text,                          -- yes | no | not sure
  consent_contact_practitioner boolean not null default false,

  -- declarations
  declaration           boolean not null default false, -- information is true and correct
  privacy_consent       boolean not null default false, -- ok to store and use to assess

  -- housekeeping
  status                text not null default 'new',   -- new | awaiting_practitioner | approved | declined | ordered | closed
  discount_code         text,
  handled_by            text,
  internal_note         text,
  source_ip             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists warriors_applications_status_idx on warriors_applications (status, created_at desc);
create index if not exists warriors_applications_email_idx  on warriors_applications (lower(email));
alter table warriors_applications enable row level security;

create table if not exists warriors_application_files (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references warriors_applications(id) on delete cascade,
  storage_path    text not null,            -- path inside the private warriors-files bucket
  file_name       text,
  content_type    text,
  bytes           bigint,
  kind            text not null default 'practitioner_letter', -- practitioner_letter | other
  created_at      timestamptz not null default now()
);
create index if not exists warriors_application_files_app_idx on warriors_application_files (application_id);
alter table warriors_application_files enable row level security;
