-- ============================================================================
-- COOLKIDZ BRIEFING ENGINE · Supabase schema
-- Adapted for this dashboard: the brand profiles live in their OWN table
-- (brand_profiles) so the existing Shopify-synced `brands` table is untouched.
-- briefs snapshot mandatory / exclusions / compliance_flags at generation time
-- as the audit trail.
-- ============================================================================
create extension if not exists "pgcrypto";

create table if not exists brand_profiles (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  tier        text not null check (tier in ('A','B','C')),
  active      boolean not null default true,
  profile     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists briefs (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brand_profiles(id) on delete restrict,
  title            text not null,
  moment           text not null,
  pillar           text not null,
  channels         text[] not null default '{}',
  focus            text,
  concept          text,
  key_message      text,
  audience_note    text,
  deliverables     jsonb not null default '[]',
  mandatory        jsonb not null default '[]',
  exclusions       jsonb not null default '[]',
  compliance_flags jsonb not null default '[]',
  compliance_cleared boolean not null default false,
  owner            text,
  due_date         date,
  status           text not null default 'draft'
                     check (status in ('draft','approved','pushed','archived')),
  asana_task_gid   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists briefs_brand_idx  on briefs(brand_id);
create index if not exists briefs_status_idx on briefs(status);
create index if not exists briefs_due_idx    on briefs(due_date);

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists briefs_touch on briefs;
create trigger briefs_touch before update on briefs
  for each row execute function touch_updated_at();

drop trigger if exists brand_profiles_touch on brand_profiles;
create trigger brand_profiles_touch before update on brand_profiles
  for each row execute function touch_updated_at();

-- SEED: Nanit
insert into brand_profiles (slug, name, tier, profile) values
('nanit', 'Nanit', 'A', '{
  "essence": "Insight. Reassurance. Better sleep.",
  "brandLine": "Parenthood looks different here",
  "positioning": "A premium, app-connected baby monitoring and sleep system that uses advanced computer vision and data-driven insights to help parents understand sleep, support healthy routines and feel confident every step of the way.",
  "hero": "Nanit Pro Camera, positioned as the default recommended configuration",
  "audience": {
    "primary": "Modern, tech-confident parent, 28 to 40, metro and inner-suburban, research-driven and digitally fluent.",
    "split": "Women skew to discovery, men skew to conversion. Balance emotional reassurance with clear, practical explanation."
  },
  "pillars": [
    {"id":"insight","name":"See What They Cant Tell You","desc":"Insight. Real-world examples and parent-led explanation of patterns and behaviours."},
    {"id":"sleep","name":"Sleep, Understood","desc":"Sleep science made simple. Routines, regressions, development. A trusted guide without overwhelm."},
    {"id":"peace","name":"Peace of Mind, Night After Night","desc":"Emotional reassurance and calm confidence, never fear or constant alerts."},
    {"id":"modern","name":"Designed for Modern Parenting","desc":"Nanit in real Australian homes. Intuitive design, ease of use, seamless integration."}
  ],
  "moments": [
    {"id":"intro","name":"Brand Introduction & Newborn Preparation","pillar":"sleep","objective":"Education and foundation-building","focus":"What makes Nanit different, sleep basics, set-up before baby arrives, retailer education, PBC Expo presence."},
    {"id":"firstnights","name":"First Nights at Home & Early Reassurance","pillar":"peace","objective":"Trust-building through reassurance","focus":"Newborn routines, early sleep patterns, breathing monitoring explained simply, parent-led stories."},
    {"id":"regressions","name":"Sleep Regressions & Insight Moments","pillar":"insight","objective":"Demonstrate value when parents are problem-solving","focus":"Patterns and regressions, trends versus one bad night, insight-led explanations, expert commentary."},
    {"id":"registry","name":"Registries, Gifting & Long-Term Value","pillar":"modern","objective":"Position as a premium long-term investment","focus":"Registry education, gifting, lifestyle integration, the one decision you will not outgrow."},
    {"id":"alwayson","name":"Always-On","pillar":"insight","objective":"Consistency and conversion support","focus":"PDP optimisation, retail-aligned FAQs and objection handling, creator repurposing, store locator and retail conversion."}
  ],
  "channels": [
    {"id":"social","name":"Social (organic)","presets":"IG/FB feed 1080x1350, Story/Reel 1080x1920, carousel up to 10 frames","role":"Education, credibility and storytelling, not volume-led engagement."},
    {"id":"blog","name":"Blog / SEO","presets":"1500-2000 word post, H2/H3 structure, target keyword, internal links, FAQ schema","role":"SEO-led education that ranks and supports PDP and retail conversion."},
    {"id":"paid","name":"Paid media","presets":"Search RSA, paid social 1080x1350 and 1080x1920, video 16:9 and 9:16","role":"Amplify education at high-intent research moments. Consideration, not impulse."},
    {"id":"edm","name":"EDM (Klaviyo)","presets":"600px content width, modular blocks, single primary CTA","role":"Education, nurture and confidence-building. Not promotional."},
    {"id":"pdp","name":"D2C / PDP","presets":"Product page modules, FAQ schema, comparison block, store locator","role":"Central source of truth. Education that drives informed conversion and see-it-in-store."},
    {"id":"affiliate","name":"Affiliate / Influencer","presets":"Long-form review, demonstration, comparison, repurposable cutdowns","role":"Explain the technology through lived experience. Long-term over one-off."},
    {"id":"event","name":"Event / Trade","presets":"POS, shelf talkers, demo unit script, expo stand graphics","role":"Credibility and demonstration. PBC Expo, One Fine Baby."}
  ],
  "mandatory": [
    "Hero configuration is the Nanit Pro Camera as the default recommended option.",
    "Local trust signals where relevant: Australian distribution, warranty, customer support.",
    "Plain-language explanation. Translate features into real-world outcomes.",
    "D2C supports retail. Use store locator and see-it-in-store messaging where the moment fits."
  ],
  "exclusions": [
    "No fear-based or alert-anxiety messaging.",
    "No discount-led or price-first framing. Full-price integrity and MAP discipline.",
    "No feature overload without a benefit translation."
  ],
  "standingFlags": [
    {"level":"must","note":"Do not frame breathing or sleep monitoring as a medical device, as life-saving, or as preventing SIDS or any harm. Nanit is a wellness and insight product, not a medical or safety device."},
    {"level":"must","note":"Do not assert regulatory status (ARTG, TGA, FDA) in any asset. If a claim appears to need it, verify before publishing."},
    {"level":"check","note":"Any sleep outcome or efficacy claim must be substantiated or softened to supportive language. Verify the source first."},
    {"level":"check","note":"Comparative claims about CuboAI or Owlet must be truthful and substantiable under Australian Consumer Law. No misleading or knocking copy."},
    {"level":"check","note":"Reassurance language is on-brand, but must not imply the device prevents danger."}
  ]
}')
on conflict (slug) do update set profile = excluded.profile, name = excluded.name, tier = excluded.tier, updated_at = now();
