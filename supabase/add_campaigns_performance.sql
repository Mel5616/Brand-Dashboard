-- Closes the loop: a lightweight verdict + note on what actually happened,
-- so the next AI Draft for this brand can reference real performance
-- instead of guessing cold every time. See src/app/api/campaigns/[id]/draft
-- (pulls the brand's recent verdicts/notes into the prompt as context).
alter table campaigns add column if not exists performance_verdict text; -- worked | mixed | didnt_work | too_early
alter table campaigns add column if not exists performance_note text;
