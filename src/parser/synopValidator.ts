/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getStation } from '../constants/stationRegistry.ts';
import {
  parseStationId,
  parsePrecipitationIndicator,
  parseTemperatures,
  parseSection333,
  parseRainfall,
} from './synopDecoder.ts';
import type { UtcSlot } from '../engine/observationStore.ts';

/**
 * Validation severity level:
 * - 'error': Decoded data is physically invalid, malformed, or unsafe to commit.
 * - 'warning': Data is unusual, extreme, or suspicious, but potentially valid operational weather.
 */
export type ValidationSeverity = 'error' | 'warning';

/**
 * Itemized SYNOP validation issue for a station telegram.
 */
export interface SynopValidationIssue {
  readonly severity: ValidationSeverity;
  readonly stationId: string;
  readonly stationName?: string;
  readonly rawGroup?: string;
  readonly field?: string;
  readonly decodedValue?: string | number | null;
  readonly message: string;
}

/**
 * Validation result for a single station telegram.
 */
export interface TelegramValidationResult {
  readonly stationId: string;
  readonly stationName?: string;
  readonly rawTelegram: string;
  readonly issues: readonly SynopValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
}

/**
 * Comprehensive validation report for an entire SYNOP bulletin.
 */
export interface SynopBulletinValidationReport {
  readonly stationResults: readonly TelegramValidationResult[];
  readonly totalTelegrams: number;
  readonly validTelegramsCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly hasErrors: boolean;
  readonly hasWarnings: boolean;
  readonly allIssues: readonly SynopValidationIssue[];
}

/**
 * Defensible, configurable plausibility limits suitable for Central India
 * (Madhya Pradesh, Vidarbha, Chhattisgarh).
 */
export interface SynopValidationLimits {
  /** Maximum temperature physical lower bound (°C) - below this is an Error */
  tmaxMinPlausible: number;
  /** Maximum temperature physical upper bound (°C) - above this is an Error */
  tmaxMaxPlausible: number;
  /** Maximum temperature lower warning threshold (°C) - unusually low day max */
  tmaxWarningLow: number;
  /** Maximum temperature upper warning threshold (°C) - severe heatwave alert */
  tmaxWarningHigh: number;

  /** Minimum temperature physical lower bound (°C) - below this is an Error */
  tminMinPlausible: number;
  /** Minimum temperature physical upper bound (°C) - above this is an Error */
  tminMaxPlausible: number;
  /** Minimum temperature lower warning threshold (°C) - severe cold wave */
  tminWarningLow: number;
  /** Minimum temperature upper warning threshold (°C) - warm night alert */
  tminWarningHigh: number;

  /** 24-hr rainfall physical upper bound (mm) - above this is an Error */
  rainfallMaxPlausible: number;
  /** 24-hr rainfall warning threshold (mm) - extremely heavy rainfall alert */
  rainfallWarningHigh: number;
}

/**
 * Default defensible plausibility limits for Central India:
 * - Tmax: Max heat in plains reaches ~48-49°C. > 55.0°C is physically impossible (Error). > 48.0°C is extreme heat (Warning).
 *         < 10.0°C is impossible for central India daytime max (Error). < 18.0°C is unusually cold (Warning).
 * - Tmin: Winter minimums rarely drop below 2-3°C (Pachmarhi ~0-1°C). < -5.0°C is impossible for central India (Error).
 *         < 3.0°C is severe cold wave (Warning). > 42.0°C is impossible minimum (Error). > 35.0°C is very warm night (Warning).
 * - Rainfall: > 600.0 mm in 24h exceeds regional records in central India (Error). > 250.0 mm is Extremely Heavy Rain (Warning).
 */
export const DEFAULT_CENTRAL_INDIA_LIMITS: Readonly<SynopValidationLimits> = Object.freeze({
  tmaxMinPlausible: 10.0,
  tmaxMaxPlausible: 55.0,
  tmaxWarningLow: 18.0,
  tmaxWarningHigh: 48.0,

  tminMinPlausible: -5.0,
  tminMaxPlausible: 42.0,
  tminWarningLow: 3.0,
  tminWarningHigh: 35.0,

  rainfallMaxPlausible: 600.0,
  rainfallWarningHigh: 250.0,
});

/**
 * Validates a single SYNOP telegram string.
 */
