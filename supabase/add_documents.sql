-- Documents (Partnerships & Affiliates > Documents): HTML documents with
-- tracked share links, same pattern as Launch Decks. Each share link has its
-- own token + label (a person or audience), so you can see exactly who
-- opened it and how long they spent, internally and externally.
create table if not exists documents (
  id bigint generated always as identity primary key,
  title text not null,
  brand text,
  html text not null,
  created_by text,
  created_at timestamptz not null default now()
);
alter table documents disable row level security;

create table if not exists document_shares (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  token uuid unique not null default gen_random_uuid(),
  label text not null,              -- who this link is for: "Team", "Baby Bunting - Sarah"
  created_at timestamptz not null default now()
);
alter table document_shares disable row level security;

create table if not exists document_views (
  id bigint generated always as identity primary key,
  share_id bigint not null references document_shares(id) on delete cascade,
  session_id text not null,         -- one row per open (browser session)
  viewer text,                      -- dashboard email when the viewer is logged in
  seconds int not null default 0,   -- heartbeat-accumulated viewing time
  opened_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (share_id, session_id)
);
alter table document_views disable row level security;
