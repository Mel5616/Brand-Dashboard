-- Real on/off state for the "Live Promotions" panel.
-- shop_discount_codes.manual_status: null (default, follow Shopify's own
-- dates/status) | 'deactivated' (turned off from the dashboard — a real
-- Shopify discountCodeDeactivate call, not just a display flag).
alter table shop_discount_codes add column if not exists manual_status text;

-- site_deals.paused: own-site deals have no Shopify-side state to toggle,
-- so this is the dashboard's own on/off flag for "still show this as live".
alter table site_deals add column if not exists paused boolean not null default false;
