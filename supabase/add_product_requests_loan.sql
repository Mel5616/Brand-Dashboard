-- Some product requests are loans (samples for photoshoots, press, etc)
-- that should come back to stock rather than being consumed/gifted away.
alter table product_requests add column if not exists is_loan boolean not null default false;
