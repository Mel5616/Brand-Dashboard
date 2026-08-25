-- Campaign type (Search/Display/Video/Performance Max/...) per Google Ads
-- campaign row, so YouTube (VIDEO) spend can be broken out from the blended
-- Google Ads totals. Performance Max also serves on YouTube but isn't a pure
-- "video" campaign type, so it's shown separately, not folded in.
alter table google_ads_campaigns add column if not exists channel_type text;
