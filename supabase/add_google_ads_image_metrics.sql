-- Impressions/clicks per Performance Max image asset, if Google's API
-- actually exposes them (see scripts/sync.py fetch_google_ads_images — it
-- falls back gracefully to no metrics if the asset-level query is rejected).
alter table google_ads_images add column if not exists impressions bigint;
alter table google_ads_images add column if not exists clicks bigint;
