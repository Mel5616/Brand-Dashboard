-- Full Asana custom-field map per task ({field name: display value}) — powers
-- the OOS-style Stock Report columns (Code / Stock Status / Ordering For).
alter table asana_tasks add column if not exists custom_fields jsonb;
