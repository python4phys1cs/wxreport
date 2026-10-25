# WXOps Revised Implementation Plan

## Overview
This plan addresses the intermittent 12Z observation update failures, integrates Supabase reliability, and introduces forecaster-centric operational guards:
1. Fix observation store hydration so Supabase sync does not set spurious `manualEdits` flags.
2. Cross-check `AAXX YYGG4` header date (`YY`) and observation cycle (`GG`) against the selected date and slot; halt with error on mismatch.
3. Resubmission overwrite confirmation modal with an expandable details/diff toggle showing existing vs incoming values.
4. SYNOP code syntax & meteorological anomaly highlighting (Tmax/Tmin outliers, departure > 10, 24h change > 10, RH > 100, rainfall > 600 mm) with a settings toggle.
5. Historical date editing guard in settings.
6. Supabase $D_0$ Tmax backfill and regression test coverage.

---

## Detailed Task Breakdown

### Task 1: Fix Observation Store Hydration & `manualEdits` Isolation
- **Files**:
  - `src/engine/observationStore.ts`
  - `src/engine/sharedObservationClient.ts`
  - `src/server/db/supabaseClient.ts`
- **Actions**:
  - Add `setStationObservationFromServer(date, stationId, obs)` in `observationStore.ts` that populates or syncs persisted state from remote storage without touching `manualEdits`.
  - In `sharedObservationClient.ts:loadDateObservations`, replace `updateStationObservation` with `setStationObservationFromServer`.
  - In `supabaseClient.ts:ingestBulletin`, ensure clean field updates when ingesting bulletins so existing records aren't blocked by spurious edits.

### Task 2: AAXX YYGG4 Header Validation & Mismatch Guard
- **Files**:
  - `src/parser/synopDecoder.ts`
  - `src/components/SynopInput.tsx`
  - `src/utils/timeSlot.ts`
- **Actions**:
  - Add `parseSynopHeader(bulletin: string): { day: number | null; hour: number | null; slot: UtcSlot | null; valid: boolean; rawHeader: string | null }`.
  - Cross-check `YY` (day of month) against the day in `reportingDate` (`YYYY-MM-DD`).
  - Cross-check `GG` (hour) against `utcSlot` (`03Z` expects 00–04; `12Z` expects 11–13).
  - If a mismatch is detected, halt submission and display an explicit error alert:
    *"Bulletin header (AAXX [YYGG4]) indicates [slot] on day [YY], which mismatches selected date ([reportingDate]) or slot ([utcSlot]). Please verify date/slot selection or bulletin text."*

### Task 3: Overwrite Confirmation Modal with Expandable Diff Details
- **Files**:
  - `src/components/SynopInput.tsx`
  - `src/components/OverwriteConfirmationModal.tsx`
  - `src/App.tsx`
- **Actions**:
  - Before committing an ingested bulletin, detect if any parsed stations already have confirmed data for that date and slot (`has03Z` or `has12Z`).
  - If existing data exists, prompt the user with a confirmation modal:
    *"Existing observations already recorded for [N] station(s) on [Date] ([Slot]). Overwrite with new data?"*
  - Provide an expandable "Show Overwrite Details" toggle comparing current values vs new incoming values (e.g., Tmax, Tmin, RH, Rainfall, MSLP).
  - On user confirmation, execute the overwrite.

### Task 4: SYNOP Syntax & Anomaly Highlighting with Settings Toggle
- **Files**:
  - `src/components/SynopCodeEditor.tsx`
  - `src/parser/synopValidator.ts`
  - `src/components/HamburgerMenu.tsx`
  - `src/components/SynopInput.tsx`
  - `src/styles/reports.css`
- **Actions**:
  - Build a lightweight syntax highlighter overlay for the SYNOP textarea (color-coding Station IDs, Section 1 temperatures, Section 333 extremes, Section 555 rainfall).
  - Real-time meteorological anomaly detection highlighting:
    - Abnormal Tmax / Tmin (outside Central India limits)
    - RH > 100%
    - Rainfall > 600 mm
    - 24h temperature change > 10°C
    - Pentad departure > 10°C
  - Add a toggle in the settings menu: `Enable SYNOP syntax highlighting in editor` (persisted in localStorage).

### Task 5: Settings Toggle for Editing Historical Dates
- **Files**:
  - `src/components/HamburgerMenu.tsx`
  - `src/components/SynopInput.tsx`
  - `src/App.tsx`
- **Actions**:
  - Add a setting: `Allow editing historical dates` (default: OFF).
  - When OFF and the selected date is older than today in Asia/Kolkata, lock the input with a warning hint: *"Editing historical observations is locked in settings."*

### Task 6: Supabase $D_0$ Tmax Backfill
- **Files**:
  - `src/server/db/supabaseClient.ts`
- **Actions**:
  - When Section 333 has `tmaxPreviousDay` at 03Z, also update `station_observations` for `(previousDate, stationId)` where `tmax` is currently NULL.

### Task 7: Comprehensive Regression Tests & Verification
- **Files**:
  - `src/engine/cycleAndPersistenceSemantics.test.ts`
  - `src/parser/synopDecoder.test.ts`
- **Actions**:
  - Add test for 12Z ingestion after Supabase store rehydration.
  - Add test for `AAXX YYGG4` header date/slot validation and mismatch detection.
  - Add test for anomaly detection and overwrite diffing.
  - Execute `npm test`, `npm run lint`, and `compile_applet`.
