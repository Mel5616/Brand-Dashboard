-- The registry engine now serves more than one shop: UPPAbaby (uppababy.com.au)
-- and the Coolkidz Gift Registry (coolkidz.com.au, every brand in one list).
-- Additive only. Every existing registry is an UPPAbaby one, which the default
-- records, so the live UPPAbaby registry keeps working through the change.

alter table registries add column if not exists store  text    not null default 'uppababy';
-- Coolkidz only: the parent chose to let guests find the list by name.
alter table registries add column if not exists listed boolean not null default false;

create index if not exists registries_store_idx on registries (store, status);
create index if not exists registries_search_idx on registries (store, listed, lower(owner_name));

-- Last order sync per store. Replaces the single-row registry_sync for new
-- code; that table is left in place so nothing reading it breaks.
create table if not exists registry_sync_stores (
  store       text primary key,
  last_run_at timestamptz,
  last_count  integer not null default 0
);
insert into registry_sync_stores (store, last_run_at)
  select 'uppababy', last_run_at from registry_sync where id = 1
  on conflict (store) do nothing;
insert into registry_sync_stores (store) values ('coolkidz') on conflict (store) do nothing;
alter table registry_sync_stores disable row level security;
