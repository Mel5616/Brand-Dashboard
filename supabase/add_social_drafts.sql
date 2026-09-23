-- Social Writing pipeline (Owned & Earned > Social Writing): a caption/
-- hashtag/visual-direction draft per platform+format, written in-brand from
-- a one-line brief, reviewed here, then posted by hand (no publishing API is
-- wired up for any platform, so "posted" is a manual status mark). Mirrors
-- edm_drafts.sql's shape/workflow.
create table if not exists social_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id int not null,
  status text not null default 'draft',        -- draft | approved | posted | rejected
  platform text not null default 'instagram',   -- instagram | tiktok | facebook | pinterest
  format text,                                   -- feed | reel | story | carousel
  caption text,
  hashtags text,
  visual_direction text,                         -- what the shot/graphic should be, for whoever shoots/designs it
  brief text,
  note text,                                     -- rejection reason / internal note
  scheduled_for date,
  campaign_id uuid,
  campaign_name text,
  created_by text,
  approved_by text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_drafts_brand_idx on social_drafts (brand_id);
create index if not exists social_drafts_status_idx on social_drafts (status);
create index if not exists social_drafts_campaign_idx on social_drafts (campaign_id);
alter table social_drafts disable row level security;
