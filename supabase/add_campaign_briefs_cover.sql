-- First-page cover thumbnail (PNG in the campaign-briefs bucket), rendered
-- server-side from the uploaded PDF so brief cards can show a real preview.
alter table campaign_briefs add column if not exists cover_url text;
