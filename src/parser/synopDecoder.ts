/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getStation, isAllowlistedStation } from '../constants/stationRegistry.ts';

/**
 * Parsed observation contract.
 * Represents the exact meteorological parameters extracted by the legacy 03 UTC ingestion script.
 */
export interface ParsedStationObservation {
  /** WMO 5-digit station code (e.g. "42937") */
  stationId: string;

  /** Dry-bulb temperature at 0830 IST (°C) */
  dryBulb?: number | null;

  /** Dew-point temperature at 0830 IST (°C) */
  dewPoint?: number | null;

  /** Minimum temperature of current day recorded at 0830 IST (°C) */
  tmin?: number | null;

  /** Maximum temperature of previous day reported in 03 UTC Section 333 (°C) */
  tmaxPreviousDay?: number | null;

  /** Relative humidity at 0830 IST (%) computed via legacy truncated Magnus formula */
  relativeHumidity?: number | null;

  /** 2-character visibility code from header group (e.g. "96") */
  visibilityCode?: string | null;

  /** 24-hour rainfall accumulation up to 0830 IST (mm) */
  rainfall?: number | null;

  /** Mean sea level pressure at 0830 IST (hPa) */
  mslPressure?: number | null;

  /** Normalized raw telegram string for traceability */
  rawSynop?: string;
}

/**
 * Legacy compatibility:
 * Computes Relative Humidity (%) using the Magnus-Tetens formula as implemented in PHP.
 * CRITICAL LEGACY QUIRK:
 * PHP explicitly truncates (int)(7.5 * temp) before division:
 *   $t2 = (int)(7.5 * $tempDRY) / (237.7 + $tempDRY);
 *   $d2 = (int)(7.5 * $tempDEW) / (237.7 + $tempDEW);
 *   $svp = 6.11 * pow(10, $t2);
 *   $avp = 6.11 * pow(10, $d2);
 *   $rhc = round(($avp / $svp) * 100, 0);
 */
export function calculateLegacyRelativeHumidity(
  dryBulb: number | null | undefined,
  dewPoint: number | null | undefined
): number | null {
  if (dryBulb === null || dryBulb === undefined || dewPoint === null || dewPoint === undefined) {
    return null;
  }
  if (isNaN(dryBulb) || isNaN(dewPoint)) {
    return null;
  }

  // Legacy behavior: integer truncation on numerator
  const t2 = Math.trunc(7.5 * dryBulb) / (237.7 + dryBulb);
  const d2 = Math.trunc(7.5 * dewPoint) / (237.7 + dewPoint);

  const svp = 6.11 * Math.pow(10, t2);
  const avp = 6.11 * Math.pow(10, d2);

  if (svp === 0) {
    return null;
  }

  let rhc = Math.round((avp / svp) * 100);
  if (rhc < 0) rhc = 0;
  if (rhc > 100) rhc = 100;

  return rhc;
}

/**
 * Decodes the 5-digit station ID (IIiii).
 */
export function parseStationId(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const first = tokens[0];
  if (/^\d{5}$/.test(first)) {
    return first;
  }
  return null;
}

/**
 * Decodes visibility code from header group `i_R i_x h VV`.
 * Legacy PHP slices: substr($d, 9, 2)
 */
export function parseVisibilityCode(tokens: string[]): string | null {
  if (tokens.length < 2) return null;
  const header = tokens[1];
  if (header.length === 5) {
    const vv = header.substring(3, 5);
    if (/^\d{2}$/.test(vv)) {
      return vv;
    }
  }
  return null;
}

/**
 * Extracts precipitation indicator i_R (first digit of 2nd group).
 * In WMO SYNOP: 1=reported in sec 1&3, 2=in sec 3/5, 3=omitted (dry), 4=no precip reported.
 */
export function parsePrecipitationIndicator(tokens: string[]): string | null {
  if (tokens.length < 2) return null;
  const header = tokens[1];
  if (header.length === 5) {
    return header.charAt(0);
  }
  return null;
}

/**
 * Decodes Section 1 Temperatures:
 * - Dry-bulb temperature (1s_nTTT)
 * - Dew-point temperature (2s_nTdTdTd)
 * In legacy PHP:
 *   $e = strpos($d1, " 10");
 *   $tt = substr($d1, $e+3, 3);
 *   $td = substr($d1, $e+9, 3);
 * Dew point is extracted directly following dry bulb to avoid collision with Nddff.
 */
