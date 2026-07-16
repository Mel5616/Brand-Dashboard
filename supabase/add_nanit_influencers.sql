-- Nanit influencer tracker: gifted collabs that need Nanit-issued subscription
-- codes. The social team logs rows in the dashboard; Nanit fills in the
-- subscription code + plan via a token-protected public page.
create table if not exists nanit_influencers (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,           -- 'YYYY-MM'
  name text not null,
  handle text default '',
  email text default '',
  followers text default '',         -- as written: '92.5k', '1M', '4,359'
  platform text default '',          -- IG, TT, IG/TT, IG/YT…
  partnership_type text default 'Influencer collab (gifted)',
  product_supplied text default '',
  product_value numeric,             -- AUD RRP
  subscription_code text default '',
  subscription_plan text default '',
  code_added_at timestamptz,         -- stamped when Nanit fills the code
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table nanit_influencers disable row level security;

-- Single share token for the Nanit-facing page.
create table if not exists nanit_settings (
  id int primary key default 1,
  share_token text
);
alter table nanit_settings disable row level security;
