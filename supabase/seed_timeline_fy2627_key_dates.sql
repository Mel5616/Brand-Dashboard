-- FY2026-27 portfolio-wide key dates from Mel's Master Calendar brief
-- (section 10). Confirmed dates go straight in; a handful of dates Mel
-- explicitly said not to guess are seeded as TBC placeholders in the most
-- likely month, clearly marked "Confirm dates" so they're never mistaken
-- for a real date. brand_id -1 is the portfolio-wide sentinel (matches
-- COOLKIDZ_TIMELINE_BRAND in src/app/api/timeline-events/route.ts).
insert into timeline_events (brand_id, event_type, title, date, end_date, note, date_confirmed, created_by) values
  (-1, 'key_date', 'World Breastfeeding Week', '2026-08-01', '2026-08-07', null, true, 'seed'),
  (-1, 'tentpole', 'Father''s Day', '2026-09-06', null, null, true, 'seed'),
  (-1, 'key_date', 'Singles Day', '2026-11-11', null, null, true, 'seed'),
  (-1, 'tentpole', 'Black Friday', '2026-11-27', null, null, true, 'seed'),
  (-1, 'key_date', 'Cyber Monday', '2026-11-30', null, 'Linked to Black Friday', true, 'seed'),
  (-1, 'tentpole', 'Christmas Day', '2026-12-25', null, null, true, 'seed'),
  (-1, 'key_date', 'Boxing Day', '2026-12-26', null, null, true, 'seed'),
  (-1, 'key_date', 'New Year''s Day', '2027-01-01', null, null, true, 'seed'),
  (-1, 'key_date', 'Australia Day', '2027-01-26', null, null, true, 'seed'),
  (-1, 'key_date', 'Valentine''s Day', '2027-02-14', null, null, true, 'seed'),
  (-1, 'key_date', 'International Women''s Day', '2027-03-08', null, null, true, 'seed'),
  (-1, 'key_date', 'Easter (Good Friday to Easter Monday)', '2027-03-26', '2027-03-29', null, true, 'seed'),
  (-1, 'tentpole', 'Mother''s Day', '2027-05-09', null, null, true, 'seed'),
  (-1, 'tentpole', 'EOFY', '2027-06-30', null, null, true, 'seed'),
  (-1, 'key_date', 'Amazon Prime Day', '2026-07-15', null, 'Confirm dates', false, 'seed'),
  (-1, 'key_date', 'Amazon Prime Big Deal Days', '2026-10-08', null, 'Confirm dates', false, 'seed'),
  (-1, 'key_date', 'Click Frenzy', '2026-11-10', null, 'Confirm dates', false, 'seed'),
  (-1, 'retailer_promo', 'Baby Bunting major sale events', '2026-09-01', null, 'Confirm dates each season', false, 'seed'),
  (-1, 'trade', 'PBC Expo (each city)', '2026-08-01', null, 'Confirm dates', false, 'seed'),
  (-1, 'trade', 'One Fine Baby', '2026-09-01', null, 'Confirm dates', false, 'seed');
