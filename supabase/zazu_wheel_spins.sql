-- One row per spin of the "Spin for a sleep-in" wheel on zazu-kids.com.au (src/app/api/zazu-wheel).
create table if not exists public.zazu_wheel_spins (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null,
  prize_key text not null,
  prize_label text not null,
  code text not null,
  discount_node text,
  expires_at timestamptz,
  consent boolean not null default false,
  session text,
  page text,
  ip_hash text
);
create index if not exists zazu_wheel_spins_email_idx on public.zazu_wheel_spins (email);
create index if not exists zazu_wheel_spins_created_idx on public.zazu_wheel_spins (created_at desc);
alter table public.zazu_wheel_spins enable row level security;
