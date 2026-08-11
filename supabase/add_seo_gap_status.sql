-- Action-tracking for SEO keyword-gap rows. Keyed on brand_id+phrase (not
-- month_key) so a status set once survives the weekly semrush_keyword_gaps
-- resync, even if the phrase's numbers shift or it briefly drops off the list.
create table if not exists seo_gap_status (
  brand_id      int not null,
  phrase        text not null,
  status        text not null default 'open',  -- open | in_progress | done
  updated_by    text,
  updated_at    timestamptz default now(),
  primary key (brand_id, phrase)
);
alter table seo_gap_status disable row level security;
