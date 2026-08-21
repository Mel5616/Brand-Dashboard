-- Gift order sheet approval workflow: once an influencer signs, the order
-- sheet is watermarked "not yet approved" until Mel explicitly approves it —
-- approving fires the email to Accounts in the same action (see chat: "hard
-- gate" + "one button emails the PDF straight to an accounts inbox").
alter table influencer_agreements add column if not exists order_sheet_approved_at timestamptz;
alter table influencer_agreements add column if not exists order_sheet_approved_by text;
alter table influencer_agreements add column if not exists order_sheet_sent_at timestamptz;