export function validateSingleTelegram(
  rawTelegram: string,
  utcSlot: UtcSlot = '03Z',
  customLimits?: Partial<SynopValidationLimits>
): TelegramValidationResult {
  const limits: SynopValidationLimits = {
    ...DEFAULT_CENTRAL_INDIA_LIMITS,
    ...customLimits,
  };

  const issues: SynopValidationIssue[] = [];
  const cleaned = rawTelegram.replace(/=/g, '').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return {
      stationId: 'UNKNOWN',
      rawTelegram,
      issues: [
        {
          severity: 'error',
          stationId: 'UNKNOWN',
          message: 'Empty or blank telegram.',
        },
      ],
      errorCount: 1,
      warningCount: 0,
    };
  }

  // 1. Station ID validation
  const rawIdToken = tokens[0];
  const stationId = parseStationId(tokens);

  if (!stationId) {
    issues.push({
      severity: 'error',
      stationId: rawIdToken || 'UNKNOWN',
      rawGroup: rawIdToken,
      field: 'stationId',
      decodedValue: rawIdToken,
      message: `Invalid station identifier '${rawIdToken}'. Expected a 5-digit WMO code.`,
    });
    return {
      stationId: rawIdToken || 'UNKNOWN',
      rawTelegram,
      issues,
      errorCount: 1,
      warningCount: 0,
    };
  }

  const stationMeta = getStation(stationId);
  const stationName = stationMeta?.name;

  if (!stationMeta) {
    issues.push({
      severity: 'warning',
      stationId,
      stationName,
      rawGroup: stationId,
      field: 'stationId',
      decodedValue: stationId,
      message: `Station code ${stationId} is not in the regional master station registry.`,
    });
  }

  if (cleaned.length < 15 || tokens.length < 3) {
    issues.push({
      severity: 'error',
      stationId,
      stationName,
      field: 'telegram',
      message: `Telegram is truncated or incomplete (${tokens.length} groups found).`,
    });
    return {
      stationId,
      stationName,
      rawTelegram,
      issues,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
    };
  }

  // 2. Scan and validate individual group formatting
  let inSec333 = false;
  let inSec555 = false;
  const seenSec1Groups = new Set<string>();

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '333') {
      inSec333 = true;
      inSec555 = false;
      continue;
    }
    if (t === '555') {
      inSec555 = true;
      inSec333 = false;
      continue;
    }

    // Check token length
    if (t.length !== 5) {
      issues.push({
        severity: 'error',
        stationId,
        stationName,
        rawGroup: t,
        message: `Malformed SYNOP group '${t}'. Standard groups must be exactly 5 characters.`,
      });
      continue;
    }

    // Check for invalid temperature sign indicators in 1s_nTTT or 2s_nTTT
    if ((t.startsWith('1') || t.startsWith('2')) && !inSec555) {
      const signChar = t.charAt(1);
      if (signChar !== '0' && signChar !== '1' && signChar !== '/') {
        // In Section 1, tokens[2] is Nddff (wind group), which might start with 1 or 2.
        // But if it's token > 2, check sign
        if (i > 2) {
          issues.push({
            severity: 'error',
            stationId,
            stationName,
            rawGroup: t,
            message: `Invalid temperature sign digit '${signChar}' in group '${t}'. Must be '0' (+) or '1' (-).`,
          });
        }
      }
    }

    // Check Section placement
    if (!inSec333 && !inSec555) {
      // In Section 1 (skip token 1 which is header group i_R i_x h VV)
      if (i >= 2 && (t.startsWith('10') || t.startsWith('11'))) {
        if (seenSec1Groups.has('1')) {
          issues.push({
            severity: 'warning',
            stationId,
            stationName,
            rawGroup: t,
            message: `Multiple dry-bulb temperature groups detected in Section 1: '${t}'.`,
          });
        }
        seenSec1Groups.add('1');
      }
      if (t.startsWith('0') && i > 3) {
        // Section 555 rainfall group placed before 555 marker
        issues.push({
          severity: 'warning',
          stationId,
          stationName,
          rawGroup: t,
          message: `Group '${t}' resembles Section 555 rainfall group (0RRRR) but appears before the 555 marker.`,
        });
      }
    }
  }

  // 3. Temperature validation: Dry-Bulb & Dew-Point
  const { dryBulb, dewPoint } = parseTemperatures(tokens);

  if (dryBulb !== null && dryBulb !== undefined) {
    if (dryBulb < limits.tminMinPlausible || dryBulb > limits.tmaxMaxPlausible) {
      issues.push({
        severity: 'error',
        stationId,
        stationName,
        field: 'dryBulb',
        decodedValue: `${dryBulb}°C`,
        message: `Dry-bulb temperature (${dryBulb}°C) exceeds plausible regional limits (${limits.tminMinPlausible}°C to ${limits.tmaxMaxPlausible}°C).`,
      });
    }
  }

  if (dewPoint !== null && dewPoint !== undefined) {
    if (dewPoint < limits.tminMinPlausible || dewPoint > 38.0) {
      issues.push({
        severity: 'error',
        stationId,
        stationName,
        field: 'dewPoint',
        decodedValue: `${dewPoint}°C`,
        message: `Dew-point temperature (${dewPoint}°C) is implausible.`,
      });
    }
  }

  // Physical Law: Dew Point cannot exceed Dry Bulb (super-saturation in screen)
  if (
    dryBulb !== null &&
    dewPoint !== null &&
    dryBulb !== undefined &&
    dewPoint !== undefined
  ) {
    if (dewPoint > dryBulb + 0.1) {
      issues.push({
        severity: 'error',
        stationId,
        stationName,
        field: 'dewPoint',
        decodedValue: `TT: ${dryBulb}°C, Td: ${dewPoint}°C`,
        message: `Physical conflict: Dew point (${dewPoint}°C) exceeds dry-bulb temperature (${dryBulb}°C).`,
      });
    }
  }

  // 4. Section 333 Temperature validation (Tmax & Tmin)
  const { tmaxPreviousDay, tmin } = parseSection333(tokens);

  if (utcSlot === '03Z') {
    // Current-day Tmin
    if (tmin !== null && tmin !== undefined) {
      if (tmin < limits.tminMinPlausible || tmin > limits.tminMaxPlausible) {
        issues.push({
          severity: 'error',
          stationId,
          stationName,
          field: 'tmin',
          decodedValue: `${tmin}°C`,
          message: `Minimum temperature (${tmin}°C) exceeds physical plausibility range (${limits.tminMinPlausible}°C to ${limits.tmaxMaxPlausible}°C).`,
        });
      } else if (tmin < limits.tminWarningLow) {
        issues.push({
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmin',
          decodedValue: `${tmin}°C`,
          message: `Severe low minimum temperature (${tmin}°C). Verify cold wave conditions.`,
        });
      } else if (tmin > limits.tminWarningHigh) {
        issues.push({
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmin',
          decodedValue: `${tmin}°C`,
          message: `Unusually warm minimum temperature (${tmin}°C). Verify observation.`,
        });
      }
    } else {
      // 03Z telegram missing Tmin
      issues.push({
        severity: 'warning',
        stationId,
        stationName,
        field: 'tmin',
        message: 'Section 333 minimum temperature group (2s_nTnTnTn) not found in 03 UTC telegram.',
      });
    }

    // Previous-day Tmax from 03Z Section 333
    if (tmaxPreviousDay !== null && tmaxPreviousDay !== undefined) {
      if (tmaxPreviousDay < limits.tmaxMinPlausible || tmaxPreviousDay > limits.tmaxMaxPlausible) {
        issues.push({
          severity: 'error',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmaxPreviousDay}°C`,
          message: `Previous day maximum temperature (${tmaxPreviousDay}°C) exceeds physical plausibility range (${limits.tmaxMinPlausible}°C to ${limits.tmaxMaxPlausible}°C).`,
        });
      } else if (tmaxPreviousDay > limits.tmaxWarningHigh) {
        issues.push({
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmaxPreviousDay}°C`,
          message: `Severe high maximum temperature (${tmaxPreviousDay}°C). Verify extreme heatwave.`,
        });
      } else if (tmaxPreviousDay < limits.tmaxWarningLow) {
        issues.push({
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmaxPreviousDay}°C`,
          message: `Unusually cold maximum temperature (${tmaxPreviousDay}°C). Verify winter day conditions.`,
        });
      }
    }

    // Inverted temperature relationship: Tmin cannot be greater than Tmax
    if (
      tmin !== null &&
      tmaxPreviousDay !== null &&
      tmin !== undefined &&
      tmaxPreviousDay !== undefined
    ) {
      if (tmin > tmaxPreviousDay) {
        issues.push({
          severity: 'error',
          stationId,
          stationName,
          field: 'temperature_relationship',
          decodedValue: `Tmin: ${tmin}°C > Tmax: ${tmaxPreviousDay}°C`,
          message: `Physical conflict: Minimum temperature (${tmin}°C) is greater than Maximum temperature (${tmaxPreviousDay}°C). Check for swapped or misassigned groups.`,
        });
      }
    }
  } else {
    // 12 UTC bulletin: Section 333 group 1s_nTxTxTx reports today's Tmax
    const tmax12Z = tmaxPreviousDay;
    if (tmax12Z !== null && tmax12Z !== undefined) {
      if (tmax12Z < limits.tmaxMinPlausible || tmax12Z > limits.tmaxMaxPlausible) {
        issues.push({
          severity: 'error',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmax12Z}°C`,
          message: `Maximum temperature (${tmax12Z}°C) exceeds physical plausibility range (${limits.tmaxMinPlausible}°C to ${limits.tmaxMaxPlausible}°C).`,
        });
      } else if (tmax12Z > limits.tmaxWarningHigh) {
        issues.push({
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmax12Z}°C`,
          message: `Severe high maximum temperature (${tmax12Z}°C). Verify extreme heatwave.`,
        });
      } else if (tmax12Z < limits.tmaxWarningLow) {
        issues.push({
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmax12Z}°C`,
          message: `Unusually cold maximum temperature (${tmax12Z}°C). Verify observation.`,
        });
      }
    }
  }

  // 5. Rainfall validation
  const precipIndicator = parsePrecipitationIndicator(tokens);
  const rainfall = parseRainfall(tokens, precipIndicator);

  if (rainfall !== null && rainfall !== undefined) {
    if (rainfall < 0) {
      issues.push({
        severity: 'error',
        stationId,
        stationName,
        field: 'rainfall',
        decodedValue: `${rainfall} mm`,
        message: `Negative rainfall amount (${rainfall} mm) is invalid.`,
      });
    } else if (rainfall > limits.rainfallMaxPlausible) {
      issues.push({
        severity: 'error',
        stationId,
        stationName,
        field: 'rainfall',
        decodedValue: `${rainfall} mm`,
        message: `Rainfall amount (${rainfall} mm) exceeds plausible regional limit (${limits.rainfallMaxPlausible} mm). Possible misplaced decimal or group error.`,
      });
    } else if (rainfall > limits.rainfallWarningHigh) {
      issues.push({
        severity: 'warning',
        stationId,
        stationName,
        field: 'rainfall',
        decodedValue: `${rainfall} mm`,
        message: `Extremely heavy rainfall reported (${rainfall} mm). Verify exceptional weather event.`,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    stationId,
    stationName,
    rawTelegram,
    issues,
    errorCount,
    warningCount,
  };
}

/**
 * Validates an entire multi-station SYNOP bulletin.
 * Performs syntax checks, checks for duplicates, and validates meteorological plausibility.
 */
export function validateSynopBulletin(
  rawBulletin: string,
  utcSlot: UtcSlot = '03Z',
  customLimits?: Partial<SynopValidationLimits>
): SynopBulletinValidationReport {
  if (!rawBulletin || typeof rawBulletin !== 'string' || !rawBulletin.trim()) {
    return {
      stationResults: [],
      totalTelegrams: 0,
      validTelegramsCount: 0,
      errorCount: 0,
      warningCount: 0,
      hasErrors: false,
      hasWarnings: false,
      allIssues: [],
    };
  }

  const normalized = rawBulletin.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let segments = normalized.split('=');
  if (segments.length === 1 && !rawBulletin.includes('=')) {
    segments = [rawBulletin];
  }

  const stationResults: TelegramValidationResult[] = [];
  const seenStationIds = new Set<string>();
  const duplicateStationIssues: SynopValidationIssue[] = [];

  for (let segment of segments) {
    segment = segment.trim();
    if (!segment) continue;

    // Strip bulletin header
    segment = segment.replace(/^AAXX\s+\d+(?:\s+(?:COR|AMD))?\s*/i, '');
    if (segment.length < 10) continue;

    const res = validateSingleTelegram(segment, utcSlot, customLimits);

    // Check for duplicate station codes within the same bulletin
    if (res.stationId && res.stationId !== 'UNKNOWN') {
      if (seenStationIds.has(res.stationId)) {
        const issue: SynopValidationIssue = {
          severity: 'warning',
          stationId: res.stationId,
          stationName: res.stationName,
          rawGroup: res.stationId,
          field: 'stationId',
          message: `Duplicate station report for ${res.stationId} (${res.stationName || 'Unknown'}) in bulletin. Later telegram may overwrite prior values.`,
        };
        duplicateStationIssues.push(issue);
        // Add issue to this station result
        const updatedIssues = [...res.issues, issue];
        stationResults.push({
          ...res,
          issues: updatedIssues,
          warningCount: res.warningCount + 1,
        });
      } else {
        seenStationIds.add(res.stationId);
        stationResults.push(res);
      }
    } else {
      stationResults.push(res);
    }
  }

  const allIssues: SynopValidationIssue[] = stationResults.flatMap((r) => [...r.issues]);
  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
  const validTelegramsCount = stationResults.filter((r) => r.errorCount === 0).length;

  return {
    stationResults,
    totalTelegrams: stationResults.length,
    validTelegramsCount,
    errorCount,
    warningCount,
    hasErrors: errorCount > 0,
    hasWarnings: warningCount > 0,
    allIssues,
  };
}
