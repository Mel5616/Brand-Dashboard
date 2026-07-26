-- Launch decks (Plan > Launch Decks): HTML strategy decks with tracked share
-- links. Each share link has its own token + label (a person or audience), so
-- you can see exactly who opened a deck and how long they spent, internally
-- and externally.
create table if not exists decks (
  id bigint generated always as identity primary key,
  title text not null,
  brand text,
  html text not null,
  created_by text,
  created_at timestamptz not null default now()
);
alter table decks disable row level security;

create table if not exists deck_shares (
  id bigint generated always as identity primary key,
  deck_id bigint not null references decks(id) on delete cascade,
  token uuid unique not null default gen_random_uuid(),
  label text not null,              -- who this link is for: "Team", "Baby Bunting - Sarah"
  created_at timestamptz not null default now()
);
alter table deck_shares disable row level security;

create table if not exists deck_views (
  id bigint generated always as identity primary key,
  share_id bigint not null references deck_shares(id) on delete cascade,
  session_id text not null,         -- one row per open (browser session)
  viewer text,                      -- dashboard email when the viewer is logged in
  seconds int not null default 0,   -- heartbeat-accumulated viewing time
  opened_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (share_id, session_id)
);
alter table deck_views disable row level security;
