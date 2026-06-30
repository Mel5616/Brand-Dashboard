-- Optional invoice (PDF) link on a marketing expense line. Run once in Supabase.
alter table marketing_actuals add column if not exists invoice_url text;
