# 03Z / 12Z Operational Report Switching, Column Adaptation & Data Separation

Interactive 03Z and 12Z operational report switching across Consolidated and Subdivision-wise reports with an automated 14:00 IST default selection, tailored column sets for morning vs. evening bulletins, unified print preservation, and deterministic 03Z vs 12Z Maximum Temperature isolation.

---

## 1. Overview & Core Concept

Operational meteorologists at Regional Meteorological Centre, Nagpur generate reports twice daily:
1. **03Z Report (Morning Issue, 0830 IST)**:
   - Header Date Row:
     - Under `Max | 24h Chg | Dep`: `Observed on $yesterday` (e.g. `Observed on 2026-10-27`).
     - Under remaining columns: `Observed on $today` (e.g. `Observed on 2026-10-28`).
   - Max Temperature: Previous Day Afternoon Tmax (`tmax03Z` / `tmaxPreviousDay` from 03Z Section 333 Group 1 `1sTxTxTx`).
   - Min Temperature: Current Day Morning Tmin (`tmin` from 03Z Section 333 Group 2 `2sTnTnTn`).
   - Humidity: 0830 IST Relative Humidity.
   - Rainfall: 24-hr Rainfall up to 0830 IST.
   - Visibility: 0830 IST Visibility (toggleable).
   - 1730 IST columns (`rh1730`, `rainfall1730`) are completely hidden.

2. **12Z Report (Evening Issue, 1730 IST)**:
   - Header Date Row:
     - Under `Max | 24h Chg | Dep`: `Observed on $today` (e.g. `Observed on 2026-10-28`).
     - Under remaining columns: `Observed on $today` (e.g. `Observed on 2026-10-28`).
   - Max Temperature: Current Day Afternoon Tmax (`tmax12Z` from 12Z Section 333 Group 1 `1sTxTxTx`).
   - Min Temperature: Current Day Morning Tmin (carried from 03Z bulletin).
   - Humidity: Both 0830 IST and 1730 IST Relative Humidity.
   - Rainfall: Both 0830 IST (24-hr) and 1730 IST (past 9-hr).
   - Visibility: 1730 IST Visibility (toggleable).

---

## 2. 03Z vs 12Z Maximum Temperature Data Separation

### Root Cause Analysis
Previously, `PersistedStationObservation.tmax` held a single scalar value:
- When 03Z was ingested, `tmax` was set to `tmaxPreviousDay` (from yesterday).
- When 12Z was ingested, `tmax` was overwritten with today's afternoon max temp.
- In `reportOrchestrator.ts`, both 03Z and 12Z report generation read `persisted?.tmax`, causing both reports to display the same value once 12Z was ingested or if only 03Z was ingested.

### Resolution
1. **Explicit Storage Keys**:
   - `tmax03Z?: number | null`: Stores yesterday's maximum temperature explicitly parsed from 03Z telegrams.
   - `tmax12Z?: number | null`: Stores today's maximum temperature explicitly parsed from 12Z telegrams.
   - `supabaseClient.ts` synchronizes `tmax_previous_day` with `tmax03Z` and `tmax` (with `tmax_slot = '12Z'`) with `tmax12Z`.
2. **Slot-Isolated Resolution in Report Orchestrator**:
   - At `utcSlot === '03Z'`:
     `rawTmax` strictly reads `persisted.tmax03Z ?? persisted.tmaxPreviousDay ?? prevEveningObs?.tmax12Z ?? prevEveningObs?.tmax`. It never allows today's 12Z data to leak into 03Z reports.
     Departure is calculated using yesterday's pentad (`eveningDateStr`).
     24-hour change compares yesterday's max temp with day before yesterday (`dateEveningPriorStr`).
   - At `utcSlot === '12Z'`:
     `rawTmax` strictly reads `persisted.tmax12Z ?? (persisted.tmaxSlot === '12Z' ? persisted.tmax : null)`. If 12Z has not been observed yet, it yields `null` (never falls back to yesterday's 03Z value).
     Departure is calculated using today's pentad (`reportingDateStr`).
     24-hour change compares today's max temp with yesterday (`eveningDateStr`).
3. **Date Row Cell Adaptation**:
   - In `Report1StationTable.tsx` and `Report3SubdivisionView.tsx`:
     `<th colSpan={3} className="header-date-cell">Observed on {is03Z ? yesterdayDate : todayDate}</th>`
     `<th colSpan={...} className="header-date-cell">Observed on {todayDate}</th>`
