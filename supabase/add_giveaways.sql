-- Giveaways/competitions — the team was committing free product to running
-- giveaways (BabyLove, LePuree) with zero central visibility or approval.
-- Public no-login submit form (mirrors website_requests) + admin approval
-- queue + read-only pull into the Timeline once approved.
create extension if not exists "pgcrypto";

create table if not exists giveaways (
  id              uuid primary key default gen_random_uuid(),
  brand_id        int,
  title           text not null,               -- "BabyLove Giveaway"
  mechanic        text,                          -- how to enter
  items           text not null,                 -- what's being given away
  retail_value    numeric,                        -- $ value of the giveaway, portfolio exposure
  platform        text,                            -- Instagram, Facebook, EDM, Website, Other
  entry_link      text,                             -- live post/page
  start_date      date,
  end_date        date,
  results         text,                              -- entries, winner, reach — filled in after it runs
  status          text not null default 'proposed' check (status in ('proposed','approved','running','completed','rejected')),
  admin_note      text,
  approved_by     text,
  approved_at     timestamptz,
  submitter_name  text not null,
  submitter_email text not null,
  campaign_id     uuid,
  campaign_name   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists giveaways_status_idx on giveaways(status);
create index if not exists giveaways_brand_idx  on giveaways(brand_id);
alter table giveaways disable row level security;

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists giveaways_touch on giveaways;
create trigger giveaways_touch before update on giveaways
  for each row execute function touch_updated_at();
