-- Weekly team brief: objectives/to-dos + an auto-assembled snapshot (D2C results,
-- upcoming launches, needs-attention), published to a token link the team opens
-- without logging in — same pattern as campaign shares (/c/[token]).
-- The snapshot is FROZEN at publish so a given week's link doesn't change later.

create table if not exists weekly_briefs (
  id           uuid primary key default gen_random_uuid(),
  share_token  text unique not null,
  week_label   text,
  intro        text default '',
  objectives   jsonb default '[]'::jsonb,   -- [{ text, done }]
  snapshot     jsonb default '{}'::jsonb,    -- { d2c, launches, attention, generatedAt }
  published_at timestamptz,
  created_by   text,
  created_at   timestamptz default now()
);
alter table weekly_briefs disable row level security;

create index if not exists weekly_briefs_published_idx on weekly_briefs (published_at desc);
