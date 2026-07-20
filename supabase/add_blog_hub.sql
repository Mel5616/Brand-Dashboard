-- Blog hub: the full published-blog library (from Shopify) plus per-post
-- performance — GA4 pageviews/sessions and Search Console clicks/rankings.
-- Populated by scripts/sync_blogs.py.

create table if not exists blog_articles (
  brand_id     int not null,
  article_id   text not null,
  blog_handle  text,
  title        text,
  handle       text,
  url          text,
  path         text,               -- /blogs/<blog>/<handle> — join key to metrics
  author       text,
  tags         text,
  published_at timestamptz,
  synced_at    timestamptz default now(),
  primary key (brand_id, article_id)
);
alter table blog_articles disable row level security;

-- GA4 monthly per blog page path
create table if not exists blog_page_metrics (
  brand_id  int not null,
  month_key text not null,
  path      text not null,
  pageviews int default 0,
  sessions  int default 0,
  synced_at timestamptz default now(),
  primary key (brand_id, month_key, path)
);
alter table blog_page_metrics disable row level security;

-- Search Console monthly per blog page URL
create table if not exists blog_gsc_pages (
  brand_id    int not null,
  month_key   text not null,
  page        text not null,
  clicks      int default 0,
  impressions int default 0,
  ctr         float default 0,
  position    float default 0,
  synced_at   timestamptz default now(),
  primary key (brand_id, month_key, page)
);
alter table blog_gsc_pages disable row level security;
