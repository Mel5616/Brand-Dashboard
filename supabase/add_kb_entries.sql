-- UPPAbaby (and later other brands) knowledge base: one row per question and answer.
-- Feeds the Ask chats and the help centre. See docs spec 2026-10-01.
create table if not exists public.kb_entries (
  id bigint generated always as identity primary key,
  brand text not null,
  topic text not null,
  models text[] not null default '{}',
  question text not null,
  answer text not null,
  link text,
  source text not null check (source in ('website','confirmed','help_centre','helpdesk','team_reply')),
  source_ref text,
  ext_key text not null,
  sort_order integer not null default 100000,
  corrects bigint references public.kb_entries(id) on delete set null,
  status text not null default 'draft' check (status in ('approved','draft','needs_review','retired')),
  decided_by text,
  decided_reason text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, ext_key)
);
create index if not exists kb_entries_brand_status_idx on public.kb_entries (brand, status, sort_order);
alter table public.kb_entries enable row level security;   -- service role only

create table if not exists public.kb_history (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.kb_entries(id) on delete cascade,
  before jsonb,
  after jsonb not null,
  changed_by text,
  reason text,
  changed_at timestamptz not null default now()
);
create index if not exists kb_history_entry_idx on public.kb_history (entry_id, changed_at desc);
alter table public.kb_history enable row level security;

-- Every insert and update is written to kb_history (after the row exists, so entry_id is known);
-- changed_by / reason come from decided_by / decided_reason. updated_at is touched on update.
create or replace function public.kb_entries_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create or replace function public.kb_entries_audit() returns trigger language plpgsql as $$
begin
  insert into public.kb_history (entry_id, before, after, changed_by, reason)
  values (new.id, case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new), new.decided_by, new.decided_reason);
  return null;
end $$;
drop trigger if exists kb_entries_touch_trg on public.kb_entries;
create trigger kb_entries_touch_trg before update on public.kb_entries for each row execute function public.kb_entries_touch();
drop trigger if exists kb_entries_audit_trg on public.kb_entries;
create trigger kb_entries_audit_trg after insert or update on public.kb_entries for each row execute function public.kb_entries_audit();
