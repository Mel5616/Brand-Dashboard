-- Per-link PDF permission: untick to share a view-only link (no PDF download).
alter table deck_shares add column if not exists allow_pdf boolean not null default true;
