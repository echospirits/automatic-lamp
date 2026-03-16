CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sku_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  our_sku TEXT NOT NULL,
  competitor_skus JSONB NOT NULL,
  one_to_one_mode BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'annual',
  thresholds JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  month TEXT NOT NULL,
  preset_id UUID NULL REFERENCES sku_presets(id) ON DELETE SET NULL,
  our_sku TEXT NOT NULL,
  competitor_skus JSONB NOT NULL,
  one_to_one_mode BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL,
  thresholds JSONB NOT NULL,
  coverage_blob_url TEXT,
  sales_blob_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  agency_id TEXT NOT NULL,
  store TEXT NOT NULL,
  city TEXT,
  district TEXT,
  inventory NUMERIC NOT NULL DEFAULT 0,
  doh NUMERIC NOT NULL DEFAULT 0,
  placed BOOLEAN NOT NULL DEFAULT FALSE,
  our_retail NUMERIC NOT NULL DEFAULT 0,
  our_wholesale NUMERIC NOT NULL DEFAULT 0,
  craft_avg NUMERIC NOT NULL DEFAULT 0,
  one_to_one_retail NUMERIC NOT NULL DEFAULT 0,
  share NUMERIC NOT NULL DEFAULT 0,
  gap_to_fix NUMERIC,
  segment TEXT,
  bucket TEXT NOT NULL DEFAULT 'none'
);

CREATE INDEX IF NOT EXISTS idx_analysis_results_run_id ON analysis_results(run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_sku ON analysis_runs(our_sku);
