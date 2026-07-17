-- Design priority queue: the ordered "this week" list the designer works from.
-- Tasks stay in Asana (source of truth, synced into asana_tasks); this table
-- only holds which tasks are queued and in what order.
create table if not exists design_priorities (
  task_gid  text primary key,
  rank      int default 0,
  added_by  text,
  created_at timestamptz default now()
);
alter table design_priorities disable row level security;
