-- Timeline v2: allow undated ("waiting on a date") tray items.
alter table timeline_events alter column date drop not null;
