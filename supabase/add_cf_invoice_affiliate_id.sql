-- Commission Factory transactions already carry an InvoiceId (populated once CF
-- issues a payout invoice covering that transaction — null until then) and a
-- numeric AffiliateId (a stable key for counting distinct affiliates, safer
-- than deduping on the business-name string). Neither was captured before.
alter table commission_factory_transactions add column if not exists invoice_id text;
alter table commission_factory_transactions add column if not exists affiliate_id text;
create index if not exists cf_txn_invoice_idx on commission_factory_transactions (invoice_id) where invoice_id is not null;
