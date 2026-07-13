-- Attach a job description document (PDF) to each team member, alongside the
-- optional free-text summary.
alter table team_members add column if not exists job_desc_url  text;
alter table team_members add column if not exists job_desc_file text;
