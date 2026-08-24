-- A super-visual, portfolio-wide timeline of what's physically coming:
-- stock arrivals, product launches, and coming-soon teasers. Separate from
-- the Campaign Calendar (marketing activity) and Launch Decks (the pitch
-- decks themselves) — this is "what's landing and when."
create table if not exists timeline_events (
  id bigint generated always as identity primary key,
  brand_id int not null,
  event_type text not null default 'launch', -- 'stock' | 'launch' | 'coming_soon'
  title text not null,
  date date not null,
  end_date date,
  product_name text,
  quantity int,
  status text,
  note text,
  image_url text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists timeline_events_brand_idx on timeline_events (brand_id);
create index if not exists timeline_events_date_idx on timeline_events (date);
alter table timeline_events disable row level security;
