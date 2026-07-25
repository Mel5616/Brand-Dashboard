-- Event concepts library (Plan > Event Concepts): event ideas with uploaded
-- concept documents (PDF/Word/etc), brand, proposed date and status.
create table if not exists event_concepts (
  id bigint generated always as identity primary key,
  title text not null,
  brand text,
  event_date date,
  location text,
  status text not null default 'concept',  -- concept | pitched | approved | planning | locked | done | parked
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table event_concepts disable row level security;

create table if not exists event_concept_files (
  id bigint generated always as identity primary key,
  concept_id bigint not null references event_concepts(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);
alter table event_concept_files disable row level security;
