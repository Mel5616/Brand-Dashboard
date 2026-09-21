-- Passwords vault (Operations > Passwords), admin-only. Passwords are never
-- stored in plain text — see src/lib/credentialsCrypto.ts (AES-256-GCM,
-- key from CREDENTIALS_ENCRYPTION_KEY, never checked into the repo).
create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  name text not null,            -- service/site name, e.g. "Filecamp"
  url text,
  username text,
  password_encrypted text not null,
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table credentials disable row level security;
