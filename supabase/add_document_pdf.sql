-- PDF support for Partnerships & Affiliates > Documents (previously HTML-only).
alter table documents add column if not exists kind text not null default 'html';
alter table documents add column if not exists file_url text;
alter table documents alter column html drop not null;
