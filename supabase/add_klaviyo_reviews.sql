-- Mirror of every brand's Klaviyo Reviews (all statuses), refreshed hourly by
-- scripts/review_rewards.py from GitHub Actions. The Reviews tab reads this
-- table (all 13 brands) instead of hitting Klaviyo live, which only worked
-- for the two brands whose keys are in the dashboard's env.
create table if not exists klaviyo_reviews (
  id            text primary key,          -- Klaviyo review id
  brand_id      int  not null,
  brand_name    text not null,
  rating        int,
  title         text,
  content       text,
  author        text,
  email         text,
  product_name  text,
  product_url   text,
  product_image text,
  status        text,                      -- published | pending | rejected
  verified      boolean,
  review_type   text,                      -- review | question
  smart_quote   text,
  public_reply  text,
  created       timestamptz,
  synced_at     timestamptz not null default now()
);
create index if not exists klaviyo_reviews_brand_created_idx on klaviyo_reviews (brand_id, created desc);
alter table klaviyo_reviews disable row level security;
