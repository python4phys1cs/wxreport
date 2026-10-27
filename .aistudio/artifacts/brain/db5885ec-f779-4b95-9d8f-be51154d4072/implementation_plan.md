# 03Z / 12Z Operational Report Switching & Column Adaptation

Introduce interactive 03Z and 12Z operational report switching across Consolidated and Subdivision-wise reports with an automated 14:00 IST default selection, tailored column sets for morning vs. evening bulletins, and unified print preservation.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions were confirmed with the user during Phase 1:
> - **Tab Placement**: Added directly to the Report Toolbar alongside report view tabs for fast, frictionless switching by operational meteorologists.
> - **Column Set in 03Z Mode**: Completely hide 1730 columns (`rh1730`, `rainfall1730`, evening visibility) in 03Z mode to present a clean, uncrowded morning report.
> - **Report Scope**: Applied to the Consolidated Report and Subdivision-wise Report; Weather Summary Report remains strictly a 03Z preparation report as requested.
> - **Default Schedule**: Before 14:00 IST, 03Z report mode is selected by default; at or after 14:00 IST, 12Z report mode is selected by default.

---

## 1. Overview & Core Concept

Operational meteorologists at Regional Meteorological Centre, Nagpur generate reports twice daily:
1. **03Z Report (Morning Issue, 0830 IST)**:
   - Max Temperature: Previous Day Evening Tmax (carried over from previous day)
   - Min Temperature: Current Day Morning Tmin
   - Humidity: 0830 IST Relative Humidity
   - Rainfall: 24-hr Rainfall up to 0830 IST
   - Visibility: 0830 IST Visibility
   - 1730 IST columns (`rh1730`, `rainfall1730`) are completely hidden.
2. **12Z Report (Evening Issue, 1730 IST)**:
   - Max Temperature: Current Day Evening Tmax (from 12Z bulletin)
   - Min Temperature: Current Day Morning Tmin (carried from 03Z bulletin)
   - Humidity: Both 0830 IST and 1730 IST Relative Humidity
   - Rainfall: Both 0830 IST (24-hr) and 1730 IST (past 9-hr)
   - Visibility: 1730 IST Visibility

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Default State on Page Load / Date Change**:
   - The application checks current local IST time.
   - If time is before 14:00 IST, report mode defaults to `03Z`.
   - If time is $\ge$ 14:00 IST, report mode defaults to `12Z`.
2. **Interactive Switching**:
   - The user clicks `03Z` or `12Z` in the segmented control situated in the Report Toolbar.
   - The active report recalculates and re-renders immediately without reloading the page or losing station edits.
3. **Print Output**:
   - The formal print header adapts dynamically:
     - 03Z: `Observation Date: YYYY-MM-DD (0830 IST)`
     - 12Z: `Observation Date: YYYY-MM-DD (1730 IST) | Morning Baseline: (0830 IST)`
   - Print layout strictly adheres to the 2-page A4 rule for Consolidated Report (Vidarbha + West MP + East MP on Page 1, Chhattisgarh on Page 2).

### UI Layout & Controls
```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Entry   [ ◀  26 October 2026  ▶ ] 📅   │  [Consolidated] [Summary] [Vidarbha]   │
│                                                   │  [ 03Z (0830 IST) | 12Z (1730 IST) ]   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Report Slot State vs Input Slot State**:
  - *Chosen Approach*: Maintain a dedicated `reportSlot: '03Z' | '12Z'` state initialized via `getDefaultReportSlot()`.
  - *Why*: Allows forecasters to inspect morning (03Z) and evening (12Z) reports independently of whichever bulletin text happens to be in the input textarea.
- **Decision 2: 03Z Column Adaptation**:
  - *Chosen Approach*: When `reportSlot === '03Z'`, conditionally omit `rh1730` and `rainfall1730` columns and set visibility to 0830 IST. When `reportSlot === '12Z'`, show full dual-period columns.
  - *Why*: Eliminates empty space and confusing empty cells in morning reports, satisfying user's explicit preference.
- **Decision 3: Weather Summary Exemption**:
  - *Chosen Approach*: Exclude the 03Z/12Z toggle when Weather Summary report is active, as Weather Summary is strictly prepared for 03Z.

---

## 4. Technical Architecture & Component Mapping

```
┌──────────────────────────────────────────────────────────────────┐
│                   App.tsx (Main State & Router)                 │
│  - reportSlot: '03Z' | '12Z' (defaulted based on 14:00 IST)      │
│  - minimalActiveReport: 'consolidated' | 'summary' | 'subdivision'│
└───────────────┬─────────────────────────────────┬────────────────┘
                │                                 │
     ┌──────────▼──────────┐           ┌──────────▼──────────┐
     │   ReportToolbar     │           │ Minimal Nav Bar     │
     │  - Report View Tabs │           │  - Report View Tabs │
     │  - 03Z / 12Z Toggle │           │  - 03Z / 12Z Toggle │
     └─────────────────────┘           └─────────────────────┘
                │
     ┌──────────▼────────────────────────────────────────────┐
     │               Report Generation Engine                │
     │  - orchestrateReports(..., { utcSlot: reportSlot })   │
     │  - Resolves correct 03Z vs 12Z Tmax / Tmin baselines  │
     └──────────┬───────────────────────────┬────────────────┘
                │                           │
     ┌──────────▼───────────────┐  ┌────────▼────────────────┐
     │ Report1StationTable.tsx  │  │ Report3SubdivisionView  │
     │ - slot: '03Z' | '12Z'    │  │ - slot: '03Z' | '12Z'   │
     │ - Hides 1730 cols at 03Z │  │ - Hides 1730 cols at 03Z│
     │ - 2-page print partition │  │                         │
     └──────────────────────────┘  └─────────────────────────┘
```

### Component & File Changes
1. **`src/utils/reportTime.ts`**:
   - Add `getDefaultReportSlot(now?: Date): '03Z' | '12Z'` checking $\ge$ 14:00 in `Asia/Kolkata`.
2. **`src/App.tsx`**:
   - Add `reportSlot` state with automatic default at 14:00 IST.
   - Render the `03Z / 12Z` segmented toggle in both minimal toolbar and standard `ReportToolbar` when viewing Consolidated or Subdivision reports.
   - Pass `reportSlot` to `generateDailyReports` and report table components.
3. **`src/components/Report1StationTable.tsx`**:
   - Accept `reportSlot?: '03Z' | '12Z'`.
   - When `reportSlot === '03Z'`, hide 1730 columns, adjust table headers, and adjust `<colgroup>` widths for print.
   - When `reportSlot === '12Z'`, show full dual-slot columns.
4. **`src/components/Report3SubdivisionView.tsx`**:
   - Accept `reportSlot?: '03Z' | '12Z'` and conditionally hide 1730 columns in 03Z mode.
5. **`src/components/ReportToolbar.tsx`**:
   - Render the 03Z / 12Z toggle buttons with active state styling.
6. **`src/styles/reports.css`**:
   - Add segmented control styles for 03Z / 12Z report toggle and print adjustments for 03Z table width.
7. **Regression Tests**:
   - Unit tests for `getDefaultReportSlot` (before 14:00 IST $\to$ 03Z, at/after 14:00 IST $\to$ 12Z).
   - Column visibility assertions for 03Z and 12Z modes.
