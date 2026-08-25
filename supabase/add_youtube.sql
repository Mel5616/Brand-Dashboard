-- YouTube organic — subscriber/view snapshots per month (for growth trend)
-- and a top-videos gallery per brand. Public YouTube Data API v3 only (an
-- API key, not OAuth) — no per-channel authorisation needed.
create table if not exists youtube_organic (
  id bigint generated always as identity primary key,
  brand_id int not null,
  month_key text not null, -- YYYY-MM, snapshot taken at sync time
  subscribers int not null default 0,
  total_views bigint not null default 0,
  video_count int not null default 0,
  channel_title text,
  synced_at timestamptz not null default now(),
  unique (brand_id, month_key)
);
create index if not exists youtube_organic_brand_idx on youtube_organic (brand_id);
alter table youtube_organic disable row level security;

create table if not exists youtube_videos (
  id bigint generated always as identity primary key,
  brand_id int not null,
  video_id text not null,
  title text,
  thumbnail_url text,
  published_at timestamptz,
  view_count bigint not null default 0,
  like_count bigint not null default 0,
  comment_count bigint not null default 0,
  synced_at timestamptz not null default now()
);
create index if not exists youtube_videos_brand_idx on youtube_videos (brand_id);
alter table youtube_videos disable row level security;