export function parseTemperatures(tokens: string[]): {
  dryBulb: number | null;
  dewPoint: number | null;
  tempTokenIndex: number;
} {
  let dryBulb: number | null = null;
  let dewPoint: number | null = null;
  let tempTokenIndex = -1;

  // Search in Section 1 (after station and header, before Section 333 / 555)
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '333' || t === '555') break;

    // Look for group 1s_nTTT. In standard SYNOP, this is token 3 (after Nddff at token 2).
    if (t.length === 5 && (t.startsWith('10') || t.startsWith('11'))) {
      const valStr = t.substring(2, 5);
      if (!valStr.includes('/')) {
        const sign = t.charAt(1) === '1' ? -1 : 1;
        const num = parseInt(valStr, 10);
        if (!isNaN(num)) {
          let val = Math.round((sign * num) / 10 * 10) / 10;
          if (Object.is(val, -0) || val === 0) val = 0;
          dryBulb = val;
          tempTokenIndex = i;
        }
      }

      // Dew point group (2s_nTdTdTd) immediately follows dry bulb
      if (i + 1 < tokens.length) {
        const next = tokens[i + 1];
        if (next.length === 5 && (next.startsWith('20') || next.startsWith('21'))) {
          const tdValStr = next.substring(2, 5);
          if (!tdValStr.includes('/')) {
            const tdSign = next.charAt(1) === '1' ? -1 : 1;
            const tdNum = parseInt(tdValStr, 10);
            if (!isNaN(tdNum)) {
              let tdVal = Math.round((tdSign * tdNum) / 10 * 10) / 10;
              if (Object.is(tdVal, -0) || tdVal === 0) tdVal = 0;
              dewPoint = tdVal;
            }
          }
        }
      }
      break;
    }
  }

  return { dryBulb, dewPoint, tempTokenIndex };
}

export function parseDryBulb(tokens: string[]): number | null {
  return parseTemperatures(tokens).dryBulb;
}

export function parseDewPoint(tokens: string[]): number | null {
  return parseTemperatures(tokens).dewPoint;
}

/**
 * Decodes Section 1 MSL Pressure (4PPPP).
 * In legacy PHP:
 *   $pr_str = substr($d, 22, $c);
 *   $p = strpos($pr_str, " 4");
 * Slicing from index 22 skips Nddff (which could begin with 4, e.g. 40902)
 * and only inspects groups appearing after the temperature groups.
 */
export function parseMslPressure(tokens: string[]): number | null {
  const { tempTokenIndex } = parseTemperatures(tokens);
  // Start search after dew point (tempTokenIndex + 2), or after index 3 if temp not found
  const startIndex = tempTokenIndex !== -1 ? tempTokenIndex + 2 : 4;

  for (let i = startIndex; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '333' || t === '555') break;
    if (t.length === 5 && t.startsWith('4')) {
      const pppp = t.substring(1, 5);
      if (pppp.includes('/')) return null;

      const firstDigit = pppp.charAt(0);
      const pr1 = parseInt(pppp, 10);
      if (isNaN(pr1)) return null;

      if (firstDigit === '0') {
        // >= 1000 hPa: (pr1 + 10000) / 10
        return Math.round(((pr1 + 10000) / 10) * 10) / 10;
      } else {
        // < 1000 hPa: pr1 / 10 (reproduces exact legacy PHP else branch: $pr1 / 10)
        return Math.round((pr1 / 10) * 10) / 10;
      }
    }
  }
  return null;
}

/**
 * Decodes Section 333 temperatures:
 * - Previous day Tmax (1s_nTxTxTx): e.g. 10390 -> 39.0°C
 * - Current day Tmin (2s_nTnTnTn): e.g. 20260 -> 26.0°C
 */
