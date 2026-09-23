-- A short, stable code per link that a QR code encodes instead of the raw
-- destination URL. /l/<code> (src/app/l/[code]/route.ts) looks up final_url
-- fresh from this table on every scan and 302s there — so editing a link's
-- destination (once editing exists, see the PATCH handler) changes where an
-- already-printed QR code sends people, instead of the QR being a dead
-- snapshot of whatever the URL was at print time.
alter table utm_links add column if not exists short_code text unique;
