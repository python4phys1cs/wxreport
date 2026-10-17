/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PentadNormal, PentadNormalProvider } from '../engine/climatology.ts';
import {
  getDefaultIndexedDataset,
  normalizePentadId,
  type ExtendedPentadNormal,
  type IndexedPentadDataset,
  type PentadCalendarEntry,
  type PentadIntervalMetadata,
} from '../data/pentadDataset.ts';

/**
 * Result structure when querying normals directly by date, matching pentadNormalsLookup.js.
 */
export interface DateNormalsResult {
  readonly station: string;
  readonly pentad_id: number;
  readonly date_range: string;
  readonly start_mmdd: string;
  readonly end_mmdd: string;
  readonly doy_start: number;
  readonly doy_end: number;
  readonly normals: {
    readonly pres1: number | null;
    readonly pres2: number | null;
    readonly tmax: number;
    readonly tmin: number;
    readonly rh1: number | null;
    readonly rh2: number | null;
  };
}

/**
 * Computes the operational pentad (1 to 73) from a Date or date string ("YYYY-MM-DD" or "MM-DD").
 * Directly adapted from pentadNormalsLookup.js with full type-safety and leap day (Feb 29 -> Pentad 12) handling.
 */
export function getPentadFromDate(dateInput: Date | string): number {
  let month: number;
  let day: number;

  if (dateInput instanceof Date) {
    month = dateInput.getMonth() + 1; // 1-12
    day = dateInput.getDate(); // 1-31
  } else if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const parts = trimmed.split(/[-/]/);
    if (parts.length === 3) {
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    } else {
      throw new Error(`Invalid date format: ${dateInput}. Use YYYY-MM-DD or MM-DD.`);
    }
  } else {
    throw new Error('dateInput must be a Date object or string (YYYY-MM-DD / MM-DD).');
  }

  if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid calendar month/day: ${month}/${day} from input ${dateInput}`);
  }

  // Handle leap day: Feb 29 belongs to Pentad 12 (Feb 25 - Mar 01)
  if (month === 2 && day === 29) {
    return 12;
  }

  // Standard non-leap cumulative days before each month (1-indexed month)
  // [0, Jan(0), Feb(31), Mar(59), Apr(90), May(120), Jun(151), Jul(181), Aug(212), Sep(243), Oct(273), Nov(304), Dec(334)]
  const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  const doy = DAYS_BEFORE_MONTH[month] + day;

  // Standard pentad formula: Math.floor((DOY - 1) / 5) + 1
  return Math.min(73, Math.max(1, Math.floor((doy - 1) / 5) + 1));
}

/**
 * Extracts "MM-DD" formatted string from a Date or date string.
 */
export function getMmDdString(dateInput: Date | string): string {
  if (dateInput instanceof Date) {
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${m}-${d}`;
  }
  const parts = dateInput.trim().split(/[-/]/);
  if (parts.length === 3) {
    const m = String(parseInt(parts[1], 10)).padStart(2, '0');
    const d = String(parseInt(parts[2], 10)).padStart(2, '0');
    return `${m}-${d}`;
  } else if (parts.length === 2) {
    const m = String(parseInt(parts[0], 10)).padStart(2, '0');
    const d = String(parseInt(parts[1], 10)).padStart(2, '0');
    return `${m}-${d}`;
  }
  throw new Error(`Unable to extract MM-DD from ${dateInput}`);
}

/**
 * Production-grade, deterministic, read-only Pentad Climatological Normal Provider
 * backed by the 1981-2010 master dataset and 366-day calendar.
 *
 * Implements PentadNormalProvider with O(1) in-memory lookups.
 */
export class MasterPentadNormalProvider implements PentadNormalProvider {
  private readonly dataset: IndexedPentadDataset;

  constructor(customDataset?: IndexedPentadDataset) {
    this.dataset = customDataset ?? getDefaultIndexedDataset();
  }