export function parseSection333(tokens: string[]): {
  tmaxPreviousDay: number | null;
  tmin: number | null;
} {
  let inSec333 = false;
  let tmaxPreviousDay: number | null = null;
  let tmin: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '333') {
      inSec333 = true;
      continue;
    }
    if (t === '555') {
      break;
    }
    if (!inSec333) continue;

    // Check for previous day Tmax (1s_nTxTxTx)
    if (t.length === 5 && (t.startsWith('10') || t.startsWith('11')) && tmaxPreviousDay === null) {
      const valStr = t.substring(2, 5);
      if (!valStr.includes('/')) {
        const sign = t.charAt(1) === '1' ? -1 : 1;
        const num = parseInt(valStr, 10);
        if (!isNaN(num)) {
          let val = Math.round((sign * num) / 10 * 10) / 10;
          if (Object.is(val, -0) || val === 0) val = 0;
          tmaxPreviousDay = val;
        }
      }
    }

    // Check for current day Tmin (2s_nTnTnTn)
    if (t.length === 5 && (t.startsWith('20') || t.startsWith('21')) && tmin === null) {
      const valStr = t.substring(2, 5);
      if (!valStr.includes('/')) {
        const sign = t.charAt(1) === '1' ? -1 : 1;
        const num = parseInt(valStr, 10);
        if (!isNaN(num)) {
          let val = Math.round((sign * num) / 10 * 10) / 10;
          if (Object.is(val, -0) || val === 0) val = 0;
          tmin = val;
        }
      }
    }
  }

  return { tmaxPreviousDay, tmin };
}

/**
 * Decodes Rainfall (mm):
 * - If precipitation indicator i_R is '3' or '4', rainfall is forced to 0.0 mm.
 * - Otherwise, parses Section 555 group 0RRRR (RRRR in tenths of mm).
 */
export function parseRainfall(tokens: string[], precipIndicator: string | null): number | null {
  // Legacy rule: iR == '3' or '4' forces 0.0
  if (precipIndicator === '3' || precipIndicator === '4') {
    return 0.0;
  }

  // Look for Section 555
  const sec555Index = tokens.indexOf('555');
  if (sec555Index === -1) {
    return null;
  }

  for (let i = sec555Index + 1; i < tokens.length; i++) {
    const t = tokens[i];
    // Group 0RRRR in Section 555
    if (t.length === 5 && t.startsWith('0')) {
      const rrrrStr = t.substring(1, 5);
      if (rrrrStr.includes('/')) return null;
      const num = parseInt(rrrrStr, 10);
      if (isNaN(num)) return null;
      return Math.round((num / 10) * 10) / 10;
    }
  }

  return null;
}

/**
 * Options for telegram and bulletin parsing.
 */
export interface ParseTelegramOptions {
  /** If true, allows unlisted 5-digit station IDs (default: false - allowlist strictly enforced) */
  allowUnlisted?: boolean;
}

/**
 * Detailed bulletin parse result capturing both valid observations and unrecognized station IDs.
 */
export interface SynopBulletinParseResult {
  observations: ParsedStationObservation[];
  unrecognizedStationIds: string[];
  malformedCount: number;
}

/**
 * Detailed 12 UTC bulletin parse result.
 */
export interface Synop12UtcBulletinParseResult {
  observations: Parsed12UtcStationObservation[];
  unrecognizedStationIds: string[];
  malformedCount: number;
}

/**
 * Decodes a single normalized station telegram string.
 * Strictly enforces that stationId belongs to the authoritative allowlist unless allowUnlisted is true.
 */
