-- Digital downloads (lead magnets): a PDF a brand gives away in exchange for an
-- email address. Public page /download/<slug> captures the signup, stores it
-- here, sends the file, and pushes the person to the brand's Klaviyo account.
create table if not exists digital_downloads (
  id uuid primary key default gen_random_uuid(),
  brand_id int not null,
  slug text not null unique,
  title text not null,
  description text,
  file_url text not null,
  file_name text,
  klaviyo_list_id text,            -- list that consenting signups are subscribed to (optional)
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists download_signups (
  id uuid primary key default gen_random_uuid(),
  download_id uuid not null references digital_downloads(id) on delete cascade,
  email text not null,
  first_name text,
  consent boolean not null default false,   -- ticked "email me tips and offers"
  source text,                               -- ?src= from the link (instagram, email, qr...)
  klaviyo_status text,                       -- ok | skipped | error: <message>
  created_at timestamptz not null default now(),
  unique (download_id, email)
);
create index if not exists download_signups_dl_idx on download_signups (download_id, created_at desc);
alter table digital_downloads disable row level security;
alter table download_signups disable row level security;
