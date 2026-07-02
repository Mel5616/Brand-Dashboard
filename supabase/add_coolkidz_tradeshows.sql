-- Coolkidz Website tradeshows.
-- Mirrors every UPPAbaby show (same dates / venue / state) as a separate show that
-- runs off the Coolkidz Website store (id 9), carrying the five Coolkidz brands:
-- Nanit (0), Magic (1), Hannie (2), Frida (8), Mamave (11).
-- Live sales for these shows come from the Coolkidz store, split per brand by
-- vendor / Brand_ tag. Safe to re-run (idempotent).

-- 1. Tag which storefront each show belongs to. Existing shows default to UPPAbaby.
alter table tradeshows add column if not exists store text not null default 'uppababy';

-- 2. One Coolkidz show per existing UPPAbaby show; id = 1000 + original id.
insert into tradeshows (id, name, date_start, date_end, state, location, store)
select (1000 + id::int)::text, name, date_start, date_end, state, location, 'coolkidz'
from tradeshows
where store = 'uppababy'
on conflict (id) do nothing;

-- 3. Attach the five Coolkidz Website brands to every Coolkidz show.
insert into tradeshow_brands (tradeshow_id, brand_id)
select t.id, b.brand_id
from tradeshows t
cross join (values (0), (1), (2), (8), (11)) as b(brand_id)  -- Nanit, Magic, Hannie, Frida, Mamave
where t.store = 'coolkidz'
on conflict do nothing;
