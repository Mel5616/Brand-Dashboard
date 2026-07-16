-- Public share link per creative job (brief sheet at /brief/[token]).
alter table creative_jobs add column if not exists share_token text;
