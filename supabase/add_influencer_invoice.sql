-- Optional invoice attached to a logged influencer gift (uploaded from the team
-- gift form when there's a paid collaboration invoice).
alter table influencer_entries add column if not exists invoice_url  text;
alter table influencer_entries add column if not exists invoice_file text;