  /**
   * Primary contract method: retrieves PentadNormal (tmin, tmax) for station and pentad.
   * Returns null if station or pentad does not exist or is invalid (e.g. "00" or out of range).
   *
   * O(1) complexity.
   */
  getNormal(stationId: string, pentad: string): PentadNormal | null {
    if (!stationId || !pentad) {
      return null;
    }

    const cleanStation = stationId.trim();
    const cleanPentad = pentad.trim();

    // Check direct match in O(1) map (handles both "01" and "1")
    const match = this.dataset.normalsMap.get(`${cleanStation}_${cleanPentad}`);
    if (match) {
      return match;
    }

    // Try canonical 2-digit padding if not directly matched
    const norm = normalizePentadId(cleanPentad);
    if (!norm) {
      return null;
    }

    return this.dataset.normalsMap.get(`${cleanStation}_${norm.pad2}`) ?? null;
  }

  /**
   * Retrieves extended climatological normals including MSL pressure and Relative Humidity.
   *
   * O(1) complexity.
   */
  getExtendedNormal(stationId: string, pentad: string): ExtendedPentadNormal | null {
    if (!stationId || !pentad) {
      return null;
    }

    const cleanStation = stationId.trim();
    const cleanPentad = pentad.trim();

    const match = this.dataset.extendedNormalsMap.get(`${cleanStation}_${cleanPentad}`);
    if (match) {
      return match;
    }

    const norm = normalizePentadId(cleanPentad);
    if (!norm) {
      return null;
    }

    return this.dataset.extendedNormalsMap.get(`${cleanStation}_${norm.pad2}`) ?? null;
  }

  /**
   * Checks if a station is included in the master climatological normal dataset.
   */
  hasStation(stationId: string): boolean {
    return this.dataset.stationsSet.has(stationId.trim());
  }

  /**
   * Returns total number of active stations loaded in master normals (48).
   */
  getStationCount(): number {
    return this.dataset.stationsSet.size;
  }

  /**
   * Returns list of stations known to be missing from the 1981-2010 normal dataset.
   */
  getMissingStations(): readonly string[] {
    return this.dataset.metadata.missing_stations ?? [];
  }

  /**
   * Returns metadata interval info for a pentad id (1 to 73).
   */
  getPentadInterval(pentadId: number | string): PentadIntervalMetadata | null {
    const norm = normalizePentadId(pentadId);
    if (!norm) return null;
    return this.dataset.pentadIntervals.get(norm.num) ?? null;
  }

  /**
   * Returns the 366-day calendar entry for a given date or "MM-DD".
   */
  getCalendarEntry(dateInput: Date | string): PentadCalendarEntry | null {
    try {
      const mmdd = getMmDdString(dateInput);
      return this.dataset.calendarMap.get(mmdd) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Direct date-to-normals query adapting pentadNormalsLookup.js.
   */
  getNormalsForDate(stationId: string, dateInput: Date | string): DateNormalsResult | null {
    if (!this.hasStation(stationId)) {
      return null;
    }

    let pentadId: number;
    try {
      pentadId = getPentadFromDate(dateInput);
    } catch {
      return null;
    }

    const extended = this.getExtendedNormal(stationId, String(pentadId));
    if (!extended) {
      return null;
    }

    const interval = this.getPentadInterval(pentadId);
    const calendar = this.getCalendarEntry(dateInput);

    return {
      station: stationId,
      pentad_id: pentadId,
      date_range: interval?.date_range ?? calendar?.date_range ?? '',
      start_mmdd: interval?.start_mmdd ?? '',
      end_mmdd: interval?.end_mmdd ?? '',
      doy_start: interval?.doy_start ?? 0,
      doy_end: interval?.doy_end ?? 0,
      normals: {
        pres1: extended.pres1,
        pres2: extended.pres2,
        tmax: extended.tmax,
        tmin: extended.tmin,
        rh1: extended.rh1,
        rh2: extended.rh2,
      },
    };
  }

  /**
   * Internal indexing statistics for diagnostics and unit testing.
   */
  getStats() {
    return this.dataset.stats;
  }
}

/**
 * Default production singleton instance.
 */
export const defaultPentadNormalProvider = new MasterPentadNormalProvider();

/**
 * Direct date-to-normals query function using the production dataset.
 */
export function getNormalsForDate(
  stationId: string,
  dateInput: Date | string
): DateNormalsResult | null {
  return defaultPentadNormalProvider.getNormalsForDate(stationId, dateInput);
}
