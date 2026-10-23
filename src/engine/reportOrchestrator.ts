/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseSynopBulletin, parse12UtcBulletin, type ParsedStationObservation } from '../parser/synopDecoder.ts';
import {
  enrichObservation,
  getKolkataCalendarDetails,
  getPreviousDayDateString,
  calculateDeparture,
  formatDeparture,
  resolvePentad,
  type EnrichedObservation,
  type PentadNormalProvider,
} from './climatology.ts';
import {
  calculateStationReportRows,
  calculateSubdivisionReportSummary,
  type StationInputData,
  type StationReportRow,
  type SubdivisionReportSummary,
} from './reportCalculations.ts';
import {
  getStation,
  getStationsBySubdivision,
  getSubdivision,
  SUBDIVISIONS,
  type StationMetadata,
  type SubdivisionMetadata,
} from '../constants/stationRegistry.ts';
import { DEFAULT_DISABLED_STATION_IDS } from '../utils/stationInclusion.ts';
import type { ObservationStore, UtcSlot, PersistedStationObservation } from './observationStore.ts';

/**
 * Resolves the pentad for Tmax departure calculations.
 *
 * Legacy PHP logic (from observations_include_fast.php):
 * - Tmax shown in the report comes from the *previous* evening date (De1).
 * - At 03Z: Tmax is D0's evening max, so pentad should be resolved from D0.
 * - At 12Z: Tmax is D1's evening max, so pentad should be resolved from D1 (reportingDateStr).
 *
 * The pentad for Tmin always uses reportingDateStr (D1's morning observation).
 */
function resolveTmaxPentad(reportingDateStr: string, eveningDateStr: string, utcSlot: UtcSlot): string {
  // At 03Z, Tmax comes from previous day (eveningDateStr = D0)
  // At 12Z, Tmax comes from current day (reportingDateStr = D1)
  const tmaxBaseDate = utcSlot === '03Z' ? eveningDateStr : reportingDateStr;
  return resolvePentad(tmaxBaseDate, 'tmax');
}

/**
 * Determines whether Tmax should be available for display in the report.
 *
 * At 03Z: Tmax is available from the previous-day evening observation (Section 333),
 * which is persisted in `persisted.tmax` with `tmaxSlot='03Z'`. This should be shown
 * (matching legacy PHP $r4 query against ob_dt_e=$De1).
 *
 * At 12Z: Tmax becomes available from the current-day 12Z bulletin (Section 333).
 */
function isTmaxDisplayable(utcSlot: UtcSlot, persisted: PersistedStationObservation | null | undefined): boolean {
  if (!persisted) {
    // Stateless path: at 03Z, Tmax comes from Section 333 in the 03Z bulletin
    // (tmaxPreviousDay), which is parsed by enrichObservation and available immediately
    // At 12Z, Tmax comes from the 12Z Section 333
    return true;
  }
  // At 03Z, Tmax is available if it was set from previous day's evening observation
  // (tmaxSlot = '03Z' means it came from Section 333 of 03Z bulletin)
  // or if it has been manually edited
  const has12ZData = Boolean(
    persisted.has12Z ||
    persisted.tmaxSlot === '12Z' ||
    persisted.manualEdits?.tmax
  );
  if (utcSlot === '12Z') return true;
  // At 03Z: show Tmax if it came from Section 333 (tmaxSlot='03Z') or was carried over,
  // or if 12Z data already exists for this reporting date
  return has12ZData || (persisted.tmax !== null && persisted.tmax !== undefined) || Boolean(persisted.manualEdits?.tmax);
}

/**
 * Resolves the prior-day Tmax value for 24-hour change calculations.
 *
 * Legacy PHP logic (observations_include_fast.php):
 *   $tmax_ch = round($r4['tmax'] - $r6['tmax'], 1)
 * where $r4 = evening obs (De1), $r6 = evening obs two days prior (De2).
 *
 * At 03Z on D1: Tmax from D0 evening (De1=D0), prior = D-1 evening (De2=D-1)
 * At 12Z on D1: Tmax from D1 evening (De1=D1), prior = D0 evening (De2=D0)
 *
 * In the React store:
 *   - eveningDateStr = D0 (one day before D1)
 *   - dateEveningPriorStr = D-1 (two days before D1)
 *
 * So:
 *   - At 03Z: prior Tmax is in histDe2 (D-1 evening) — correct per legacy De2
 *   - At 12Z: prior Tmax is in histDm2 (D0 morning, which also has D0's Tmax) — correct per legacy De1
 */
