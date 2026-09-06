-- Shared conversation log for the public site assistants (Ask Davy on zazu-kids.com.au,
-- Ask Frida on fridaaustralia.com.au). Feeds the "AI Assistants" tab in the dashboard.
create table if not exists public.assistant_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  brand text not null,               -- 'zazu' | 'frida' | future brands
  session text,
  page text,
  question text not null,
  answer text not null,
  handoff boolean not null default false,   -- true when the answer pointed to the contact page / a health professional
  flagged boolean not null default false,   -- set from the dashboard to mark answers to review
  note text,                                 -- dashboard note (what to fix in the knowledge file)
  role text not null default 'assistant'     -- 'assistant' (AI answer) | 'human' (a team member replied from the dashboard)
);
create index if not exists assistant_logs_created_idx on public.assistant_logs (created_at desc);
create index if not exists assistant_logs_brand_idx on public.assistant_logs (brand, created_at desc);
alter table public.assistant_logs enable row level security;

-- One-off: bring the existing Ask Davy history into the shared table.
insert into public.assistant_logs (created_at, brand, session, page, question, answer)
select created_at, 'zazu', session, page, question, answer from public.zazu_chat_logs
where not exists (select 1 from public.assistant_logs a where a.brand = 'zazu' and a.created_at = zazu_chat_logs.created_at and a.question = zazu_chat_logs.question);

-- If the table already existed before the human-reply feature:
alter table public.assistant_logs add column if not exists role text not null default 'assistant';
create index if not exists assistant_logs_session_idx on public.assistant_logs (brand, session, id);
