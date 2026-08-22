-- Free-text strategic notes attached to a section of the Activations spine
-- (e.g. the case for the Baby Expos lane) — admin-editable, shown in the
-- shared report under that section's header.
create table if not exists activation_notes (
  id bigint generated always as identity primary key,
  brand_id int not null,
  section text not null,
  body text,
  updated_at timestamptz not null default now()
);
create unique index if not exists activation_notes_brand_section_idx on activation_notes (brand_id, section);
alter table activation_notes disable row level security;

insert into activation_notes (brand_id, section, body) values
  ((select id from brands where name = 'Frida'), 'baby_expos',
   E'Frida Australia is at seven baby expos between September and November 2026. On every stand, alongside the Coolkidz team, we place registered midwives in scrubs.\n\nThey are not there to sell. They are there to answer the questions people are too embarrassed to ask a salesperson, and too rushed to ask at a 15 minute antenatal appointment. What actually happens in the first 48 hours. What nobody tells you about the first wee. What you genuinely need in the bag and what is marketing.\n\nThe stand becomes the only place at the show where a pregnant woman can have a real conversation with an authoritative person who is not trying to close her.')
on conflict (brand_id, section) do update set body = excluded.body, updated_at = now();
