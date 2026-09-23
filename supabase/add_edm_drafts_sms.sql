-- SMS as a second channel alongside email in the same Email Writing /
-- EDM Planner pipeline (Klaviyo treats SMS and Email campaigns as parallel
-- send types, so one shared drafting/scheduling flow fits both). subject/
-- preview_text/body_html stay null for an SMS row; sms_text holds the
-- actual message.
alter table edm_drafts add column if not exists channel text not null default 'email'; -- email | sms
alter table edm_drafts add column if not exists sms_text text;
