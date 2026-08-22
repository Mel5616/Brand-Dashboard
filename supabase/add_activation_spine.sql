-- Powers the Activations "spine" — a visual timeline (phases, trade-date
-- markers, campaign bars) plus a budget burn chart driven by REAL marketing
-- budget data (marketing_budgets + budget_topups + marketing_actuals), a
-- pillar allocation model, and open decisions/asks for Global. Modelled on
-- Mel's own prototype (frida-q4-activation-plan.html).

-- Campaign strategy fields — additive to the existing campaigns table used
-- by Campaign Calendar, so nothing there breaks.
alter table campaigns add column if not exists pillar text;
alter table campaigns add column if not exists confirmed boolean not null default true;

-- Retail/trade moments (Father's Day, BFCM, Click Frenzy…) that aren't
-- tradeshows — those stay sourced from the existing tradeshows table.
create table if not exists activation_trade_dates (
  id bigint generated always as identity primary key,
  brand_id int not null,
  date date not null,
  end_date date,
  label text not null,
  kind text not null default 'trade', -- 'trade' | 'peak'
  confirmed boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists activation_trade_dates_brand_idx on activation_trade_dates (brand_id);
alter table activation_trade_dates disable row level security;

-- Named phases across the report window (e.g. Capture / Convert / Keep).
create table if not exists activation_phases (
  id bigint generated always as identity primary key,
  brand_id int not null,
  key text not null,
  label text not null,
  sub text,
  start_date date not null,
  end_date date not null,
  color text not null default '#132741',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activation_phases_brand_idx on activation_phases (brand_id);
alter table activation_phases disable row level security;

-- Pillar allocation model — the % SHARE of budget each pillar gets. Not
-- derived from real spend (pillars aren't tracked as a real budget line
-- anywhere); this is the planning model, same as Mel's prototype.
create table if not exists activation_pillars (
  id bigint generated always as identity primary key,
  brand_id int not null,
  key text not null,
  label text not null,
  color text not null default '#132741',
  share_pct numeric not null default 0,
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists activation_pillars_brand_key_idx on activation_pillars (brand_id, key);
alter table activation_pillars disable row level security;

create table if not exists activation_decisions (
  id bigint generated always as identity primary key,
  brand_id int not null,
  due_label text,
  question text not null,
  recommendation text,
  resolved boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activation_decisions_brand_idx on activation_decisions (brand_id);
alter table activation_decisions disable row level security;

create table if not exists activation_asks (
  id bigint generated always as identity primary key,
  brand_id int not null,
  audience text not null,
  ask text not null,
  why text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activation_asks_brand_idx on activation_asks (brand_id);
alter table activation_asks disable row level security;

-- Seed Frida's Q4 spine from the prototype (2026-08-21).
insert into activation_phases (brand_id, key, label, sub, start_date, end_date, color, sort_order) values
  ((select id from brands where name = 'Frida'), 'capture', 'Capture', 'third trimester', '2026-09-01', '2026-10-15', '#2F7FC9', 1),
  ((select id from brands where name = 'Frida'), 'convert', 'Convert', 'peak trade',       '2026-10-16', '2026-11-30', '#A32D5C', 2),
  ((select id from brands where name = 'Frida'), 'keep',    'Keep',    'summer + retain',  '2026-12-01', '2026-12-31', '#12756D', 3);

insert into activation_pillars (brand_id, key, label, color, share_pct, note, sort_order) values
  ((select id from brands where name = 'Frida'), 'acquire',  'Acquire',  '#2F7FC9', 18, 'Email capture and prospecting. Feeds every other pillar.', 1),
  ((select id from brands where name = 'Frida'), 'advocacy', 'Advocacy', '#12756D', 22, 'Midwives, hospitals, antenatal educators, education content.', 2),
  ((select id from brands where name = 'Frida'), 'reach',    'Reach',    '#BE7213', 27, 'Creators, UGC, seeding, summer shoot.', 3),
  ((select id from brands where name = 'Frida'), 'convert',  'Convert',  '#A32D5C', 23, 'BFCM, gifting, referral, Amazon and retail support.', 4),
  ((select id from brands where name = 'Frida'), 'reserve',  'Reserve',  '#6B7280', 10, 'Held back for reactive spend. Do not pre-commit.', 5)
on conflict (brand_id, key) do nothing;

insert into activation_trade_dates (brand_id, date, end_date, label, kind, confirmed) values
  ((select id from brands where name = 'Frida'), '2026-09-06', null, 'Father''s Day', 'trade', true),
  ((select id from brands where name = 'Frida'), '2026-10-12', null, 'Prime Big Deal Days', 'trade', false),
  ((select id from brands where name = 'Frida'), '2026-10-15', null, 'Pregnancy & Infant Loss Remembrance Day', 'trade', true),
  ((select id from brands where name = 'Frida'), '2026-11-11', null, 'Click Frenzy', 'trade', false),
  ((select id from brands where name = 'Frida'), '2026-11-17', null, 'World Prematurity Day', 'trade', true),
  ((select id from brands where name = 'Frida'), '2026-11-27', null, 'Black Friday', 'peak', true),
  ((select id from brands where name = 'Frida'), '2026-12-12', null, 'Christmas dispatch cut', 'trade', false),
  ((select id from brands where name = 'Frida'), '2026-12-26', null, 'Boxing Day', 'trade', true);

insert into activation_decisions (brand_id, due_label, question, recommendation, sort_order) values
  ((select id from brands where name = 'Frida'), '29 Aug', 'Does the free foam offer retire on 30 September?', 'Yes. Swap to a gift ladder for Q4, because the job changes from awareness to basket size.', 1),
  ((select id from brands where name = 'Frida'), '3 Oct', 'Second Frida event in November, or hold for early 2027?', 'Hold for 2027. November is already the heaviest month and an HCP evening deserves its own run up.', 2),
  ((select id from brands where name = 'Frida'), 'TBC', 'Sep to Dec budget total and sign off.', 'Needed before this goes to global — every figure on this page is modelled off it.', 3);

insert into activation_asks (brand_id, audience, ask, why, sort_order) values
  ((select id from brands where name = 'Frida'), 'Global commercial', 'Resolve the Amazon US pricing conflict before Black Friday', 'Postpartum Recovery Kit lists at A$69.60 on the US listing against our A$149 RRP. AU D2C and Baby Bunting both get undercut in the biggest week of the year.', 1),
  ((select id from brands where name = 'Frida'), 'Global brand', 'Sampling stock and formal backing for the Educator Network', 'The HCP programme is the wedge against Due by The Memo. It needs product, not just permission.', 2);
