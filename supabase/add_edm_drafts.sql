-- Email Writing pipeline (Owned & Earned > Email Writing): full EDM drafts,
-- reviewed by a human, then pushed to Klaviyo via the existing KlaviyoSendPanel
-- on approval. Mirrors blog_drafts.sql's shape/workflow for the blog pipeline.
create table if not exists edm_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id int not null,
  status text not null default 'draft',   -- planned | draft | sent | rejected
  subject text,
  preview_text text,
  body_html text,
  brief text,                             -- the topic/instruction it was generated from
  target_keyword text,                    -- unused for email; kept for schema parity with blog_drafts
  note text,                              -- rejection reason / internal note
  scheduled_for date,                     -- planned send date, shown on the Timeline
  klaviyo_campaign_id text,
  image_url text,
  created_by text,
  approved_by text,
  published_at timestamptz,               -- set once Klaviyo confirms the send
  published_url text,                     -- Klaviyo campaign URL, if available
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists edm_drafts_brand_idx on edm_drafts (brand_id);
create index if not exists edm_drafts_status_idx on edm_drafts (status);
alter table edm_drafts disable row level security;
