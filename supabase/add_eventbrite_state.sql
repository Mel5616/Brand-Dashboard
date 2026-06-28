-- Adds a state column to eventbrite_events so Tune-Up Days can be grouped by
-- Australian state. Backfilled by the next sync_eventbrite run (venue region).
alter table eventbrite_events add column if not exists state text;
