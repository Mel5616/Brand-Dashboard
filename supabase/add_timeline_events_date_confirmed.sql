-- Timeline TBC support: a date can be locked/working (status) independently
-- of whether the date itself is confirmed yet. false = shows dashed with
-- "(TBC)" on the Timeline.
alter table timeline_events add column if not exists date_confirmed boolean not null default true;
