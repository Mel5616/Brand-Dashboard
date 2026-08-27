-- The "approved asset map" from the build brief §11 — the AI supplies an
-- image_ref key, never an arbitrary URL. Populated only from Filecamp
-- (AU-cleared) assets by scripts/sync_filecamp_assets.py, which mirrors
-- approved folders into the public "email-assets" Supabase Storage bucket.
create table if not exists email_asset_map (
  id uuid primary key default gen_random_uuid(),
  brand_id integer not null references brands(id),
  image_ref text not null,        -- stable key the AI/template references, e.g. "wonder-lifestyle-1"
  category text not null,         -- 'product' | 'lifestyle'
  product text,                   -- 'wonder' | 'wonder-plus' | 'wonder-max' | null (category-level asset)
  public_url text not null,       -- Supabase Storage public URL, what the email actually loads
  source_path text not null,      -- Filecamp path, for traceability back to the source of truth
  width integer,
  height integer,
  synced_at timestamptz not null default now(),
  unique (brand_id, image_ref)
);
create index if not exists email_asset_map_brand_idx on email_asset_map(brand_id);
