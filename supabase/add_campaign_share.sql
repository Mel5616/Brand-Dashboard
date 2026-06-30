-- Shareable campaign brief: public token + a hero image. Run once in Supabase.
alter table campaigns add column if not exists share_token uuid not null default gen_random_uuid();
alter table campaigns add column if not exists image_url text;
create index if not exists campaigns_share_token_idx on campaigns(share_token);
