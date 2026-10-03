-- Social Writing drafts can carry the finished graphic for the post.
alter table social_drafts add column if not exists image_url text;