function resolveTmax24hPrior(
  utcSlot: UtcSlot,
  currentTmax: number | null,
  histDm2: HistoricalObservation | null | undefined,
  histDe2: HistoricalObservation | null | undefined
): number | null {
  if (currentTmax === null) return null;
  // Legacy PHP: $tmax_ch = round($r4['tmax'] - $r6['tmax'], 1)
  // where $r4 = evening obs from $De1, $r6 = evening obs from $De2 ($De1 - 1 day)
  //
  // At 03Z on D1:
  //   $De1 = D0, $De2 = D-1
  //   Current Tmax (from Section 333) = D0's evening max
  //   Prior Tmax = D-1's evening max → histDe2 (dateEveningPriorStr)
  //   Fallback: histDm2 (eveningDateStr/D0) if De2 data missing
  //
  // At 12Z on D1:
  //   $De1 = D1, $De2 = D0
  //   Current Tmax (from 12Z Section 333) = D1's evening max
  //   Prior Tmax = D0's evening max → histDm2 (eveningDateStr)
  //   Fallback: histDe2 (dateEveningPriorStr/D-1) if D0 data missing
  if (utcSlot === '03Z') {
    return histDe2?.tmax ?? histDm2?.tmax ?? null;
  } else {
    return histDm2?.tmax ?? histDe2?.tmax ?? null;
  }
}

/**
 * Historical baseline observation contract for 24-hour comparisons.
 */
export interface HistoricalObservation {
  stationId: string;
  date: string; // YYYY-MM-DD
  tmin?: number | null;
  tmax?: number | null;
  rainfall?: number | null;
  rainfall0830?: number | null;
  rainfall1730?: number | null;
  rh0830?: number | null;
  rh1730?: number | null;
}

/**
 * Provider interface for retrieving historical observations.
 */
export interface HistoricalObservationProvider {
  getObservation(stationId: string, date: string): HistoricalObservation | null;
}

/**
 * Report data package for a single meteorological subdivision.
 */
export interface SubdivisionReportData {
  subdivision: SubdivisionMetadata;
  report1Rows: StationReportRow[];
  report2Summary: SubdivisionReportSummary;
  reportingStationsCount: number;
  stationInputs?: StationInputData[];
}

/**
 * Top-level operational reports result object.
 */
export interface OperationalReportsResult {
  /** Reporting date (morning observation date D, YYYY-MM-DD) */
  reportingDate: string;
  /** Evening date for previous-day Tmax (D - 1, YYYY-MM-DD) */
  eveningDate: string;
  /** Enriched observations decoded from SYNOP */
  enrichedObservations: EnrichedObservation[];
  /** Subdivisions included in the report */
  subdivisions: SubdivisionReportData[];
  /** Unrecognized station IDs parsed from bulletin */
  unrecognizedStationIds: string[];
  /** Station codes excluded from reports (e.g. Ashoknagar) */
  excludedStationIds?: string[];
  /** Original raw bulletin for traceability */
  rawBulletin: string;
  /** Operational UTC slot for this report run */
  utcSlot?: UtcSlot;
}

/**
 * Default operational subdivisions for RMC Nagpur daily reports:
 * 19: West MP, 20: East MP, 26: Vidarbha, 27: Chattisgarh
 */
export const DEFAULT_REPORT_SUBDIVISION_IDS: readonly string[] = Object.freeze([
  '19', '20', '26', '27'
]);

/**
 * All 7 meteorological subdivisions covered across canonical registry:
 * 19: West MP, 20: East MP, 26: Vidarbha, 27: Chattisgarh,
 * 25: Marathwada, 24: Madhya Maharashtra, 23: Konkan & Goa
 */
export const ALL_SUBDIVISION_IDS: readonly string[] = Object.freeze([
  '19', '20', '26', '27', '25', '24', '23'
]);

