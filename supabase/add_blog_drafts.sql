-- AI Blog Writer pipeline (Blogging > AI Blog Writer): full-post drafts,
-- reviewed and approved by a human, then published straight to the right
-- brand's Shopify blog on approval. Separate from blog_articles (the
-- read-only mirror of what's already live, synced by scripts/sync_blogs.py).
create table if not exists blog_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id int not null,
  status text not null default 'draft',   -- draft | published | rejected
  blog_key text,                          -- which of the brand's blogs, e.g. "pregnancy-guides"
  title text not null,
  slug text,
  meta_title text,
  meta_description text,
  target_keyword text,
  intent text,                            -- the search intent this post answers
  site_role text,                         -- hero | cluster
  body_html text not null,
  brief text,                             -- the topic/angle brief it was generated from
  note text,                              -- rejection reason / internal note
  shopify_blog_id text,
  shopify_article_id text,
  shopify_handle text,
  published_url text,
  created_by text,
  approved_by text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_drafts_brand_idx on blog_drafts (brand_id);
create index if not exists blog_drafts_status_idx on blog_drafts (status);
alter table blog_drafts disable row level security;
