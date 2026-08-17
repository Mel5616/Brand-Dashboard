-- Commission Factory's own monthly PLATFORM SUBSCRIPTION invoices (e.g. "Grow
-- technology plan" — a flat monthly fee per brand). Completely separate from
-- commission_factory / commission_factory_transactions, which cover affiliate
-- commission + CF's per-transaction override fee. Neither the Transactions API
-- nor the transaction-level InvoiceId exposes these — CF emails them as PDFs,
-- so they're entered manually (with the PDF attached) rather than synced.
create table if not exists commission_factory_invoices (
  id            uuid primary key default gen_random_uuid(),
  brand_id      int not null,
  invoice_no    text not null unique,
  period_month  text not null,   -- 'YYYY-MM' the fee covers
  invoice_date  date not null,
  due_date      date,
  subtotal      numeric default 0,   -- excl GST
  gst           numeric default 0,
  total         numeric default 0,   -- incl GST
  amount_paid   numeric default 0,
  amount_due    numeric default 0,
  file_url      text,
  file_name     text,
  created_by    text,
  created_at    timestamptz default now()
);
alter table commission_factory_invoices disable row level security;
create index if not exists cf_sub_invoices_brand_idx on commission_factory_invoices (brand_id, period_month);
