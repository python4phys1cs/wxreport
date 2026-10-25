# Minimal Observation Entry View — Implementation Plan

## Executive Summary
This plan details the addition of an **alternate, ultra-focused Minimal Observation Entry View** to WXOps while keeping the comprehensive **Standard Operational View** as the default.

In accordance with user preferences:
1. **Settings Toggle**: Added inside the Hamburger Menu (`wxops_view_mode`: `'standard' | 'minimal'`, default `'standard'`).
2. **Three Core Elements Only**:
   - **Large Date Selector**: Day of the month in prominent, high-impact bold typography (`24`), month name in quiet small grey text (`October 2026`), left/right chevron arrows stepping $\pm 1$ day, and a calendar icon button invoking custom date selection.
   - **Submit 03Z Button**: Prominent action card/button labeled *"Submit 03Z (0830 IST) observation"* with a subtle status badge (`Recorded` vs `Pending`).
   - **Submit 12Z Button**: Prominent action card/button labeled *"Submit 12Z (1730 IST) observation"* with a subtle status badge (`Recorded` vs `Pending`).
3. **Clean Modal Dialog Overlay**: Clicking either submit button opens a focused modal dialog containing the SYNOP bulletin input, syntax/anomaly highlighter, header mismatch guard, and overwrite confirmation flow for that slot.
4. **Visual & Operational Fidelity**: Adheres to the universal frontend design guidelines and existing workstation themes (Blue, Green, Orange, Red, Grey, Night Duty), avoiding generic AI tropes and maintaining strict operational reliability.

---

## Architecture & Component Design

### 1. Settings Integration (`src/components/HamburgerMenu.tsx`)
- Add a new **Operational View Mode** section in the Settings panel:
  - Radio/segmented selection between **Standard Operational View (Default)** and **Minimal Entry View**.
  - Persisted in browser `localStorage` under `wxops_view_mode`.
  - Propagate `viewMode: 'standard' | 'minimal'` and `onViewModeChange` to `src/App.tsx`.

### 2. Status Detection Engine (`src/utils/observationStatus.ts`)
- Pure utility function that examines the current `observationStore` (and active `reportingDate`) to determine slot readiness:
  - `getSlotObservationStatus(date: string, slot: UtcSlot, store: ObservationStore): { isRecorded: boolean; stationCount: number; lastUpdated?: string }`
  - For `03Z`: checks if any stations have recorded morning parameters (`tmin`, `dryBulb0830`, `rainfall0830`, or `rainfall`).
  - For `12Z`: checks if any stations have recorded evening parameters (`tmax`, `dryBulb1730`, `rainfall1730`, or `rainfall`).
  - Returns subtle, color-blind-safe status metadata (`Recorded` with station count or `Pending`).

### 3. Minimal View Component (`src/components/MinimalInputView.tsx`)
- Created as a dedicated, high-performance operational component:
  - **Container**: Centered, uncluttered operational layout utilizing the active theme's surface tokens.
  - **Element 1 — Date Display & Stepper**:
    - Left chevron button (`◀`) stepping back by 1 day using UTC-safe `shiftDateString(date, -1)`.
    - Central typography lockup:
      - Day number in extra-large, tabular, high-contrast bold font (`text-6xl md:text-7xl font-bold tracking-tight text-slate-900 dark:text-slate-100`).
      - Month & year in subtle, clean grey text (`text-sm font-medium text-slate-500 uppercase tracking-widest`).
    - Right chevron button (`▶`) stepping forward by 1 day using `shiftDateString(date, 1)`.
    - Calendar icon button opening a date picker popover/native date dialog (`input type="date"` with `showPicker()` fallback) for non-adjacent date selection.
  - **Element 2 — 03Z Action Card**:
    - Large tactile action container:
      - Title: *"Submit 03Z (0830 IST) observation"*
      - Subtle status indicator: *"Recorded (18 stations)"* (quiet emerald text) or *"Pending submission"* (quiet amber/slate text).
      - Primary action button or card click trigger to launch the 03Z input modal.
  - **Element 3 — 12Z Action Card**:
    - Large tactile action container:
      - Title: *"Submit 12Z (1730 IST) observation"*
      - Subtle status indicator: *"Recorded (18 stations)"* or *"Pending submission"*.
      - Primary action button or card click trigger to launch the 12Z input modal.

