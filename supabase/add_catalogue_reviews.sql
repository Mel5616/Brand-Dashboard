-- Team-submitted catalogue/spec-sheet PDFs get an automatic AI first-pass for
-- spelling and brand-name-consistency issues before Mel does her own review.
-- Populated by /api/catalogue-review (POST from the public /catalogue-check
-- upload form), read by CatalogueReviewPanel on the Team tab.
create table if not exists catalogue_reviews (
  id            uuid primary key default gen_random_uuid(),
  brand         text,
  file_name     text not null,
  pdf_url       text not null,
  uploaded_by   text,
  notes         text,
  status        text not null default 'processing',   -- processing | pending_review | no_issues | reviewed | error
  ai_summary    text,
  ai_findings   jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   text
);
create index if not exists catalogue_reviews_status_idx on catalogue_reviews (status, created_at desc);
alter table catalogue_reviews disable row level security;
