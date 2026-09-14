-- Website change requests — a public, no-login form (shared link) anyone
-- can submit through; requests land here for Mel to review and action.
create table if not exists website_requests (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  page_url text,
  change_type text not null default 'other',   -- copy | broken_link | new_page | image_banner | product_info | other
  description text not null,
  requester_name text not null,
  requester_email text not null,
  priority text not null default 'normal',      -- low | normal | urgent
  status text not null default 'new',           -- new | in_progress | done | declined
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table website_requests disable row level security;
