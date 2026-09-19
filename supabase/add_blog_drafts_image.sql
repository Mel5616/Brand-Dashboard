-- Featured image for a blog draft, carried through to the Shopify article
-- on publish.
alter table blog_drafts add column if not exists image_url text;
