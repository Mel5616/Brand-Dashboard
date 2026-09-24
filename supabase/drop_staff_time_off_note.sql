-- Notes were someone's free-text explanation to their own manager (a medical
-- detail, a birthday), never meant for a company-wide dashboard (Mel, 24 Sep
-- 2026). scripts/sync_connecteam.py no longer writes them; this drops the
-- column outright rather than leaving a permanently-null one behind.
alter table staff_time_off drop column if exists note;
