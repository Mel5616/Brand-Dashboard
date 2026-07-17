-- Plan buckets on the design queue: urgent / week / next / soon.
-- Existing rows have null bucket, which the app reads as 'week'.
alter table design_priorities add column if not exists bucket text default 'week';