### 4. Clean Modal Dialog Overlay (`src/components/ObservationModal.tsx`)
- Displays an accessible modal dialog (`role="dialog"` with focus trap, Escape key handling, and backdrop scrim):
  - Clean header: Displays slot title (e.g., *"03Z (0830 IST) Observation Entry"* or *"12Z (1730 IST) Observation Entry"*) and the active reporting date.
  - Body: Integrates the proven `SynopInput` workflow with `SynopCodeEditor`, SYNOP syntax highlighting, central India meteorology limits checker, and header validation.
  - Direct actions: "Process & Save Observation" and "Close".
  - On successful processing: Modal closes smoothly, data is persisted locally and to Supabase (if configured), and status badges on the minimal view update immediately.

### 5. App Orchestration (`src/App.tsx`)
- Read initial view mode from `localStorage` (`'standard'` as fallback).
- When `viewMode === 'standard'`:
  - Renders the existing full-suite view (toolbar, date/slot selectors, bulletin textarea, summary bar, and active report tables).
- When `viewMode === 'minimal'`:
  - Renders `MinimalInputView` prominently in the workspace canvas.
  - State (`reportingDate`, `observationStore`, `stationInclusion`, `normalProvider`, etc.) is fully shared, ensuring switching between views is instantaneous with zero data divergence.
  - Opens `ObservationModal` when either 03Z or 12Z submit button is triggered.

---

## Detailed Task Breakdown

| # | Task | Files Affected | Description |
|---|------|----------------|-------------|
| 1 | Create Status Utilities | `src/utils/observationStatus.ts` | Compute 03Z and 12Z submission state (`isRecorded`, `stationCount`) from `observationStore`. |
| 2 | Build `MinimalInputView` | `src/components/MinimalInputView.tsx` | Implement the 3 large elements: large day/month stepper + calendar picker, 03Z button card with status, 12Z button card with status. |
| 3 | Build `ObservationModal` | `src/components/ObservationModal.tsx` | Clean accessible modal dialog wrapping the slot-specific submission flow. |
| 4 | Add Settings Toggle | `src/components/HamburgerMenu.tsx` | Add "View Mode" section with Standard (Default) and Minimal View options. |
| 5 | Wire View Mode in App | `src/App.tsx` | Manage `viewMode` state, synchronize with `localStorage`, render conditional view while preserving all report data. |
| 6 | Style & Theme Tokens | `src/styles/minimal-view.css` (or `reports.css`) | Clean, theme-aware styling honoring font scales, dark/night mode, and WCAG AA contrast. |
| 7 | Unit & Integration Tests | `test/minimalView.test.tsx` | Test date navigation, custom date picker trigger, 03Z/12Z modal trigger, and settings persistence. |

---

## Verification & Testing Plan
1. **Automated Unit & Integration Tests**:
   - `test/minimalView.test.tsx`:
     - Verifies large day number and month format (e.g. `24` and `October 2026`).
     - Verifies backward and forward chevron clicks properly change the date.
     - Verifies calendar picker triggers and updates the selected date.
     - Verifies subtle status badges reflect actual data presence in `observationStore`.
     - Verifies clicking 03Z and 12Z opens the modal dialog with the correct slot set.
     - Verifies switching view mode preserves all shared operational data.
2. **Build & Lint Checks**:
   - Run `npm test` across all test suites to ensure zero regressions (baseline: 380 passed).
   - Run `lint_applet` (`tsc --noEmit`) to verify strict TypeScript adherence.
   - Run `compile_applet` (`npm run build`) to ensure bundle integrity.
3. **Interactive Visual Check**:
   - Test in dev server preview across all themes (Blue, Green, Orange, Red, Grey, Night Duty).
   - Verify modal open/close transitions, keyboard escape handling, and date transitions across month/year boundaries.
