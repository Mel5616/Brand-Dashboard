-- Blog hub v2: revenue attribution, per-post search queries, traffic sources.

-- GA4 landing-page attribution: sessions that STARTED on a blog post and the
-- purchase revenue those sessions produced.
create table if not exists blog_landing_metrics (
  brand_id  int not null,
  month_key text not null,
  path      text not null,
  sessions  int default 0,
  revenue   float default 0,
  transactions int default 0,
  synced_at timestamptz default now(),
  primary key (brand_id, month_key, path)
);
alter table blog_landing_metrics disable row level security;

-- Search Console query+page: what each blog post ranks for.
create table if not exists blog_gsc_queries (
  brand_id    int not null,
  month_key   text not null,
  page        text not null,
  query       text not null,
  clicks      int default 0,
  impressions int default 0,
  position    float default 0,
  synced_at   timestamptz default now(),
  primary key (brand_id, month_key, page, query)
);
alter table blog_gsc_queries disable row level security;

-- GA4 traffic-source split per blog page (organic / email / social / direct…).
create table if not exists blog_page_sources (
  brand_id  int not null,
  month_key text not null,
  path      text not null,
  channel   text not null,
  sessions  int default 0,
  synced_at timestamptz default now(),
  primary key (brand_id, month_key, path, channel)
);
alter table blog_page_sources disable row level security;
