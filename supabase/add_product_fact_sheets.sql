-- Product Information (Phase 1): per-brand fact sheets stored as files.
-- The self-contained HTML (base64 images embedded) and exported PDF live in the
-- `fact-sheets` Storage bucket; this table holds the metadata + their URLs.
-- Multiple rows per brand allowed: the 'current' one shows on the list,
-- 'archived' ones stay retrievable but off the main list. Safe to re-run.

create table if not exists product_fact_sheets (
  id            uuid primary key default gen_random_uuid(),
  brand_name    text not null,
  html_url      text,
  pdf_url       text,
  last_updated  date not null default current_date,
  version       text not null default '1',
  status        text not null default 'current',   -- current | archived
  created_at    timestamptz not null default now()
);
create index if not exists product_fact_sheets_brand_idx on product_fact_sheets(brand_name, status);
