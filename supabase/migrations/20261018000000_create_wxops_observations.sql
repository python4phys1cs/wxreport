-- WXOps PostgreSQL Schema Migration for Supabase
-- Operational Meteorological Observations & Shared Storage

-- 1. Raw Bulletins Table (Preserves raw SYNOP telegrams for audit and reprocessing)
CREATE TABLE IF NOT EXISTS raw_bulletins (
  reporting_date DATE NOT NULL,
  utc_slot VARCHAR(5) NOT NULL CHECK (utc_slot IN ('03Z', '12Z')),
  raw_bulletin TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reporting_date, utc_slot)
);

-- Index for date queries
CREATE INDEX IF NOT EXISTS idx_raw_bulletins_date ON raw_bulletins (reporting_date DESC);

-- 2. Station Observations Table (Authoritative 15-day operational store)
CREATE TABLE IF NOT EXISTS station_observations (
  reporting_date DATE NOT NULL,
  station_id VARCHAR(10) NOT NULL,
  station_name VARCHAR(100),
  tmax NUMERIC(4, 1),
  tmax_date DATE,
  tmax_slot VARCHAR(5),
  tmin NUMERIC(4, 1),
  tmin_date DATE,
  tmin_slot VARCHAR(5),
  tmax_previous_day NUMERIC(4, 1),
  rh0830 INTEGER,
  rh1730 INTEGER,
  dry_bulb0830 NUMERIC(4, 1),
  dew_point0830 NUMERIC(4, 1),
  dry_bulb1730 NUMERIC(4, 1),
  dew_point1730 NUMERIC(4, 1),
  rainfall0830 NUMERIC(5, 1),
  rainfall1730 NUMERIC(5, 1),
  rainfall NUMERIC(5, 1),
  msl_pressure0830 NUMERIC(6, 1),
  msl_pressure1730 NUMERIC(6, 1),
  visibility_code VARCHAR(10),
  last_updated_slot VARCHAR(5),
  last_updated_date DATE,
  raw_synop TEXT,
  raw_synop03z TEXT,
  raw_synop12z TEXT,
  manual_edits JSONB DEFAULT '{}'::jsonb,
  has03z BOOLEAN NOT NULL DEFAULT FALSE,
  has12z BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reporting_date, station_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_station_observations_date ON station_observations (reporting_date DESC);
CREATE INDEX IF NOT EXISTS idx_station_observations_station ON station_observations (station_id);

-- 3. Historical Daily Snapshots (For baseline comparisons and prior 24h calculations)
CREATE TABLE IF NOT EXISTS historical_observations (
  station_id VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  tmax NUMERIC(4, 1),
  tmin NUMERIC(4, 1),
  rainfall NUMERIC(5, 1),
  rh0830 INTEGER,
  rh1730 INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, date)
);

CREATE INDEX IF NOT EXISTS idx_historical_observations_date ON historical_observations (date DESC);

-- 4. WXOps Operational Settings & Metadata
CREATE TABLE IF NOT EXISTS wxops_metadata (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default retention limit if not present
INSERT INTO wxops_metadata (key, value)
VALUES ('retention_limit', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Row Level Security (RLS) Setup
ALTER TABLE raw_bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wxops_metadata ENABLE ROW LEVEL SECURITY;

-- Note: The Vercel server-side API routes connect using the Supabase Service Role Key,
-- which bypasses RLS securely on the server.
-- Anonymous / client-side browser direct access is blocked by default,
-- guaranteeing that privileged credentials never touch the browser.