/**
 * Options for report orchestration.
 */
export interface OrchestratorOptions {
  /** Target subdivision IDs to generate reports for (defaults to 19, 20, 26, 27) */
  subdivisionIds?: readonly (string | number)[];
  /** Station ordering variant: 'web' (default) or 'print' (reordered Vidarbha) */
  orderVariant?: 'web' | 'print';
  /** Active UTC slot ('03Z' | '12Z') */
  utcSlot?: UtcSlot;
  /** In-memory or persistent observation store */
  observationStore?: ObservationStore;
  /** If true, treats the bulletin as a station revision (updates only included stations) */
  isRevision?: boolean;
  /** Station codes to exclude from report outputs (display, rows, extremes, summaries) */
  excludedStationIds?: readonly string[] | Set<string>;
}

/**
 * Primary Report Data Orchestration Pipeline:
 *
 * Raw SYNOP text (or Persistent Store)
 *   ↓
 * SYNOP extraction/decoding
 *   ↓
 * Persistent state update
 *   ↓
 * Climatological enrichment
 *   ↓
 * Merge with historical comparison data
 *   ↓
 * Station-level Report 1 calculations
 *   ↓
 * Subdivision-level Report 2 calculations
 *   ↓
 * Structured report data
 */
export function generateDailyReports(
  rawSynopText: string,
  reportingDate: Date | string,
  normalProvider?: PentadNormalProvider,
  historicalProvider?: HistoricalObservationProvider,
  options: OrchestratorOptions = {}
): OperationalReportsResult {
  // 1. Resolve calendar dates
  const { dateStr: reportingDateStr, month } = getKolkataCalendarDetails(reportingDate);
  const eveningDateStr = getPreviousDayDateString(reportingDateStr);
  const dateEveningPriorStr = getPreviousDayDateString(eveningDateStr);
  const utcSlot: UtcSlot = options.utcSlot ?? '03Z';

  // 2. Ingest into persistent store if provided
  if (options.observationStore && rawSynopText && rawSynopText.trim()) {
    if (options.isRevision) {
      options.observationStore.ingestRevisedBulletin(utcSlot, rawSynopText, reportingDateStr);
    } else {
      options.observationStore.ingestBulletin(utcSlot, rawSynopText, reportingDateStr);
    }
  }

  // 3. Resolve pentads for departure calculations
  const pentadTmin = resolvePentad(reportingDateStr, 'tmin');
  const pentadTmax = resolvePentad(reportingDateStr, 'tmax');

  let enrichedObservations: EnrichedObservation[] = [];
  const enrichedByStationId = new Map<string, EnrichedObservation>();
  const unrecognizedStationIds: string[] = [];

  if (options.observationStore) {
    const allPersisted = options.observationStore.getAllObservations(reportingDateStr);
    for (const [stnId, persisted] of allPersisted.entries()) {
      const normalTmin = normalProvider?.getNormal(stnId, pentadTmin);
      const normalTmax = normalProvider?.getNormal(stnId, resolveTmaxPentad(reportingDateStr, eveningDateStr, utcSlot));

      let tminDep: string | null = null;
      if (persisted.tmin !== null && persisted.tmin !== undefined && !isNaN(persisted.tmin)) {
        tminDep =
          normalTmin?.tmin !== null && normalTmin?.tmin !== undefined
            ? formatDeparture(calculateDeparture(persisted.tmin, normalTmin.tmin))
            : '---';
      }

      const has12ZAvailable = Boolean(
        persisted.has12Z ||
        persisted.tmaxSlot === '12Z' ||
        persisted.manualEdits?.tmax
      );
      const isTmaxAvailable = isTmaxDisplayable(utcSlot, persisted);
      const effectiveTmax = isTmaxAvailable ? persisted.tmax : null;

      let tmaxDep: string | null = null;
      if (effectiveTmax !== null && effectiveTmax !== undefined && !isNaN(effectiveTmax)) {
        const normalTmaxForDep = normalProvider?.getNormal(stnId, resolveTmaxPentad(reportingDateStr, eveningDateStr, utcSlot));
        tmaxDep =
          normalTmaxForDep?.tmax !== null && normalTmaxForDep?.tmax !== undefined
            ? formatDeparture(calculateDeparture(effectiveTmax, normalTmaxForDep.tmax))
            : '---';
      }

      const effectiveRh1730 = (utcSlot === '12Z' || has12ZAvailable || persisted.manualEdits?.rh1730)
        ? (persisted.rh1730 ?? null)
        : null;

      const effectiveRainfall1730 = (utcSlot === '12Z' || has12ZAvailable || persisted.manualEdits?.rainfall1730)
        ? (persisted.rainfall1730 ?? null)
        : null;

      const enriched: EnrichedObservation = {
        stationId: stnId,
        dateMorning: reportingDateStr,
        dateEvening: eveningDateStr,
        tmin: persisted.tmin,
        tminDeparture: tminDep,
        tmax: effectiveTmax,
        tmaxDeparture: tmaxDep,
        dryBulb: persisted.dryBulb0830 ?? (utcSlot === '12Z' ? persisted.dryBulb1730 : null) ?? null,
        dewPoint: persisted.dewPoint0830 ?? (utcSlot === '12Z' ? persisted.dewPoint1730 : null) ?? null,
        relativeHumidity: utcSlot === '12Z' ? (effectiveRh1730 ?? persisted.rh0830) : persisted.rh0830,
        visibilityCode: persisted.visibilityCode,
        rainfall: utcSlot === '12Z'
          ? (effectiveRainfall1730 ?? persisted.rainfall0830 ?? persisted.rainfall)
          : (persisted.rainfall0830 ?? persisted.rainfall),
        mslPressure: persisted.mslPressure0830 ?? (utcSlot === '12Z' ? persisted.mslPressure1730 : null) ?? null,
        rawSynop: persisted.rawSynop03Z ?? persisted.rawSynop12Z,
      };

      enrichedObservations.push(enriched);
      enrichedByStationId.set(stnId, enriched);

      if (!getStation(stnId) && !unrecognizedStationIds.includes(stnId)) {
        unrecognizedStationIds.push(stnId);
      }
    }
  } else {
    // Direct stateless decoding (backward compatibility for isolated test suites)
    if (utcSlot === '12Z') {
      const parsed12 = parse12UtcBulletin(rawSynopText);
      enrichedObservations = parsed12.map((parsed) => {
        const normalTmax = normalProvider?.getNormal(parsed.stationId, pentadTmax);
        let tmaxDep: string | null = null;
        if (parsed.tmax !== null && parsed.tmax !== undefined && !isNaN(parsed.tmax)) {
          tmaxDep = normalTmax?.tmax !== null && normalTmax?.tmax !== undefined
            ? formatDeparture(calculateDeparture(parsed.tmax, normalTmax.tmax))
            : '---';
        }

        return {
          stationId: parsed.stationId,
          dateMorning: reportingDateStr,
          dateEvening: eveningDateStr,
          tmin: null,
          tminDeparture: null,
          tmax: parsed.tmax ?? null,
          tmaxDeparture: tmaxDep,
          dryBulb: parsed.dryBulb ?? null,
          dewPoint: parsed.dewPoint ?? null,
          relativeHumidity: parsed.relativeHumidity ?? null,
          visibilityCode: parsed.visibilityCode ?? null,
          rainfall: parsed.rainfall ?? null,
          mslPressure: parsed.mslPressure ?? null,
          rawSynop: parsed.rawSynop,
        };
      });
    } else {
      const parsedObservations: ParsedStationObservation[] = parseSynopBulletin(rawSynopText);
      enrichedObservations = parsedObservations.map((parsed) =>
        enrichObservation(parsed, reportingDateStr, normalProvider)
      );
    }

    for (const obs of enrichedObservations) {
      enrichedByStationId.set(obs.stationId, obs);
      if (!getStation(obs.stationId) && !unrecognizedStationIds.includes(obs.stationId)) {
        unrecognizedStationIds.push(obs.stationId);
      }
    }
  }

  // 4. Determine target subdivisions and exclusions
  const targetSubdivisionIds = (options.subdivisionIds ?? DEFAULT_REPORT_SUBDIVISION_IDS).map(String);
  const orderVariant = options.orderVariant ?? 'web';
  const excludedSet = options.excludedStationIds instanceof Set
    ? options.excludedStationIds
    : new Set(options.excludedStationIds ?? []);

  const subdivisionResults: SubdivisionReportData[] = [];

  for (const subId of targetSubdivisionIds) {
    const subdivision = getSubdivision(subId);
    if (!subdivision) continue;

    const fullStationList: readonly StationMetadata[] = getStationsBySubdivision(subId, orderVariant);
    const stationList: readonly StationMetadata[] = excludedSet.size > 0
      ? fullStationList.filter((stn) => !excludedSet.has(stn.id))
      : fullStationList;

    // Prepare station input data merged with historical baseline and persistent store
    const stationInputs: StationInputData[] = stationList.map((stnMeta) => {
      const enriched = enrichedByStationId.get(stnMeta.id);
      const persisted = options.observationStore?.getStationObservation(stnMeta.id, reportingDateStr);

      // Prior 24h values:
      const histDm2 =
        options.observationStore?.getHistoricalObservation(stnMeta.id, eveningDateStr) ??
        historicalProvider?.getObservation(stnMeta.id, eveningDateStr);
      const histDe2 =
        options.observationStore?.getHistoricalObservation(stnMeta.id, dateEveningPriorStr) ??
        historicalProvider?.getObservation(stnMeta.id, dateEveningPriorStr);

      const isTmaxAvailable = isTmaxDisplayable(utcSlot, persisted);
      const currentTmax = isTmaxAvailable ? (persisted ? persisted.tmax : (enriched?.tmax ?? null)) : null;

      const has12ZAvailable = Boolean(
        persisted?.has12Z ||
        persisted?.tmaxSlot === '12Z' ||
        persisted?.manualEdits?.tmax
      );

      // 24-hour Tmax change: compares current Tmax with the prior evening's Tmax.
      // Legacy PHP: $tmax_ch = round($r4['tmax'] - $r6['tmax'], 1)
      // At 03Z: current Tmax is D0 (eveningDateStr), prior is D-1 (dateEveningPriorStr) → histDe2
      // At 12Z: current Tmax is D1 (reportingDateStr), prior is D0 (eveningDateStr) → histDm2
      const tmax24hPrior = resolveTmax24hPrior(utcSlot, currentTmax, histDm2, histDe2);
      const tmaxDepartureStr = currentTmax !== null ? (enriched?.tmaxDeparture ?? null) : null;

      // Minimum Temperature: D1's 03Z observation
      const currentTmin = persisted ? persisted.tmin : (enriched?.tmin ?? null);
      // 24-hour Tmin change: compares current minimum with D0's 03Z minimum. If either is unavailable, null.
      const tmin24hPrior = currentTmin !== null ? (histDm2?.tmin ?? null) : null;
      const tminDepartureStr = currentTmin !== null ? (enriched?.tminDeparture ?? null) : null;

      // RH at 0830 IST: Use D1's 03Z RH
      const rh0830 = persisted ? persisted.rh0830 : (utcSlot === '03Z' ? (enriched?.relativeHumidity ?? null) : null);

      // RH at 1730 IST: Show blank/--- when D1's 12Z observation is unavailable. Never substitute D0's evening RH!
      const rh1730 = (utcSlot === '12Z' || has12ZAvailable || persisted?.manualEdits?.rh1730)
        ? (persisted ? (persisted.rh1730 ?? null) : (utcSlot === '12Z' ? (enriched?.relativeHumidity ?? null) : null))
        : null;

      // Rainfall:
      // Last 24 Hours up to 0830 hrs IST: Use D1's 03Z rainfall
      const rainfall0830 = persisted
        ? (persisted.rainfall0830 ?? (persisted.has03Z ? (persisted.rainfall ?? null) : null))
        : (utcSlot === '12Z' ? null : (enriched?.rainfall ?? null));

      // Last 9 Hours up to 1730 hrs IST: Show blank/--- until D1's 12Z rainfall is available
      const rainfall1730 = (utcSlot === '12Z' || has12ZAvailable || persisted?.manualEdits?.rainfall1730)
        ? (persisted ? (persisted.rainfall1730 ?? null) : (utcSlot === '12Z' ? (enriched?.rainfall ?? null) : null))
        : null;

      const activeRainfall = (utcSlot === '12Z')
        ? (rainfall1730 ?? rainfall0830 ?? null)
        : (rainfall0830 ?? null);

      return {
        stationId: stnMeta.id,
        stationName: stnMeta.name,
        tmax: currentTmax,
        tmax24hPrior,
        tmaxDepartureStr,
        tmin: currentTmin,
        tmin24hPrior,
        tminDepartureStr,
        rh0830,
        rh1730,
        visibilityCode: persisted?.visibilityCode ?? enriched?.visibilityCode ?? null,
        rainfall: activeRainfall,
        rainfall0830,
        rainfall1730,
        manualEdits: persisted?.manualEdits,
      };
    });

    // 5. Generate Report 1 station rows
    const report1Rows: StationReportRow[] = calculateStationReportRows(stationInputs);

    // 6. Generate Report 2 subdivision summary
    const report2Summary: SubdivisionReportSummary = calculateSubdivisionReportSummary(
      subdivision.id,
      subdivision.name,
      stationInputs,
      month
    );

    const reportingCount = stationInputs.filter(
      (s) =>
        s.tmin !== null ||
        s.tmax !== null ||
        s.rainfall !== null ||
        s.rh0830 !== null ||
        s.rh1730 !== null ||
        enrichedByStationId.has(s.stationId)
    ).length;

    subdivisionResults.push({
      subdivision,
      report1Rows,
      report2Summary,
      reportingStationsCount: reportingCount,
      stationInputs,
    });
  }

  return {
    reportingDate: reportingDateStr,
    eveningDate: eveningDateStr,
    enrichedObservations,
    subdivisions: subdivisionResults,
    unrecognizedStationIds,
    excludedStationIds: Array.from(excludedSet),
    rawBulletin: rawSynopText,
    utcSlot,
  };
}

