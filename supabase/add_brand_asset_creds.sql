-- Optional shared login per asset link (visible to every dashboard user —
-- intended for shared asset-library logins only).
alter table brand_asset_links add column if not exists username text;
alter table brand_asset_links add column if not exists password text;
