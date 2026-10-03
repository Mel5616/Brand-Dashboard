-- Carousel posts keep every slide's image (image_url stays the first/cover).
alter table social_drafts add column if not exists images jsonb;
