-- SKU per tradeshow product line (only when every line under that product
-- title shared the exact same SKU — kept null otherwise so a "true revenue"
-- cost join never guesses). Enables joining against cost_sheet_items.style_code.
alter table tradeshow_products add column if not exists sku text;
