-- Real Cin7 SKU on each influencer-agreement product line (captured when
-- picked from the catalogue — the catalogue already carries style_code,
-- it just wasn't persisted before), plus push tracking on the agreement
-- itself, mirroring the Giveaways/Product Requests Cin7 push.
alter table influencer_agreement_products add column if not exists style_code text;

alter table influencer_agreements add column if not exists cin7_sales_order_id text;
alter table influencer_agreements add column if not exists cin7_sales_order_ref text;
alter table influencer_agreements add column if not exists cin7_pushed_at timestamptz;
alter table influencer_agreements add column if not exists cin7_pushed_by text;
