-- Free-text "Brand Updates" for the weekly brief — anything of relevance the
-- author wants the team to know, typed manually (stored as [{ text }]).
alter table weekly_briefs add column if not exists brand_updates jsonb default '[]'::jsonb;
