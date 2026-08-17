-- Second pass at "main vs individual" classification. codes_in_rule alone
-- turned out not to work: apps that bulk-generate discount codes (affiliate/
-- referral platforms) typically create ONE price rule per code, not many
-- codes sharing one rule — so codes_in_rule reads 1 for both a genuine main
-- promo code AND a bulk-generated one. Confirmed against real UPPAbaby data
-- (6,215 price rules total). The real signal is the price rule's TITLE:
-- a bulk batch shares an identical/templated title across hundreds or
-- thousands of separate rules; a real promo code's rule has its own title.
alter table shop_discount_codes add column if not exists rule_title text;
alter table shop_discount_codes add column if not exists title_shared_count int;
