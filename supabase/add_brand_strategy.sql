-- Brand Strategy scorecards: the "so what" layer above the tactical numbers.
-- One row per brand: headline commitments (paced live against actuals),
-- pillar scorecards (RAG), phase milestone checklists, attached strategy PDF.
create table if not exists brand_strategy (
  brand text primary key,
  fy text not null default '2026-27',
  positioning text,                   -- one-line brand positioning statement
  revenue_commit numeric,             -- headline Y1 revenue commitment
  marketing_commit numeric,           -- headline marketing investment
  pdf_url text,                       -- attached strategy document
  pdf_name text,
  pillars jsonb not null default '[]'::jsonb,  -- [{name, measure, status: "green"|"amber"|"red", note}]
  phases jsonb not null default '[]'::jsonb,   -- [{name, window, items: [{text, done}]}]
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table brand_strategy disable row level security;
