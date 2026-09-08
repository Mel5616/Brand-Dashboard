-- review_url became optional once Judge.me could collect the review
-- directly on our own page — the DB column was never relaxed to match.
alter table review_incentives alter column review_url drop not null;
