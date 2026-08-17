-- One lifestyle image per brand for the Brand Assets card grid.
create table if not exists brand_asset_images (
  brand      text primary key,
  image_url  text not null,
  updated_by text,
  updated_at timestamptz default now()
);
alter table brand_asset_images disable row level security;
