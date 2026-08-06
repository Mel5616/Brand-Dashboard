-- Split Launch Decks into two categories so retailer-facing timelines never
-- get mixed up with internal launch decks. 'launch' | 'retailer'.
alter table decks add column if not exists category text not null default 'launch';
