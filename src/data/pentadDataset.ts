/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import masterJsonData from '../../pentad_normals/normals_pentad_master.json' with { type: 'json' };
import calendarJsonData from '../../pentad_normals/pentad_calendar_366.json' with { type: 'json' };
import type { PentadNormal } from '../engine/climatology.ts';

/**
 * Raw metadata schema in normals_pentad_master.json.
 */
export interface MasterPentadMetadata {
  readonly generated_at: string;
  readonly period: string;
  readonly station_count: number;
  readonly pentads_per_station: number;
  readonly total_records: number;
  readonly filter_source: string;
  readonly requested_stations_count: number;
  readonly matched_stations_count: number;
  readonly missing_stations_count: number;
  readonly missing_stations: readonly string[];
}

/**
 * Pentad calendar interval metadata in master dataset.
 */
export interface PentadIntervalMetadata {
  readonly pentad_id: number;
  readonly doy_start: number;
  readonly doy_end: number;
  readonly start_mmdd: string;
  readonly end_mmdd: string;
  readonly date_range: string;
}

/**
 * Raw station normal record in master dataset.
 */
export interface RawStationPentadRecord {
  readonly p: number;
  readonly tmax: number;
  readonly tmin: number;
  readonly pres1?: number | null;
  readonly pres2?: number | null;
  readonly rh1?: number | null;
  readonly rh2?: number | null;
}

/**
 * Complete master pentad raw dataset schema.
 */
export interface MasterPentadRawDataset {
  readonly metadata: MasterPentadMetadata;
  readonly pentads: readonly PentadIntervalMetadata[];
  readonly stations: readonly string[];
  readonly normals: Record<string, readonly RawStationPentadRecord[]>;
}

/**
 * Calendar entry schema in pentad_calendar_366.json.
 */
export interface PentadCalendarEntry {
  readonly pentad_id: number;
  readonly doy_standard: number | null;
  readonly date_range: string;
}

/**
 * Complete 366-day calendar raw dataset schema.
 */
export type PentadCalendarRawDataset = Record<string, PentadCalendarEntry>;

/**
 * Extended normal record preserving all climatological variables (Tmin, Tmax, MSLP, RH).
 */
export interface ExtendedPentadNormal extends PentadNormal {
  readonly pres1: number | null;
  readonly pres2: number | null;
  readonly rh1: number | null;
  readonly rh2: number | null;
}

/**
 * In-memory indexed pentad dataset for O(1) operational retrieval.
 */
export interface IndexedPentadDataset {
  readonly metadata: MasterPentadMetadata;
  /** Indexed by `${stationId}_${pentadStr}` (supports both "01" and "1") */
  readonly normalsMap: Map<string, PentadNormal>;
  /** Extended normals including pressure and RH */
  readonly extendedNormalsMap: Map<string, ExtendedPentadNormal>;
  /** Indexed by "MM-DD" */
  readonly calendarMap: Map<string, PentadCalendarEntry>;
  /** 73 pentad intervals indexed by pentad_id (1..73) */
  readonly pentadIntervals: Map<number, PentadIntervalMetadata>;
  /** Station IDs present in the dataset */
  readonly stationsSet: Set<string>;
  readonly stats: {
    readonly stationsLoaded: number;
    readonly totalRecordsIndexed: number;
    readonly duplicatesDetected: number;
    readonly malformedRecordsDetected: number;
  };
}

/**
 * Normalizes a pentad representation into canonical 2-digit ("01".."73") and integer form.
 */
export function normalizePentadId(pentad: string | number): { num: number; pad2: string } | null {
  const pNum = typeof pentad === 'number' ? pentad : parseInt(String(pentad).trim(), 10);
  if (isNaN(pNum) || pNum < 1 || pNum > 73) {
    return null;
  }
  return {
    num: pNum,
    pad2: String(pNum).padStart(2, '0'),
  };
}

/**
 * Builds O(1) lookup indices from raw master and calendar datasets.
 */
