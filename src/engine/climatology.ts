/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ParsedStationObservation } from '../parser/synopDecoder.ts';
import { roundLikePhp } from './reportCalculations.ts';

/**
 * Pentad Normal contract representing table `normals_pentad_1981_2010`.
 * Exact columns verified from legacy SQL:
 * SELECT * FROM `normals_pentad_1981_2010` WHERE `pentad`='$pentad' AND station IN (...)
 */
export interface PentadNormal {
  station: string;
  pentad: string;
  tmin: number;
  tmax: number;
}

/**
 * Provider abstraction for retrieving pentad climatological normals.
 */
export interface PentadNormalProvider {
  getNormal(stationId: string, pentad: string): PentadNormal | null;
}

/**
 * Enriched observation contract.
 * Represents a parsed station observation enriched with climatological normals,
 * departures, and operational morning/evening date stamps.
 */
export interface EnrichedObservation {
  /** WMO 5-digit station code (e.g. "42937") */
  stationId: string;

  /** Morning observation date (YYYY-MM-DD in Asia/Kolkata) */
  dateMorning: string;

  /** Evening observation date (YYYY-MM-DD in Asia/Kolkata) */
  dateEvening: string;

  /** Minimum temperature of current day recorded at 0830 IST (°C) */
  tmin: number | null;

  /**
   * Minimum temperature departure from normal (°C formatted string, e.g. "+2.4", "-1.8", "0", or "---")
   * If normal is missing, legacy presentation value is "---".
   */
  tminDeparture: string | null;

  /** Maximum temperature of previous day reported in 03 UTC Section 333 (°C) */
  tmax: number | null;

  /** Maximum temperature departure from normal (°C formatted string, e.g. "+1.5", "-0.8", "0", or "---") */
  tmaxDeparture: string | null;

  /** Dry-bulb temperature at 0830 IST (°C) */
  dryBulb: number | null;

  /** Dew-point temperature at 0830 IST (°C) */
  dewPoint: number | null;

  /** Relative humidity at 0830 IST (%) */
  relativeHumidity: number | null;

  /** 2-character visibility code from header group (e.g. "96") */
  visibilityCode: string | null;

  /** 24-hour rainfall accumulation up to 0830 IST (mm) */
  rainfall: number | null;

  /** Mean sea level pressure at 0830 IST (hPa) */
  mslPressure: number | null;

  /** Raw SYNOP telegram string */
  rawSynop?: string;
}

/**
 * Parses any valid Date or string into Year, Month (1-12), Day (1-31),
 * and 0-indexed day of year (date('z') in PHP: 0 to 365) in Asia/Kolkata timezone.
 */
export function getKolkataCalendarDetails(dateInput: Date | string): {
  year: number;
  month: number;
  day: number;
  dateStr: string;
  dayOfYear0: number; // 0 for Jan 1 (matches PHP date('z'))
} {
  let dateStr: string;

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    dateStr = dateInput;
  } else {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    // Format to YYYY-MM-DD in Asia/Kolkata timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateStr = formatter.format(d);
  }

  const parts = dateStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

  // Cumulative days before the 1st of each month (non-leap)
  const daysBeforeMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  let dayOfYear0 = daysBeforeMonth[month - 1] + (day - 1);
  if (isLeap && month > 2) {
    dayOfYear0 += 1;
  }

  return { year, month, day, dateStr, dayOfYear0 };
}

/**
 * Returns previous day's date string (YYYY-MM-DD) in Asia/Kolkata timezone.
 */
