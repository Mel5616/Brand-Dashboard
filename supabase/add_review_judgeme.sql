-- Judge.me support: which product a QR/link's reviews attach to (optional —
-- omit for a shop-level review), and the actual rating/text captured on our
-- own page before it's posted to Judge.me and a reward is issued.
alter table review_incentives add column if not exists judgeme_product_id text;
alter table review_requests add column if not exists rating int;
alter table review_requests add column if not exists review_body text;
alter table review_requests add column if not exists review_posted boolean not null default false;
