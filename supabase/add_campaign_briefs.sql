-- Campaign Briefs (Influencers > Campaign Briefs). One brief per campaign,
-- rendered in-dashboard from uploaded HTML/PDF, assigned to one or more
-- influencers from the roster (influencers.handle).
create table if not exists campaign_briefs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  content_html text,          -- self-contained brief HTML (rendered inline via iframe)
  pdf_path text,               -- storage object path in the campaign-briefs bucket, for download
  pdf_name text,
  live_date date,
  status text not null default 'active',   -- active | archived
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_brief_influencers (
  brief_id uuid not null references campaign_briefs(id) on delete cascade,
  handle text not null,
  primary key (brief_id, handle)
);

alter table campaign_briefs disable row level security;
alter table campaign_brief_influencers disable row level security;

insert into storage.buckets (id, name, public)
values ('campaign-briefs', 'campaign-briefs', true)
on conflict (id) do nothing;
