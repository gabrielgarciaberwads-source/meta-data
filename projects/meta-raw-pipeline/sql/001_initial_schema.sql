CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS meta_raw;

CREATE TABLE IF NOT EXISTS meta_raw.collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name text NOT NULL,
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
  period_start date,
  period_end date,
  records_requested integer NOT NULL DEFAULT 0,
  records_received integer NOT NULL DEFAULT 0,
  records_inserted integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS meta_raw.integration_logs (
  id bigserial PRIMARY KEY,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  workflow_name text NOT NULL,
  endpoint text NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCESS', 'WARNING', 'ERROR')),
  http_status integer,
  error_code text,
  error_message text,
  attempt integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS meta_raw.instagram_media (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL,
  instagram_media_id text NOT NULL,
  media_type text,
  media_product_type text,
  caption text,
  permalink text,
  published_at timestamptz,
  username text,
  owner_instagram_id text,
  is_story boolean NOT NULL DEFAULT false,
  is_reel boolean NOT NULL DEFAULT false,
  is_collab boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (account_id, instagram_media_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.instagram_organic_metrics (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL,
  instagram_media_id text NOT NULL,
  metric_name text NOT NULL,
  metric_value_numeric numeric,
  metric_status text NOT NULL DEFAULT 'AVAILABLE' CHECK (metric_status IN ('AVAILABLE', 'UNAVAILABLE', 'INSUFFICIENT_VIEWERS', 'ERROR')),
  metric_scope text NOT NULL DEFAULT 'MEDIA',
  observed_at timestamptz NOT NULL,
  period_start date,
  period_end date,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (account_id, instagram_media_id, metric_name, observed_at)
);

CREATE TABLE IF NOT EXISTS meta_raw.instagram_stories (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL,
  story_id text NOT NULL,
  media_type text,
  permalink text,
  published_at timestamptz,
  expires_at timestamptz,
  story_sequence_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (account_id, story_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.instagram_story_metrics (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL,
  story_id text NOT NULL,
  metric_name text NOT NULL,
  metric_value_numeric numeric,
  metric_status text NOT NULL DEFAULT 'AVAILABLE' CHECK (metric_status IN ('AVAILABLE', 'UNAVAILABLE', 'INSUFFICIENT_VIEWERS', 'ERROR')),
  observed_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (account_id, story_id, metric_name, observed_at)
);

CREATE TABLE IF NOT EXISTS meta_raw.instagram_media_collaborators (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL,
  instagram_media_id text NOT NULL,
  instagram_user_id text NOT NULL,
  username text,
  role text,
  invite_status text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (account_id, instagram_media_id, instagram_user_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.meta_campaigns (
  id bigserial PRIMARY KEY,
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  name text,
  status text,
  objective text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (ad_account_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.meta_adsets (
  id bigserial PRIMARY KEY,
  ad_account_id text NOT NULL,
  adset_id text NOT NULL,
  campaign_id text,
  name text,
  status text,
  optimization_goal text,
  billing_event text,
  start_time timestamptz,
  end_time timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (ad_account_id, adset_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.meta_ads (
  id bigserial PRIMARY KEY,
  ad_account_id text NOT NULL,
  ad_id text NOT NULL,
  adset_id text,
  campaign_id text,
  name text,
  status text,
  creative_id text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (ad_account_id, ad_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.meta_creatives (
  id bigserial PRIMARY KEY,
  ad_account_id text NOT NULL,
  creative_id text NOT NULL,
  object_story_id text,
  effective_object_story_id text,
  instagram_media_id text,
  instagram_permalink text,
  creative_type text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (ad_account_id, creative_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.meta_paid_metrics (
  id bigserial PRIMARY KEY,
  ad_account_id text NOT NULL,
  date_start date NOT NULL,
  date_stop date NOT NULL,
  campaign_id text,
  adset_id text,
  ad_id text,
  creative_id text,
  publisher_platform text,
  platform_position text,
  metric_name text NOT NULL,
  metric_value_numeric numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (ad_account_id, date_start, date_stop, campaign_id, adset_id, ad_id, creative_id, publisher_platform, platform_position, metric_name)
);

CREATE TABLE IF NOT EXISTS meta_raw.content_ad_mapping (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL,
  instagram_media_id text,
  creative_id text,
  ad_id text,
  match_method text,
  match_confidence integer CHECK (match_confidence BETWEEN 0 AND 100),
  match_status text NOT NULL CHECK (match_status IN ('AUTO_MATCHED', 'MANUAL_MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'NOT_APPLICABLE')),
  matched_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collection_run_id uuid REFERENCES meta_raw.collection_runs(id),
  UNIQUE (account_id, creative_id, ad_id)
);

CREATE TABLE IF NOT EXISTS meta_raw.metric_definitions (
  metric_name text PRIMARY KEY,
  source text NOT NULL,
  channel text NOT NULL,
  definition text NOT NULL,
  aggregation_type text NOT NULL CHECK (aggregation_type IN ('ADDITIVE', 'RECALCULATED', 'NON_ADDITIVE', 'UNKNOWN')),
  notes text
);

CREATE INDEX IF NOT EXISTS instagram_media_published_at_idx ON meta_raw.instagram_media (published_at);
CREATE INDEX IF NOT EXISTS organic_metrics_media_observed_idx ON meta_raw.instagram_organic_metrics (instagram_media_id, observed_at);
CREATE INDEX IF NOT EXISTS story_metrics_story_observed_idx ON meta_raw.instagram_story_metrics (story_id, observed_at);
CREATE INDEX IF NOT EXISTS paid_metrics_date_idx ON meta_raw.meta_paid_metrics (ad_account_id, date_start, date_stop);
CREATE INDEX IF NOT EXISTS integration_logs_run_idx ON meta_raw.integration_logs (collection_run_id);
