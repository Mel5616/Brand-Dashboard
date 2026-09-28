-- New Products: two extra milestone dates alongside launch_date, so the
-- "New products coming" table can show the whole runway (coming soon ->
-- stock arriving -> launch), not just the launch date.
alter table new_products add column if not exists coming_soon_date date;
alter table new_products add column if not exists stock_arriving_date date;
