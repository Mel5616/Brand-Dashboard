-- Team Scorecards: per-staff role definition + KPI framework + scoring.
-- SECURITY: RLS is ENABLED on every table with NO policies — anon/authenticated
-- clients can read nothing. All access goes through server routes using the
-- service-role key, gated on the dashboard admin role (Mel). Storage bucket
-- `role-documents` is PRIVATE (signed URLs only).

create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role_title text default '',
  employment_type text default '',
  hours text default '',
  work_arrangement text default '',
  location text default '',
  reports_to text default '',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists staff_brand_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  brand text not null,
  tier text check (tier in ('A','B','C')),
  ownership text default 'support' check (ownership in ('primary','support'))
);

create table if not exists kpi_areas (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  weight_pct int default 0
);

create table if not exists kpis (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references kpi_areas(id) on delete cascade,
  description text not null,
  target text default '',
  measured_via text default '',
  cadence text default 'monthly' check (cadence in ('per_campaign','monthly','quarterly','half_yearly','annual','ongoing')),
  is_tbc boolean default false,
  tbc_note text default '',
  sort_order int default 0,
  active boolean default true
);

create table if not exists kpi_scores (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid references kpis(id) on delete restrict,   -- scores block hard deletes
  period text not null,                                 -- '2026-07' | '2026-Q3' | '2026-H2' | '2026'
  rag text default 'not_scored' check (rag in ('green','amber','red','not_scored')),
  actual_value text default '',
  notes text default '',
  scored_by text,
  scored_at timestamptz default now()
);
create unique index if not exists kpi_scores_kpi_period_idx on kpi_scores (kpi_id, period);

create table if not exists role_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  version int default 1,
  file_path text not null,
  source text default 'uploaded' check (source in ('generated','uploaded')),
  label text default '',
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text,
  target text,
  detail jsonb,
  created_at timestamptz default now()
);

-- Deny-all RLS: no policies on purpose (service role bypasses; clients get nothing).
alter table staff_members enable row level security;
alter table staff_brand_assignments enable row level security;
alter table kpi_areas enable row level security;
alter table kpis enable row level security;
alter table kpi_scores enable row level security;
alter table role_documents enable row level security;
alter table audit_log enable row level security;
