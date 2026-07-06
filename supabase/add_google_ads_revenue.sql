-- Store Google Ads' actual reported conversion revenue as its own column.
-- Previously we only kept the rounded ROAS ratio and reconstructed revenue as
-- spend * roas in the UI (lossy). The sync now writes metrics.conversions_value
-- straight into this column; the UI prefers it and falls back to spend * roas
-- for older rows where revenue is still null.

ALTER TABLE google_ads ADD COLUMN IF NOT EXISTS revenue numeric;

COMMENT ON COLUMN google_ads.revenue IS 'Google Ads reported conversion value (conversions_value) for the brand-month.';
