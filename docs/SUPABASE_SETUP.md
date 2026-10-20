# Supabase PostgreSQL Setup & Deployment Guide for WXOps

This document details the configuration, schema migration, environment variables, and migration instructions required to enable shared multi-device PostgreSQL persistence for WXOps on Vercel.

---

## 1. Architecture Overview

- **Frontend & App Engine**: Hosted on Vercel (React + Vite + TypeScript).
- **Authoritative Data Layer**: Supabase PostgreSQL (`raw_bulletins`, `station_observations`, `historical_observations`, `wxops_metadata`).
- **Access Control**: Server-side Vercel API routes (`/api/observations/*`) validate meteorological workstation HMAC-SHA256 session tokens before reading or writing data.
- **Security Boundary**: The privileged `SUPABASE_SERVICE_ROLE_KEY` is kept exclusively on the server in Vercel environment variables. No database credentials or secrets are exposed in browser bundles or `VITE_` variables. Anonymous direct browser access to PostgreSQL tables is blocked by Row Level Security (RLS).
- **Client Cache**: The browser `localStorage` functions as a local cache/offline buffer. All saves are committed to PostgreSQL, and failures are visibly reported without falsely signaling success.

---

## 2. Supabase Project Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Note your **Project URL** (`https://[project-ref].supabase.co`).
3. Under **Project Settings > API**, retrieve the **`service_role` secret key** (never expose this in frontend code).
4. Open the **SQL Editor** in the Supabase Dashboard and run the migration script:
   `supabase/migrations/20261018000000_create_wxops_observations.sql`

---

## 3. Vercel Environment Variables

In your Vercel Project Dashboard (**Settings > Environment Variables**), set the following variables for **Production** and **Preview**:

| Variable Name | Environment | Description |
|---|---|---|
| `SUPABASE_URL` | Production, Preview | `https://[project-ref].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | Supabase `service_role` secret key (Server-only) |
| `SESSION_SECRET` | Production, Preview | Cryptographically secure random string for HMAC sessions |
| `WXOPS_AMSS_PASSWORD` | Production, Preview | AMSS Nagpur station password (default `imd123`) |
| `WXOPS_RWFC_PASSWORD` | Production, Preview | RWFC Nagpur station password (default `imd123`) |

> **Critical**: Do **NOT** prefix `SUPABASE_SERVICE_ROLE_KEY` with `VITE_`.

---

## 4. Database Schema Summary

The migration provisions:

1. **`raw_bulletins`**:
   - `reporting_date DATE NOT NULL`
   - `utc_slot VARCHAR(5) NOT NULL CHECK (utc_slot IN ('03Z', '12Z'))`
   - `raw_bulletin TEXT NOT NULL`
   - `PRIMARY KEY (reporting_date, utc_slot)`
2. **`station_observations`**:
   - `reporting_date DATE NOT NULL`
   - `station_id VARCHAR(10) NOT NULL`
   - `tmax`, `tmin`, `tmax_previous_day`, `rh0830`, `rh1730`
   - `dry_bulb0830`, `dew_point0830`, `dry_bulb1730`, `dew_point1730`
   - `rainfall0830`, `rainfall1730`, `rainfall`
   - `msl_pressure0830`, `msl_pressure1730`, `visibility_code`
   - `manual_edits JSONB DEFAULT '{}'::jsonb`
   - `has03z BOOLEAN`, `has12z BOOLEAN`
   - `PRIMARY KEY (reporting_date, station_id)`
3. **`historical_observations`**:
   - Daily baseline snapshots for 24-hour change comparisons.
   - `PRIMARY KEY (station_id, date)`
4. **`wxops_metadata`**:
   - Configurable retention limits (default 15 days) and operational settings.

---

## 5. Safe Data Migration Workflow

To migrate existing observations from a PC's browser storage into PostgreSQL:

1. Log into WXOps as **AMSS Nagpur** or **RWFC Nagpur**.
2. Open the **Hamburger Menu > Shared Database & Migration**.
3. Click **"Download Pre-Migration Safety Backup"** to save a JSON/CSV snapshot to your local computer.
4. Click **"Migrate Local Archive to PostgreSQL"**.
5. The server validates the records, applies non-destructive merge policies, commits to PostgreSQL, and reports:
   - Total dates migrated
   - Total station observations verified
   - Rejected or conflicting records (if any)
6. Open WXOps on a different PC or browser, log in, and verify that the exact same observations and reports appear.
