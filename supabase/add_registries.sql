-- Baby registry and wishlist for uppababy.com.au.
--
-- The UI lives entirely in the Shopify theme so that the link a parent sends to
-- their family is an uppababy.com.au one. This is the store behind it, reached
-- from the storefront through /api/registry/* on marketing.coolkidz.com.au.
--
-- Two tokens per registry, both unguessable:
--   share_token   goes in the link sent to family. Read only, and never returns
--                 the owner's email or address.
--   manage_token  kept by the parent. Required to add, edit or remove items.
-- A share token is not enough to change anything, so a link forwarded around a
-- family group cannot be used to empty the list.

create table if not exists registries (
  id             uuid primary key default gen_random_uuid(),
  share_token    text not null unique,
  manage_token   text not null unique,
  owner_name     text not null,
  owner_email    text not null,
  partner_name   text,
  due_date       date,
  greeting       text,                                    -- shown to guests at the top of the list
  ship_suburb    text,
  ship_state     text,
  status         text not null default 'active',          -- active | archived
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists registries_email_idx on registries (lower(owner_email));

-- One row per product a parent wants. Quantities matter: two sleep bags, one
-- pram. `purchased` is only ever moved by the order sync, never by the browser.
create table if not exists registry_items (
  id             uuid primary key default gen_random_uuid(),
  registry_id    uuid not null references registries(id) on delete cascade,
  variant_id     text not null,
  product_id     text,
  handle         text not null,
  title          text not null,
  variant_title  text,
  image_url      text,
  price_cents    integer,
  wanted         integer not null default 1,
  purchased      integer not null default 0,
  note           text,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (registry_id, variant_id)
);
create index if not exists registry_items_reg_idx on registry_items (registry_id, position);

-- A guest who has clicked through to buy, but whose order has not landed yet.
-- Orders are polled, not pushed (nothing in this codebase uses webhooks), so
-- there is always a gap between the click and the confirmation in which a
-- second guest could buy the same pram. A hold is a soft claim over that gap.
-- It expires on its own if the sale never happens, so an abandoned cart frees
-- the gift back up without anyone having to tidy up after it.
create table if not exists registry_holds (
  id             uuid primary key default gen_random_uuid(),
  registry_item_id uuid not null references registry_items(id) on delete cascade,
  quantity       integer not null default 1,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);
create index if not exists registry_holds_item_idx on registry_holds (registry_item_id, expires_at);

-- Confirmed purchases, written by the order sync from the line item properties
-- the theme attaches at add to cart. Unique on the order line so a re-run of
-- the sync cannot count the same gift twice.
create table if not exists registry_purchases (
  id             uuid primary key default gen_random_uuid(),
  registry_id    uuid not null references registries(id) on delete cascade,
  registry_item_id uuid references registry_items(id) on delete set null,
  order_id       text not null,
  order_name     text,
  line_item_id   text not null,
  quantity       integer not null default 1,
  buyer_name     text,
  created_at     timestamptz not null default now(),
  unique (order_id, line_item_id)
);
create index if not exists registry_purchases_reg_idx on registry_purchases (registry_id);

alter table registries         disable row level security;
alter table registry_items     disable row level security;
alter table registry_holds     disable row level security;
alter table registry_purchases disable row level security;

-- When the order sync last ran. Registries are read most in the days a gift is
-- actually being bought, so viewing one triggers a sync if this is stale,
-- rather than waiting for the twice-daily job. One row, id 1.
create table if not exists registry_sync (
  id          integer primary key default 1,
  last_run_at timestamptz,
  last_count  integer not null default 0,
  check (id = 1)
);
insert into registry_sync (id, last_run_at) values (1, null) on conflict (id) do nothing;
alter table registry_sync disable row level security;
