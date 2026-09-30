-- Whether the Furthr-linked order was that customer's first-ever UPPAbaby
-- order — resolved from Shopify (customer.numberOfOrders + their first
-- order name) the first time each row is loaded after upload, not computed
-- from anything in Furthr's own CSV. Nullable: null means not resolved yet.
alter table furthr_transactions add column if not exists is_new_customer boolean;