export function indexPentadDatasets(
  masterData: MasterPentadRawDataset = masterJsonData as unknown as MasterPentadRawDataset,
  calendarData: PentadCalendarRawDataset = calendarJsonData as unknown as PentadCalendarRawDataset
): IndexedPentadDataset {
  const normalsMap = new Map<string, PentadNormal>();
  const extendedNormalsMap = new Map<string, ExtendedPentadNormal>();
  const calendarMap = new Map<string, PentadCalendarEntry>();
  const pentadIntervals = new Map<number, PentadIntervalMetadata>();
  const stationsSet = new Set<string>();

  let duplicatesDetected = 0;
  let malformedRecordsDetected = 0;
  let totalRecordsIndexed = 0;

  // 1. Index Pentad Intervals (1 to 73)
  if (Array.isArray(masterData.pentads)) {
    for (const interval of masterData.pentads) {
      if (interval && typeof interval.pentad_id === 'number') {
        pentadIntervals.set(interval.pentad_id, interval);
      }
    }
  }

  // 2. Index 366-Day Calendar ("MM-DD")
  if (calendarData && typeof calendarData === 'object') {
    for (const [mmdd, entry] of Object.entries(calendarData)) {
      if (entry && typeof entry.pentad_id === 'number') {
        calendarMap.set(mmdd, entry);
      }
    }
  }

  // 3. Index Master Station Normals
  if (masterData.normals && typeof masterData.normals === 'object') {
    for (const [stationId, records] of Object.entries(masterData.normals)) {
      stationsSet.add(stationId);

      if (!Array.isArray(records)) {
        continue;
      }

      const seenPentadsForStation = new Set<number>();

      for (const rec of records) {
        if (
          !rec ||
          typeof rec.p !== 'number' ||
          rec.p < 1 ||
          rec.p > 73 ||
          typeof rec.tmin !== 'number' ||
          typeof rec.tmax !== 'number' ||
          isNaN(rec.tmin) ||
          isNaN(rec.tmax)
        ) {
          malformedRecordsDetected++;
          continue;
        }

        if (seenPentadsForStation.has(rec.p)) {
          duplicatesDetected++;
        }
        seenPentadsForStation.add(rec.p);

        const pad2 = String(rec.p).padStart(2, '0');
        const numStr = String(rec.p);

        const standardNormal: PentadNormal = {
          station: stationId,
          pentad: pad2,
          tmin: rec.tmin,
          tmax: rec.tmax,
        };

        const extendedNormal: ExtendedPentadNormal = {
          ...standardNormal,
          pres1: typeof rec.pres1 === 'number' && !isNaN(rec.pres1) ? rec.pres1 : null,
          pres2: typeof rec.pres2 === 'number' && !isNaN(rec.pres2) ? rec.pres2 : null,
          rh1: typeof rec.rh1 === 'number' && !isNaN(rec.rh1) ? rec.rh1 : null,
          rh2: typeof rec.rh2 === 'number' && !isNaN(rec.rh2) ? rec.rh2 : null,
        };

        // Dual-index by 2-digit padded and unpadded keys for O(1) lookups:
        // `${stationId}_01` and `${stationId}_1`
        normalsMap.set(`${stationId}_${pad2}`, standardNormal);
        normalsMap.set(`${stationId}_${numStr}`, standardNormal);

        extendedNormalsMap.set(`${stationId}_${pad2}`, extendedNormal);
        extendedNormalsMap.set(`${stationId}_${numStr}`, extendedNormal);

        totalRecordsIndexed++;
      }
    }
  }

  return {
    metadata: masterData.metadata,
    normalsMap,
    extendedNormalsMap,
    calendarMap,
    pentadIntervals,
    stationsSet,
    stats: {
      stationsLoaded: stationsSet.size,
      totalRecordsIndexed,
      duplicatesDetected,
      malformedRecordsDetected,
    },
  };
}

/**
 * Singleton pre-indexed dataset for production use.
 */
let cachedIndexedDataset: IndexedPentadDataset | null = null;

export function getDefaultIndexedDataset(): IndexedPentadDataset {
  if (!cachedIndexedDataset) {
    cachedIndexedDataset = indexPentadDatasets();
  }
  return cachedIndexedDataset;
}
