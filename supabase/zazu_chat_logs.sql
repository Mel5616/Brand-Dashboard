-- Conversation log for the "Ask Davy" assistant on zazu-kids.com.au (src/app/api/zazu-chat).
create table if not exists public.zazu_chat_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session text,
  page text,
  question text not null,
  answer text not null
);
create index if not exists zazu_chat_logs_created_idx on public.zazu_chat_logs (created_at desc);
alter table public.zazu_chat_logs enable row level security;
