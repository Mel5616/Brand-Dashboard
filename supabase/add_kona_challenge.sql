-- Kona Challenge in-store competition (Oct 2026): a stand-alone entry sign at
-- each store, each with its own QR code (?store=<slug> baked into the URL,
-- not asked in the form) so entries attribute to a real store without the
-- entrant having to self-report it. Fold, film, post on Instagram tagging
-- @uppababy_australia #KonaChallenge, then scan to register their email so a
-- winner can actually be reached (the video itself lives on Instagram, never
-- uploaded through this form).
create table if not exists kona_challenge_entries (
  id bigint generated always as identity primary key,
  store text not null,
  name text not null,
  email text not null,
  mobile text,
  instagram_handle text,
  fold_time_seconds numeric,
  is_winner boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists kona_challenge_entries_store_idx on kona_challenge_entries (store);
alter table kona_challenge_entries disable row level security;
