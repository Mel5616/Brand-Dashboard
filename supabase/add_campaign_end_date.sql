-- Adds an end date to campaigns so each can carry a start (key_date) and end.
-- Cards still sort/column by the start date (key_date).
alter table campaigns add column if not exists end_date date;
