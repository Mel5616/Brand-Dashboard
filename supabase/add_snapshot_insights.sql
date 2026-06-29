-- Editable "Insights and opportunities" override for the Monthly Snapshot report.
-- A saved value replaces the AI-generated insight text in the report for that brand+month.
alter table snapshot_notes add column if not exists insights text;
