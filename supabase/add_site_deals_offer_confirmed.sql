-- Black Friday readiness tracker: a deal's TEXT can already describe a
-- decision (e.g. "Confirmed. Early access 25 Nov...") without Mel having
-- actually signed off yet — that's just drafting language. This flag is the
-- real signal: Shopify discount-code creation and site-deal approval are
-- both gated on it in the dashboard's Black Friday readiness view.
alter table site_deals add column if not exists offer_confirmed boolean not null default false;
