-- Customer contact, for requests where the free product is going out to an
-- external customer (a warranty replacement, a sample sent to someone who
-- asked) rather than just an internal ship-to. Separate from
-- ship_to_name/ship_to_address (the shipping destination) and from
-- requester_name/requester_email (whoever on staff is submitting the
-- request) — a staff member can submit on a customer's behalf, so neither
-- of those fields is the customer's own contact info.
alter table product_requests add column if not exists customer_name  text;
alter table product_requests add column if not exists customer_email text;
alter table product_requests add column if not exists customer_phone text;
