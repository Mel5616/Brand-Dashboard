-- Team management layer: a roster of who does what, and a weekly scorecard so the
-- manager sees each function's health (owner, status, headline) at a glance.

create table if not exists team_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  function   text not null,            -- Performance / Paid, Email, Social, Influencer, Store / Retail, Affiliate, Graphic Design, Photography
  email      text default '',
  focus      text default '',          -- one-line remit
  active     boolean default true,
  sort       int default 0,
  created_at timestamptz default now()
);
alter table team_members disable row level security;

-- One row per function = its current status (updated each week).
create table if not exists team_scorecard (
  function   text primary key,
  owner_id   uuid references team_members(id) on delete set null,
  status     text default 'green',     -- green | amber | red
  headline   text default '',          -- this week's key number / note
  updated_at timestamptz default now(),
  updated_by text
);
alter table team_scorecard disable row level security;

-- Per-person 1:1 notes and goals (built on the roster).
create table if not exists team_notes (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references team_members(id) on delete cascade,
  note_date  date default current_date,
  kind       text default 'note',      -- note | goal
  body       text not null,
  done       boolean default false,    -- for goals
  created_by text,
  created_at timestamptz default now()
);
alter table team_notes disable row level security;
create index if not exists team_notes_member_idx on team_notes (member_id);
