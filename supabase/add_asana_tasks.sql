-- Asana tasks pulled (read-only) from one project for the Tasks tab.
create table if not exists asana_tasks (
  gid           text primary key,
  name          text,
  notes         text,
  assignee      text,
  due_on        date,
  completed     boolean default false,
  completed_at  timestamptz,
  section       text,
  status        text,
  priority      text,
  project_gid   text,
  permalink_url text,
  modified_at   timestamptz,
  brand_id      int,
  synced_at     timestamptz default now()
);
-- Custom fields + multi-project label (safe to run again on an existing table).
alter table asana_tasks add column if not exists status        text;
alter table asana_tasks add column if not exists priority      text;
alter table asana_tasks add column if not exists project_label text;
create index if not exists asana_tasks_due_idx on asana_tasks (due_on);