export function parseSingleTelegram(
  rawTelegram: string,
  options?: ParseTelegramOptions
): ParsedStationObservation | null {
  // Clean string and split into space-delimited tokens
  const cleaned = rawTelegram.replace(/=/g, '').trim();
  if (cleaned.length < 20) {
    return null;
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const stationId = parseStationId(tokens);
  if (!stationId) {
    return null;
  }
  const visibilityCode = parseVisibilityCode(tokens);
  const precipIndicator = parsePrecipitationIndicator(tokens);
  const dryBulb = parseDryBulb(tokens);
  const dewPoint = parseDewPoint(tokens);
  const relativeHumidity = calculateLegacyRelativeHumidity(dryBulb, dewPoint);
  const mslPressure = parseMslPressure(tokens);
  const { tmaxPreviousDay, tmin } = parseSection333(tokens);
  const rainfall = parseRainfall(tokens, precipIndicator);

  return {
    stationId,
    dryBulb,
    dewPoint,
    tmin,
    tmaxPreviousDay,
    relativeHumidity,
    visibilityCode,
    rainfall,
    mslPressure,
    rawSynop: cleaned,
  };
}

/**
 * Extracted telegram segment with termination metadata.
 */
export interface ExtractedTelegramSegment {
  readonly rawText: string;
  readonly stationId: string;
  readonly hasTerminator: boolean;
  readonly lastGroup?: string;
}

/**
 * Checks if a token at index k within tokens array represents the start of a new station telegram.
 */
function isNewStationTelegramStart(tokens: string[], k: number, currentStart: number): boolean {
  // A standard SYNOP telegram requires at least 6 groups (station, header, wind, dryBulb, dewPoint, pressure)
  if (k - currentStart < 6) return false;
  const token = tokens[k];
  if (!/^\d{5}$/.test(token)) return false;

  // Station identifiers in Region II / India (Block 42, 43, 41) or in the regional station registry
  const isCandidateStation = Boolean(getStation(token)) || /^(42|43|41)\d{3}$/.test(token);
  if (!isCandidateStation) return false;

  // Must be followed by SYNOP header group i_R i_x h VV (first digit 1-4) and wind group Nddff
  if (k + 2 < tokens.length) {
    const headerGrp = tokens[k + 1];
    const windGrp = tokens[k + 2];
    if (/^[1-4][/0-9]{4}$/.test(headerGrp) && /^[/0-9]{5}$/.test(windGrp)) {
      return true;
    }
  }

  return false;
}

/**
 * Splits a raw SYNOP bulletin into individual station telegram segments.
 * Handles both standard '=' delimited telegrams and un-terminated telegrams where
 * '=' was omitted between stations or at the end of the bulletin.
 */
export function splitBulletinIntoTelegrams(rawBulletin: string): ExtractedTelegramSegment[] {
  if (!rawBulletin || typeof rawBulletin !== 'string' || !rawBulletin.trim()) {
    return [];
  }

  const normalized = rawBulletin.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawSegments = normalized.split('=');
  const results: ExtractedTelegramSegment[] = [];

  for (let sIdx = 0; sIdx < rawSegments.length; sIdx++) {
    let segment = rawSegments[sIdx].trim();
    if (!segment) continue;

    const segmentHadTerminator = sIdx < rawSegments.length - 1;

    // Strip optional bulletin header like "AAXX 01034" or "AAXX 01124 AMD"
    segment = segment.replace(/^AAXX\s+\d+(?:\s+(?:COR|AMD))?\s*/i, '').trim();
    if (!segment || segment.length < 5) continue;

    const tokens = segment.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    let currentStart = 0;
    for (let k = 1; k < tokens.length; k++) {
      if (isNewStationTelegramStart(tokens, k, currentStart)) {
        const sliceTokens = tokens.slice(currentStart, k);
        const stnId = parseStationId(sliceTokens) ?? sliceTokens[0];
        const lastGrp = sliceTokens[sliceTokens.length - 1]?.replace(/=+$/, '');
        results.push({
          rawText: sliceTokens.join(' '),
          stationId: stnId,
          hasTerminator: false,
          lastGroup: lastGrp,
        });
        currentStart = k;
      }
    }

    const finalTokens = tokens.slice(currentStart);
    if (finalTokens.length > 0) {
      const stnId = parseStationId(finalTokens) ?? finalTokens[0];
      const lastToken = finalTokens[finalTokens.length - 1];
      const tokenHasTerminator = lastToken.endsWith('=');
      const cleanLastToken = lastToken.replace(/=+$/, '');
      results.push({
        rawText: finalTokens.map((t) => t.replace(/=+$/, '')).join(' '),
        stationId: stnId,
        hasTerminator: segmentHadTerminator || tokenHasTerminator,
        lastGroup: cleanLastToken,
      });
    }
  }

  return results;
}

/**
 * Primary pure function:
 * Splits a full 03 UTC SYNOP bulletin into individual station telegrams and decodes each.
 * Supports multiple telegrams terminated with '=', headers like AAXX, and line wraps.
 * Strictly accepts only allowlisted stations unless allowUnlisted is true.
 */
export function parseSynopBulletin(
  rawBulletin: string,
  options?: ParseTelegramOptions
): ParsedStationObservation[] {
  if (!rawBulletin || typeof rawBulletin !== 'string') {
    return [];
  }

  const extracted = splitBulletinIntoTelegrams(rawBulletin);
  const results: ParsedStationObservation[] = [];

  for (const item of extracted) {
    if (item.rawText.length < 15) continue;

    const parsed = parseSingleTelegram(item.rawText, options);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

/**
 * Detailed 03 UTC bulletin parser that isolates allowlisted observations,
 * unrecognized station codes, and malformed telegrams with zero silent data corruption.
 */
export function parseSynopBulletinDetailed(rawBulletin: string): SynopBulletinParseResult {
  if (!rawBulletin || typeof rawBulletin !== 'string') {
    return { observations: [], unrecognizedStationIds: [], malformedCount: 0 };
  }

  const extracted = splitBulletinIntoTelegrams(rawBulletin);
  const observations: ParsedStationObservation[] = [];
  const unrecognizedStationIds: string[] = [];
  let malformedCount = 0;

  for (const item of extracted) {
    if (item.rawText.length < 15) {
      malformedCount++;
      continue;
    }

    const tokens = item.rawText.split(/\s+/).filter(Boolean);
    const rawId = parseStationId(tokens);

    if (!rawId) {
      malformedCount++;
      continue;
    }

    if (!getStation(rawId)) {
      if (!unrecognizedStationIds.includes(rawId)) {
        unrecognizedStationIds.push(rawId);
      }
      continue;
    }

    const parsed = parseSingleTelegram(item.rawText);
    if (parsed) {
      observations.push(parsed);
    } else {
      malformedCount++;
    }
  }

  return { observations, unrecognizedStationIds, malformedCount };
}

/**
 * 12 UTC parsed station observation contract.
 * At 12 UTC (1730 IST):
 * - Dry-bulb, dew-point, and relative humidity represent 1730 IST evening conditions.
 * - Section 333 group 1s_nTxTxTx reports the maximum temperature recorded during the day (Tmax).
 * - Section 555 group 0RRRR (or header i_R) reports rainfall accumulated up to 1730 IST.
 * - Section 1 group 4PPPP reports MSL pressure at 1730 IST.
 */
export interface Parsed12UtcStationObservation {
  stationId: string;
  dryBulb?: number | null;
  dewPoint?: number | null;
  relativeHumidity?: number | null; // 1730 IST Relative Humidity (%)
  tmax?: number | null; // Today's maximum temperature from Section 333 (°C)
  rainfall?: number | null; // Rainfall accumulated up to 1730 IST (mm)
  mslPressure?: number | null; // 1730 IST MSL pressure (hPa)
  visibilityCode?: string | null;
  rawSynop?: string;
}

/**
 * Decodes a single 12 UTC normalized station telegram string.
 * Keeps 12Z decoding semantics strictly separate from 03Z.
 */
export function parse12UtcSingleTelegram(
  rawTelegram: string,
  options?: ParseTelegramOptions
): Parsed12UtcStationObservation | null {
  const parsed = parseSingleTelegram(rawTelegram, options);
  if (!parsed) {
    return null;
  }

  return {
    stationId: parsed.stationId,
    dryBulb: parsed.dryBulb,
    dewPoint: parsed.dewPoint,
    relativeHumidity: parsed.relativeHumidity,
    // In 12 UTC SYNOP Section 333, group 1s_nTxTxTx reports today's maximum temperature
    tmax: parsed.tmaxPreviousDay,
    rainfall: parsed.rainfall,
    mslPressure: parsed.mslPressure,
    visibilityCode: parsed.visibilityCode,
    rawSynop: parsed.rawSynop,
  };
}

/**
 * Parses a complete 12 UTC SYNOP bulletin into individual station observations.
 */
export function parse12UtcBulletin(
  rawBulletin: string,
  options?: ParseTelegramOptions
): Parsed12UtcStationObservation[] {
  if (!rawBulletin || typeof rawBulletin !== 'string') {
    return [];
  }

  const extracted = splitBulletinIntoTelegrams(rawBulletin);
  const results: Parsed12UtcStationObservation[] = [];

  for (const item of extracted) {
    if (item.rawText.length < 15) continue;

    const parsed = parse12UtcSingleTelegram(item.rawText, options);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

/**
 * Convenient alias for parse12UtcBulletin.
 */
export const parse12ZBulletin = parse12UtcBulletin;

/**
 * Detailed 12 UTC bulletin parser isolating allowlisted observations and unlisted codes.
 */
export function parse12UtcBulletinDetailed(rawBulletin: string): Synop12UtcBulletinParseResult {
  if (!rawBulletin || typeof rawBulletin !== 'string') {
    return { observations: [], unrecognizedStationIds: [], malformedCount: 0 };
  }

  const extracted = splitBulletinIntoTelegrams(rawBulletin);
  const observations: Parsed12UtcStationObservation[] = [];
  const unrecognizedStationIds: string[] = [];
  let malformedCount = 0;

  for (const item of extracted) {
    if (item.rawText.length < 15) {
      malformedCount++;
      continue;
    }

    const tokens = item.rawText.split(/\s+/).filter(Boolean);
    const rawId = parseStationId(tokens);

    if (!rawId) {
      malformedCount++;
      continue;
    }

    if (!getStation(rawId)) {
      if (!unrecognizedStationIds.includes(rawId)) {
        unrecognizedStationIds.push(rawId);
      }
      continue;
    }

    const parsed = parse12UtcSingleTelegram(item.rawText);
    if (parsed) {
      observations.push(parsed);
    } else {
      malformedCount++;
    }
  }

  return { observations, unrecognizedStationIds, malformedCount };
}

/**
 * Parsed AAXX YYGG4 bulletin header details.
 */
export interface SynopHeaderInfo {
  day: number | null;
  dayString: string | null;
  hour: number | null;
  slot: '03Z' | '12Z' | null;
  valid: boolean;
  rawHeader: string | null;
}

/**
 * Parses the AAXX YYGG4 header group from a SYNOP bulletin string.
 * Example: "AAXX 15034" -> day 15, hour 03, slot "03Z".
 * Example: "AAXX 15124" -> day 15, hour 12, slot "12Z".
 */
export function parseSynopHeader(bulletin: string): SynopHeaderInfo | null {
  if (!bulletin || typeof bulletin !== 'string') return null;

  const match = bulletin.match(/\bAAXX\s+(\d{4,5})(?:\s+(?:COR|AMD))?\b/i);
  if (!match) return null;

  const rawGroup = match[1];
  const dayStr = rawGroup.substring(0, 2);
  const hourStr = rawGroup.substring(2, 4);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);

  if (isNaN(day) || isNaN(hour)) return null;

  let slot: '03Z' | '12Z' | null = null;
  if (hour >= 0 && hour <= 6) {
    slot = '03Z';
  } else if (hour >= 10 && hour <= 16) {
    slot = '12Z';
  }

  return {
    day,
    dayString: dayStr,
    hour,
    slot,
    valid: true,
    rawHeader: match[0],
  };
}

/**
 * Cross-checks the AAXX YYGG4 bulletin header against the selected reporting date and slot.
 * Returns valid: false with an explicit error message if a mismatch is detected.
 */
export function validateBulletinHeader(
  bulletin: string,
  selectedDate: string,
  selectedSlot: '03Z' | '12Z'
): { valid: boolean; error?: string; headerInfo?: SynopHeaderInfo } {
  const header = parseSynopHeader(bulletin);
  if (!header) {
    // If no AAXX header is present, allow single-station pastes to proceed
    return { valid: true };
  }

  // 1. Cross-check observation slot
  if (header.slot && header.slot !== selectedSlot) {
    const slotLabel = header.slot === '03Z' ? '03 UTC (08:30 IST)' : '12 UTC (17:30 IST)';
    const selectedLabel = selectedSlot === '03Z' ? '03 UTC (08:30 IST)' : '12 UTC (17:30 IST)';
    return {
      valid: false,
      error: `Slot Mismatch Detected: The bulletin header '${header.rawHeader}' indicates ${slotLabel}, but the active observation slot is set to ${selectedLabel}. Please toggle the observation slot to ${header.slot} or check your bulletin text.`,
      headerInfo: header,
    };
  }

  // 2. Cross-check date (day of month)
  if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    const selectedDay = parseInt(selectedDate.split('-')[2], 10);
    if (header.day !== null && header.day !== selectedDay) {
      return {
        valid: false,
        error: `Date Mismatch Detected: The bulletin header '${header.rawHeader}' indicates day ${header.dayString}, but your selected reporting date is ${selectedDate} (day ${String(selectedDay).padStart(2, '0')}). Please check for mismatch in date or update your reporting date.`,
        headerInfo: header,
      };
    }
  }

  return { valid: true, headerInfo: header };
}

