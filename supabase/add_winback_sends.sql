-- Tracks the abandoned-cart win-back tool's per-customer discount codes and
-- send history (Email tab). Populated by src/app/api/winback/route.ts.
-- Prevents re-offering the same customer a code every time the panel is
-- reopened this cycle, and gives Mel a real record of what went out.
create table if not exists winback_sends (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              int not null,
  email                 text not null,
  name                  text,
  cart_value            numeric not null,
  discount_code         text,
  price_rule_id         text,
  klaviyo_list_id       text,
  klaviyo_campaign_id   text,
  status                text not null default 'draft',   -- draft | code_created | sent
  created_by            text,
  created_at            timestamptz not null default now(),
  sent_at               timestamptz,
  expires_at            timestamptz
);
create index if not exists winback_sends_brand_email_idx on winback_sends (brand_id, email);
alter table winback_sends disable row level security;