/**
 * Recalculates operational report results after manual observation edits.
 * Updates station rows, departures, 24-hour changes, extremes, and subdivision summaries
 * using the exact canonical calculation engine.
 */
export function recalculateReportsResult(
  currentResult: OperationalReportsResult,
  stationEdits: Record<string, Partial<StationInputData>>,
  normalProvider?: PentadNormalProvider
): OperationalReportsResult {
  const { month } = getKolkataCalendarDetails(currentResult.reportingDate);
  const pentadTmin = resolvePentad(currentResult.reportingDate, 'tmin');
  const pentadTmax = resolvePentad(currentResult.reportingDate, 'tmax');

  const updatedSubdivisions: SubdivisionReportData[] = currentResult.subdivisions.map((subData) => {
    // If no stationInputs stored, construct from report1Rows
    const currentInputs: StationInputData[] = subData.stationInputs ?? subData.report1Rows.map((r) => ({
      stationId: r.stationId,
      stationName: r.stationName,
      tmax: r.tmax,
      tmax24hPrior: r.tmax24hChange !== null && r.tmax !== null ? r.tmax - r.tmax24hChange : null,
      tmaxDepartureStr: r.tmaxDeparture,
      tmin: r.tmin,
      tmin24hPrior: r.tmin24hChange !== null && r.tmin !== null ? r.tmin - r.tmin24hChange : null,
      tminDepartureStr: r.tminDeparture,
      rh0830: r.rh0830,
      rh1730: r.rh1730,
      visibilityCode: null,
      rainfall: r.rainfall,
      rainfall0830: r.rainfall0830,
      rainfall1730: r.rainfall1730,
      manualEdits: r.manualEdits,
    }));

    const updatedInputs: StationInputData[] = currentInputs.map((stn) => {
      const edit = stationEdits[stn.stationId];
      if (!edit) return { ...stn };

      const updated = { ...stn };
      const nextEdits = { ...(stn.manualEdits || {}) };
      for (const k of Object.keys(edit)) {
        nextEdits[k] = true;
      }
      updated.manualEdits = nextEdits;

      // 1. Tmax
      if (edit.tmax !== undefined) {
        updated.tmax = edit.tmax;
        if (updated.tmax !== null && !isNaN(updated.tmax)) {
          const norm = normalProvider?.getNormal(stn.stationId, pentadTmax);
          updated.tmaxDepartureStr = norm?.tmax !== null && norm?.tmax !== undefined
            ? formatDeparture(calculateDeparture(updated.tmax, norm.tmax))
            : '---';
        } else {
          updated.tmaxDepartureStr = null;
        }
      }

      // 2. Tmin
      if (edit.tmin !== undefined) {
        updated.tmin = edit.tmin;
        if (updated.tmin !== null && !isNaN(updated.tmin)) {
          const norm = normalProvider?.getNormal(stn.stationId, pentadTmin);
          updated.tminDepartureStr = norm?.tmin !== null && norm?.tmin !== undefined
            ? formatDeparture(calculateDeparture(updated.tmin, norm.tmin))
            : '---';
        } else {
          updated.tminDepartureStr = null;
        }
      }

      // 3. RH 0830
      if (edit.rh0830 !== undefined) {
        updated.rh0830 = edit.rh0830;
      }

      // 4. RH 1730
      if (edit.rh1730 !== undefined) {
        updated.rh1730 = edit.rh1730;
      }

      // 5. Rainfall
      if (edit.rainfall !== undefined) {
        updated.rainfall = edit.rainfall;
        if (edit.rainfall0830 === undefined) {
          updated.rainfall0830 = edit.rainfall;
        }
      }
      if (edit.rainfall0830 !== undefined) {
        updated.rainfall0830 = edit.rainfall0830;
        if (edit.rainfall === undefined) {
          updated.rainfall = edit.rainfall0830;
        }
      }
      if (edit.rainfall1730 !== undefined) {
        updated.rainfall1730 = edit.rainfall1730;
      }

      return updated;
    });

    const report1Rows = calculateStationReportRows(updatedInputs);
    const report2Summary = calculateSubdivisionReportSummary(
      subData.subdivision.id,
      subData.subdivision.name,
      updatedInputs,
      month
    );

    const reportingStationsCount = updatedInputs.filter(
      (s) =>
        s.tmin !== null ||
        s.tmax !== null ||
        s.rainfall !== null ||
        s.rainfall0830 !== null ||
        s.rainfall1730 !== null ||
        s.rh0830 !== null ||
        s.rh1730 !== null
    ).length;

    return {
      subdivision: subData.subdivision,
      report1Rows,
      report2Summary,
      reportingStationsCount,
      stationInputs: updatedInputs,
    };
  });

  const updatedEnriched = currentResult.enrichedObservations.map((obs) => {
    const edit = stationEdits[obs.stationId];
    if (!edit) return obs;
    const next = { ...obs };
    if (edit.tmax !== undefined) {
      next.tmax = edit.tmax;
      if (edit.tmax !== null && !isNaN(edit.tmax)) {
        const norm = normalProvider?.getNormal(obs.stationId, pentadTmax);
        next.tmaxDeparture = norm?.tmax !== null && norm?.tmax !== undefined
          ? formatDeparture(calculateDeparture(edit.tmax, norm.tmax))
          : '---';
      } else {
        next.tmaxDeparture = null;
      }
    }
    if (edit.tmin !== undefined) {
      next.tmin = edit.tmin;
      if (edit.tmin !== null && !isNaN(edit.tmin)) {
        const norm = normalProvider?.getNormal(obs.stationId, pentadTmin);
        next.tminDeparture = norm?.tmin !== null && norm?.tmin !== undefined
          ? formatDeparture(calculateDeparture(edit.tmin, norm.tmin))
          : '---';
      } else {
        next.tminDeparture = null;
      }
    }
    if (edit.rh0830 !== undefined) next.relativeHumidity = edit.rh0830;
    if (edit.rainfall !== undefined) next.rainfall = edit.rainfall;
    if (edit.rainfall0830 !== undefined && edit.rainfall === undefined) next.rainfall = edit.rainfall0830;
    return next;
  });

  return {
    ...currentResult,
    enrichedObservations: updatedEnriched,
    subdivisions: updatedSubdivisions,
  };
}
