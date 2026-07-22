-- Media release module: digital photography/media release signing workflow.
-- Admin creates a release, guardian signs via a single-use tokenised link,
-- signed PDF stored in the PRIVATE media-releases bucket and emailed.
create table if not exists media_releases (
  id uuid primary key default gen_random_uuid(),
  token uuid unique not null default gen_random_uuid(),
  status text not null default 'sent',   -- draft | sent | signed | withdrawn | expired
  child_first_name text not null,
  guardian_name text not null,
  guardian_email text not null,
  guardian_phone text,
  guardian_relationship text,
  brand text not null,
  campaign text,
  shoot_date date,
  shoot_location text,
  note text,
  retail_partner_optin boolean default false,
  terms_version text not null,
  signed_name text,
  signature_image_path text,
  pdf_path text,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  withdrawn_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_by text,
  created_at timestamptz not null default now()
);
alter table media_releases disable row level security;

-- Private storage bucket for signatures + signed PDFs (no public URLs ever).
insert into storage.buckets (id, name, public)
values ('media-releases', 'media-releases', false)
on conflict (id) do nothing;
