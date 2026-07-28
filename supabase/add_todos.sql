-- Personal to-do lists: one private list per dashboard login, reachable from
-- every tab via the floating ✓ button.
create table if not exists todos (
  id bigint generated always as identity primary key,
  user_email text not null,
  text text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists todos_user_idx on todos (user_email, done, created_at);
alter table todos disable row level security;
