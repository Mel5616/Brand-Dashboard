-- Multiple content pieces per influencer gift (up to 5): each post/reel/story
-- with its own link, type, date, likes and reach. Entry-level likes/reach become
-- the SUM of pieces (kept in sync by the API) so all reporting works unchanged.
create table if not exists influencer_content (
  id bigint generated always as identity primary key,
  entry_id bigint not null references influencer_entries(id) on delete cascade,
  url text,
  content_type text,
  posted_at date,
  likes int,
  reach int,
  created_at timestamptz not null default now()
);
create index if not exists influencer_content_entry_idx on influencer_content (entry_id);
alter table influencer_content disable row level security;