export function getPreviousDayDateString(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  // Construct UTC date at noon to avoid boundary shifting
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolves the 2-digit pentad string ("01" to "73") using the exact legacy PHP logic.
 *
 * Source code reference (from 03 UTC ingestion script):
 *   // pentad for tmin normals:
 *   $a_tmin = (int)date('z'); //this change is only for 2024
 *   $a_tmin = $a_tmin + 1;
 *   //if ((int)date('m')>=3 ){ $a_tmin=$a_tmin+1; }
 *   $pentad_tmin = sprintf("%02s", ceil($a_tmin/5));
 *
 *   // pentad for previous-day tmax normals:
 *   $a_tmax = (int)date('z');
 *   if ((int)date('m')>=3){ $a_tmax=$a_tmax+1; }
 *   $pentad_tmax = sprintf("%02s", ceil($a_tmax/5));
 */
export function resolvePentad(
  reportingDate: Date | string,
  variable: 'tmin' | 'tmax'
): string {
  const { month, dayOfYear0 } = getKolkataCalendarDetails(reportingDate);

  if (variable === 'tmin') {
    // Legacy behavior: 1-based day of year (date('z') + 1)
    const a_tmin = dayOfYear0 + 1;
    let pentadNum = Math.ceil(a_tmin / 5);
    if (pentadNum < 1) pentadNum = 1;
    if (pentadNum > 73) pentadNum = 73;
    return String(pentadNum).padStart(2, '0');
  } else {
    // Legacy behavior for Tmax:
    // Starts at date('z') (representing yesterday's 1-based day of year from today)
    // plus 1 for March onwards (month >= 3)
    let a_tmax = dayOfYear0;
    if (month >= 3) {
      a_tmax += 1;
    }

    if (a_tmax <= 0) {
      // On Jan 1, date('z') is 0, yielding ceil(0/5) = 0 => "00" in legacy PHP
      return '00';
    }

    let pentadNum = Math.ceil(a_tmax / 5);
    if (pentadNum > 73) pentadNum = 73;
    return String(pentadNum).padStart(2, '0');
  }
}

/**
 * Calculates departure from normal: round(observed - normal, 1).
 */
export function calculateDeparture(
  observed: number | null | undefined,
  normal: number | null | undefined
): number | null {
  if (
    observed === null ||
    observed === undefined ||
    normal === null ||
    normal === undefined ||
    isNaN(observed) ||
    isNaN(normal)
  ) {
    return null;
  }

  return roundLikePhp(observed - normal, 1);
}

/**
 * Formats departure into legacy string representation:
 * - Positive: explicit "+" prefix (e.g. "+2.4")
 * - Negative: minus sign (e.g. "-1.8")
 * - Zero: "0" (matches PHP (string)0)
 * - Missing/NaN: null
 */
export function formatDeparture(departure: number | null | undefined): string | null {
  if (departure === null || departure === undefined || isNaN(departure)) {
    return null;
  }
  if (departure === 0) {
    return '0';
  }
  if (departure > 0) {
    return `+${departure.toFixed(1)}`;
  }
  return departure.toFixed(1);
}

/**
 * Enriches a single ParsedStationObservation with climatological normals,
 * departures, and operational morning/evening date tags.
 */
export function enrichObservation(
  parsed: ParsedStationObservation,
  reportingDate: Date | string,
  normalProvider?: PentadNormalProvider
): EnrichedObservation {
  const { dateStr: dateMorning } = getKolkataCalendarDetails(reportingDate);
  const dateEvening = getPreviousDayDateString(dateMorning);

  const pentadTmin = resolvePentad(dateMorning, 'tmin');
  const pentadTmax = resolvePentad(dateMorning, 'tmax');

  const normalTminObj = normalProvider?.getNormal(parsed.stationId, pentadTmin) ?? null;
  const normalTmaxObj = normalProvider?.getNormal(parsed.stationId, pentadTmax) ?? null;

  // Tmin Departure Processing
  let tminDeparture: string | null = null;
  if (parsed.tmin !== null && parsed.tmin !== undefined && !isNaN(parsed.tmin)) {
    if (
      normalTminObj &&
      normalTminObj.tmin !== null &&
      normalTminObj.tmin !== undefined &&
      !isNaN(normalTminObj.tmin)
    ) {
      const depVal = calculateDeparture(parsed.tmin, normalTminObj.tmin);
      tminDeparture = formatDeparture(depVal);
    } else {
      // Legacy fallback when normal record is unavailable in DB
      tminDeparture = '---';
    }
  }

  // Tmax (Previous Day) Departure Processing
  let tmaxDeparture: string | null = null;
  if (
    parsed.tmaxPreviousDay !== null &&
    parsed.tmaxPreviousDay !== undefined &&
    !isNaN(parsed.tmaxPreviousDay)
  ) {
    if (
      normalTmaxObj &&
      normalTmaxObj.tmax !== null &&
      normalTmaxObj.tmax !== undefined &&
      !isNaN(normalTmaxObj.tmax)
    ) {
      const depVal = calculateDeparture(parsed.tmaxPreviousDay, normalTmaxObj.tmax);
      tmaxDeparture = formatDeparture(depVal);
    } else {
      // Legacy fallback when normal record is unavailable in DB
      tmaxDeparture = '---';
    }
  }

  return {
    stationId: parsed.stationId,
    dateMorning,
    dateEvening,
    tmin: parsed.tmin ?? null,
    tminDeparture,
    tmax: parsed.tmaxPreviousDay ?? null,
    tmaxDeparture,
    dryBulb: parsed.dryBulb ?? null,
    dewPoint: parsed.dewPoint ?? null,
    relativeHumidity: parsed.relativeHumidity ?? null,
    visibilityCode: parsed.visibilityCode ?? null,
    rainfall: parsed.rainfall ?? null,
    mslPressure: parsed.mslPressure ?? null,
    rawSynop: parsed.rawSynop,
  };
}

/**
 * Enriches a collection of parsed station observations.
 */
export function enrichBulletin(
  parsedList: ParsedStationObservation[],
  reportingDate: Date | string,
  normalProvider?: PentadNormalProvider
): EnrichedObservation[] {
  return parsedList.map((obs) => enrichObservation(obs, reportingDate, normalProvider));
}
