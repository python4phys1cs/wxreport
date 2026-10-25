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
  calculateLegacyRelativeHumidity,
} from './synopDecoder.ts';
import type { UtcSlot } from '../engine/observationStore.ts';

/**
 * Validation severity level:
 * - 'error': Decoded data is physically invalid, malformed, or violates IMD code specifications.
 * - 'warning': Data is unusual, extreme, or suspicious, but potentially valid operational weather.
 */
export type ValidationSeverity = 'error' | 'warning';

/**
 * Standard IMD inland station validation rule categories.
 */
export type SynopRuleCategory =
  | 'Structural'
  | 'Range'
  | 'Meteorological consistency'
  | 'Coding'
  | 'Inland-Station Rules'
  | 'Plausibility';

/**
 * Itemized SYNOP validation issue for a station telegram.
 */
export interface SynopValidationIssue {
  readonly ruleId?: string;
  readonly category?: SynopRuleCategory;
  readonly severity: ValidationSeverity;
  readonly stationId: string;
  readonly stationName?: string;
  readonly rawGroup?: string;
  readonly field?: string;
  readonly decodedValue?: string | number | null;
  readonly message: string;
}

/**
 * Machine-readable rule definition contract as specified in Section 19 of the
 * IMD Inland Station Validation Guide.
 */
export interface SynopValidationRuleDefinition {
  readonly ruleId: string;
  readonly category: SynopRuleCategory;
  readonly name: string;
  readonly severity: ValidationSeverity;
  readonly description: string;
  readonly reference?: string;
}

/**
 * Authoritative Rule Catalogue for IMD Inland Stations based on Weather Code (1982/2005).
 */
export const SYNOP_VALIDATION_RULES: readonly SynopValidationRuleDefinition[] = Object.freeze([
  {
    ruleId: 'STR-001',
    category: 'Structural',
    name: 'Five-Character Group Requirement',
    severity: 'error',
    description: 'Every parsed standard SYNOP group must be exactly 5 characters long.',
    reference: 'IMD Weather Code 1982/2005 Section 1, Page 5',
  },
  {
    ruleId: 'STR-002',
    category: 'Structural',
    name: 'No Marine Groups for Inland Stations',
    severity: 'error',
    description: 'Section 2 (Marine Data: 222//) is strictly forbidden for inland stations.',
    reference: 'IMD Weather Code 1982/2005 Explanatory Notes, Page 7, Item 7(A)',
  },
  {
    ruleId: 'RNG-001',
    category: 'Range',
    name: 'Valid Cloud Amounts',
    severity: 'error',
    description: 'Cloud cover amounts (N, Nh, Ns) must be 0-9 or /.',
    reference: 'IMD Weather Code 1982/2005 Code 20, Page 27',
  },
  {
    ruleId: 'CLD-001',
    category: 'Meteorological consistency',
    name: 'Total Cloud Cover vs. Low/Mid Cloud Cover',
    severity: 'error',
    description: 'Low/mid cloud amount (Nh) cannot mathematically exceed total sky cloud cover (N).',
    reference: 'IMD Weather Code 1982/2005 Code 20 Notes (G), Page 27',
  },
  {
    ruleId: 'WND-001',
    category: 'Meteorological consistency',
    name: 'Calm Wind Zero Rule',
    severity: 'error',
    description: 'During calm wind, both direction and speed must be 00 (dd=00 <=> ff=00).',
    reference: 'IMD Weather Code 1982/2005 Code 8 Page 18, Code 12 Page 21',
  },
  {
    ruleId: 'TEM-001',
    category: 'Meteorological consistency',
    name: 'Temperature Consistency and Bounds',
    severity: 'error',
    description: 'Dew point cannot exceed dry bulb (Td <= T); valid signs 0/1; Tmin <= Tmax; 12Z Tx >= T.',
    reference: 'IMD Weather Code 1982/2005 Codebook pg 27 (Code 24)',
  },
  {
    ruleId: 'RAI-001',
    category: 'Meteorological consistency',
    name: 'Precipitation Group Omission Logic',
    severity: 'error',
    description: 'Group 6 must be omitted when iR=3/4, and present when iR=1/2.',
    reference: 'IMD Weather Code 1982/2005 Code 17 Page 26, Note 12 Page 8',
  },
  {
    ruleId: 'RAI-002',
    category: 'Coding',
    name: 'Fixed Precipitation Period',
    severity: 'error',
    description: 'Precipitation period indicator tR must be coded as "/" for Indian stations.',
    reference: 'IMD Weather Code 1982/2005 Explanatory Note 12, Page 8',
  },
  {
    ruleId: 'PRE-001',
    category: 'Coding',
    name: 'Mutually Exclusive 24-hour Pressure Change',
    severity: 'error',
    description: 'A station cannot report both pressure rise (58) and pressure fall (59) in Section 3.',
    reference: 'IMD Weather Code 1982/2005 Explanatory Notes 11(a) and 11(b), Page 8',
  },
  {
    ruleId: 'WX-001',
    category: 'Coding',
    name: 'Weather Group Omission & Past Weather Sequence',
    severity: 'error',
    description: 'Group 7 omitted when weather is not significant; Past weather W2 must be <= W1.',
    reference: 'IMD Weather Code 1982/2005 Explanatory Note 5 Page 7, Code 26 Page 34',
  },
  {
    ruleId: 'WX-002',
    category: 'Meteorological consistency',
    name: 'Fog and Visibility Consistency',
    severity: 'warning',
    description: 'Fog (ww=41-49) requires visibility < 1.0 km.',
    reference: 'IMD Weather Code 1982/2005 Code 27 Notes D(b.ii) and F, Page 40/41',
  },
  {
    ruleId: 'SQU-001',
    category: 'Inland-Station Rules',
    name: 'Departmental vs Non-Departmental Squall Reporting',
    severity: 'error',
    description: 'Full-time IMD stations must report squalls using 9SpSpSpSp group, not 2DqFqqqt.',
    reference: 'IMD Weather Code 1982/2005 Explanatory Note 17, Page 9',
  },
  {
    ruleId: 'PLU-001',
    category: 'Plausibility',
    name: 'Regional Climatological Plausibility',
    severity: 'error',
    description: 'Enforces Central India physical bounds and large departure/change warnings.',
    reference: 'Regional Climatological Reference Limits (Central India)',
  },
]);

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

export interface ValidationContext {
  reportingDate?: string;
  normalProvider?: {
    getNormalsForDate?: (date: string, stationId: string) => any;
  };
  observationStore?: {
    getStationObservation?: (stationId: string, date?: string) => any;
  };
}

/**
 * Validates a single SYNOP telegram string according to IMD Inland Station standards.
 */
export function validateSingleTelegram(
  rawTelegram: string,
  utcSlot: UtcSlot = '03Z',
  customLimits?: Partial<SynopValidationLimits>,
  context?: ValidationContext
): TelegramValidationResult {
  const limits: SynopValidationLimits = {
    ...DEFAULT_CENTRAL_INDIA_LIMITS,
    ...customLimits,
  };

  const issues: SynopValidationIssue[] = [];
  const cleaned = rawTelegram.replace(/=/g, '').trim();
  let rawTokens = cleaned.split(/\s+/).filter(Boolean);

  if (rawTokens.length === 0) {
    return {
      stationId: 'UNKNOWN',
      rawTelegram,
      issues: [
        {
          ruleId: 'STR-001',
          category: 'Structural',
          severity: 'error',
          stationId: 'UNKNOWN',
          message: 'Empty or blank telegram.',
        },
      ],
      errorCount: 1,
      warningCount: 0,
    };
  }

  // Strip section 0 indicators if present at start (AAXX YYGGiw)
  if (rawTokens[0] === 'AAXX') {
    rawTokens = rawTokens.slice(1);
    if (rawTokens.length > 0 && /^\d{5}$/.test(rawTokens[0])) {
      // Could be YYGGiw (e.g. 16034) if next token is also a 5-digit station ID
      if (rawTokens.length > 1 && /^\d{5}$/.test(rawTokens[1])) {
        rawTokens = rawTokens.slice(1);
      }
    }
  } else if (rawTokens.length > 1 && /^\d{5}$/.test(rawTokens[0]) && /^\d{5}$/.test(rawTokens[1]) && getStation(rawTokens[1])) {
    // Leading YYGGiw followed by recognizable station ID
    rawTokens = rawTokens.slice(1);
  }

  const tokens = rawTokens;

  // 1. Station ID validation
  const rawIdToken = tokens[0];
  const stationId = parseStationId(tokens);

  if (!stationId) {
    issues.push({
      ruleId: 'STR-001',
      category: 'Structural',
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
      ruleId: 'STR-001',
      category: 'Structural',
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
      ruleId: 'STR-001',
      category: 'Structural',
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

  // 2. Section Partitioning & Structural Checks
  let currentSection: 1 | 2 | 3 | 5 = 1;
  const sec1Tokens: string[] = [];
  const sec2Tokens: string[] = [];
  const sec3Tokens: string[] = [];
  const sec5Tokens: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '222//' || t === '222' || t.startsWith('222/')) {
      currentSection = 2;
      sec2Tokens.push(t);
      continue;
    }
    if (t === '333') {
      currentSection = 3;
      continue;
    }
    if (t === '555') {
      currentSection = 5;
      continue;
    }

    if (currentSection === 1) sec1Tokens.push(t);
    else if (currentSection === 2) sec2Tokens.push(t);
    else if (currentSection === 3) sec3Tokens.push(t);
    else if (currentSection === 5) sec5Tokens.push(t);
  }

  // Rule STR-002: Coastal Section Exclusion (Section 2 strictly forbidden for inland stations)
  if (sec2Tokens.length > 0 || tokens.some((t) => t === '222//' || t.startsWith('222/'))) {
    issues.push({
      ruleId: 'STR-002',
      category: 'Structural',
      severity: 'error',
      stationId,
      stationName,
      field: 'section2',
      rawGroup: '222//',
      message: 'Section 2 (Marine data: 222//) is forbidden for inland stations.',
    });
  }

  // Rule STR-001: Validate Exact Group Length (Every parsed group must be 5 chars)
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '333' || t === '555' || t === '222') continue;

    if (t.length !== 5) {
      issues.push({
        ruleId: 'STR-001',
        category: 'Structural',
        severity: 'error',
        stationId,
        stationName,
        rawGroup: t,
        message: `Group '${t}' is malformed. Must be exactly 5 characters.`,
      });
      continue;
    }

    // Check character validity (SYNOP groups must contain only numerals and '/')
    if (!/^[\d/]{5}$/.test(t)) {
      issues.push({
        ruleId: 'STR-001',
        category: 'Structural',
        severity: 'error',
        stationId,
        stationName,
        rawGroup: t,
        message: `Group '${t}' contains invalid characters. SYNOP groups must contain only digits or '/'.`,
      });
    }
  }

  // 3. Header Group (iR ix h VV) & Wind Group (N dd ff)
  const headerToken = tokens[1];
  const windToken = tokens.length > 2 ? tokens[2] : null;

  let iR: string | null = null;
  let ix: string | null = null;
  let vvStr: string | null = null;

  if (headerToken && headerToken.length === 5) {
    iR = headerToken.charAt(0);
    ix = headerToken.charAt(1);
    vvStr = headerToken.substring(3, 5);
  }

  let totalCloudN: string | null = null;
  if (windToken && windToken.length === 5) {
    totalCloudN = windToken.charAt(0);

    // Rule RNG-001: Cloud Amount Indicator Limit for N in Nddff
    if (!['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/'].includes(totalCloudN)) {
      issues.push({
        ruleId: 'RNG-001',
        category: 'Range',
        severity: 'error',
        stationId,
        stationName,
        rawGroup: windToken,
        field: 'N',
        decodedValue: totalCloudN,
        message: `Invalid cloud amount encoded in group '${windToken}'. Must be 0-9 or /.`,
      });
    }

    // Rule WND-001: Calm Wind Consistency
    const dd = windToken.substring(1, 3);
    const ff = windToken.substring(3, 5);
    if (/^\d{2}$/.test(dd) && /^\d{2}$/.test(ff)) {
      const isCalmDirection = dd === '00';
      const isCalmSpeed = ff === '00';
      const isVariable = dd === '99';

      if (isCalmDirection && !isCalmSpeed) {
        issues.push({
          ruleId: 'WND-001',
          category: 'Meteorological consistency',
          severity: 'error',
          stationId,
          stationName,
          rawGroup: windToken,
          field: 'wind',
          decodedValue: `dd=${dd}, ff=${ff}`,
          message: `Inconsistent calm wind report in group '${windToken}'. If dd=00, ff must be 00, and vice versa.`,
        });
      } else if (isCalmSpeed && !isCalmDirection && !isVariable) {
        issues.push({
          ruleId: 'WND-001',
          category: 'Meteorological consistency',
          severity: 'error',
          stationId,
          stationName,
          rawGroup: windToken,
          field: 'wind',
          decodedValue: `dd=${dd}, ff=${ff}`,
          message: `Inconsistent calm wind report in group '${windToken}'. If dd=00, ff must be 00, and vice versa.`,
        });
      }
    }
  }

  // 4. Cloud Amount Checks: Rule CLD-001 & Rule RNG-001 (Section 1 8NhCLCMCH & Section 3 8NsChshs)
  const sec1Group8 = sec1Tokens.slice(2).find((t) => t.length === 5 && t.startsWith('8'));
  if (sec1Group8) {
    const Nh = sec1Group8.charAt(1);
    if (!['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/'].includes(Nh)) {
      issues.push({
        ruleId: 'RNG-001',
        category: 'Range',
        severity: 'error',
        stationId,
        stationName,
        rawGroup: sec1Group8,
        field: 'cloudAmountNh',
        decodedValue: Nh,
        message: `Invalid cloud amount encoded in group '${sec1Group8}'. Must be 0-9 or /.`,
      });
    } else if (
      totalCloudN !== null &&
      /^[0-8]$/.test(totalCloudN) &&
      /^[0-8]$/.test(Nh) &&
      totalCloudN !== '9'
    ) {
      const nVal = parseInt(totalCloudN, 10);
      const nhVal = parseInt(Nh, 10);
      if (nhVal > nVal) {
        issues.push({
          ruleId: 'CLD-001',
          category: 'Meteorological consistency',
          severity: 'error',
          stationId,
          stationName,
          rawGroup: sec1Group8,
          field: 'cloudAmountNh',
          decodedValue: `N=${nVal}, Nh=${nhVal}`,
          message: `Low/mid cloud amount (${nhVal} oktas) exceeds total cloud cover (${nVal} oktas); Nh cannot exceed N.`,
        });
      }
    }
  }

  // Check Section 3 significant cloud layers (8NsChshs)
  for (const t of sec3Tokens) {
    if (t.length === 5 && t.startsWith('8')) {
      const Ns = t.charAt(1);
      if (!['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/'].includes(Ns)) {
        issues.push({
          ruleId: 'RNG-001',
          category: 'Range',
          severity: 'error',
          stationId,
          stationName,
          rawGroup: t,
          field: 'cloudAmountNs',
          decodedValue: Ns,
          message: `Invalid cloud amount encoded in group '${t}'. Must be 0-9 or /.`,
        });
      }
    }
  }

  // 5. Temperature Validation: Rule TEM-001 & Physical Checks
  // Sign indicators in 1snTTT, 2snTdTdTd, 1snTxTxTx, 2snTnTnTn
  for (const t of [...sec1Tokens, ...sec3Tokens]) {
    if (t.length === 5 && (t.startsWith('1') || t.startsWith('2'))) {
      // In Section 1, tokens[2] is Nddff which might start with 1 or 2
      if (t === windToken) continue;
      const signChar = t.charAt(1);
      if (signChar !== '0' && signChar !== '1' && signChar !== '/') {
        issues.push({
          ruleId: 'TEM-001',
          category: 'Coding',
          severity: 'error',
          stationId,
          stationName,
          rawGroup: t,
          message: `Invalid temperature sign digit '${signChar}' in group '${t}'. Must be '0' (+) or '1' (-).`,
        });
      }
    }
  }

  // Decode Dry-Bulb & Dew-Point
  const { dryBulb, dewPoint } = parseTemperatures(tokens);

  if (dryBulb !== null && dryBulb !== undefined) {
    if (dryBulb < limits.tminMinPlausible || dryBulb > limits.tmaxMaxPlausible) {
      issues.push({
        ruleId: 'PLU-001',
        category: 'Plausibility',
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
        ruleId: 'PLU-001',
        category: 'Plausibility',
        severity: 'error',
        stationId,
        stationName,
        field: 'dewPoint',
        decodedValue: `${dewPoint}°C`,
        message: `Dew-point temperature (${dewPoint}°C) is implausible.`,
      });
    }
  }

  // Rule TEM-001: Dew Point cannot exceed Dry Bulb (super-saturation in screen)
  if (
    dryBulb !== null &&
    dewPoint !== null &&
    dryBulb !== undefined &&
    dewPoint !== undefined
  ) {
    if (dewPoint > dryBulb + 0.1) {
      issues.push({
        ruleId: 'TEM-001',
        category: 'Meteorological consistency',
        severity: 'error',
        stationId,
        stationName,
        field: 'dewPoint',
        decodedValue: `TT: ${dryBulb}°C, Td: ${dewPoint}°C`,
        message: `Dew point (${dewPoint}°C) exceeds dry-bulb temperature (${dryBulb}°C); physically impossible super-saturation in screen.`,
      });
    }

    // Relative humidity check
    const rh = calculateLegacyRelativeHumidity(dryBulb, dewPoint);
    if (rh !== null && (rh > 100 || rh < 0)) {
      issues.push({
        ruleId: 'TEM-001',
        category: 'Meteorological consistency',
        severity: 'error',
        stationId,
        stationName,
        field: 'relativeHumidity',
        decodedValue: `${rh}%`,
        message: `Calculated relative humidity (${rh}%) exceeds physical limit of 100%. Check dry-bulb (${dryBulb}°C) or dew-point (${dewPoint}°C).`,
      });
    }
  }

  // 6. Section 333 Temperature validation (Tmax & Tmin)
  const { tmaxPreviousDay, tmin } = parseSection333(tokens);

  if (utcSlot === '03Z') {
    // Current-day Tmin
    if (tmin !== null && tmin !== undefined) {
      if (tmin < limits.tminMinPlausible || tmin > limits.tminMaxPlausible) {
        issues.push({
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'error',
          stationId,
          stationName,
          field: 'tmin',
          decodedValue: `${tmin}°C`,
          message: `Minimum temperature (${tmin}°C) exceeds physical plausibility range (${limits.tminMinPlausible}°C to ${limits.tmaxMaxPlausible}°C).`,
        });
      } else if (tmin < limits.tminWarningLow) {
        issues.push({
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmin',
          decodedValue: `${tmin}°C`,
          message: `Severe low minimum temperature (${tmin}°C). Verify cold wave conditions.`,
        });
      } else if (tmin > limits.tminWarningHigh) {
        issues.push({
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmin',
          decodedValue: `${tmin}°C`,
          message: `Unusually warm minimum temperature (${tmin}°C). Verify observation.`,
        });
      }
    } else {
      issues.push({
        ruleId: 'TEM-001',
        category: 'Coding',
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
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'error',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmaxPreviousDay}°C`,
          message: `Previous day maximum temperature (${tmaxPreviousDay}°C) exceeds physical plausibility range (${limits.tmaxMinPlausible}°C to ${limits.tmaxMaxPlausible}°C).`,
        });
      } else if (tmaxPreviousDay > limits.tmaxWarningHigh) {
        issues.push({
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmaxPreviousDay}°C`,
          message: `Severe high maximum temperature (${tmaxPreviousDay}°C). Verify extreme heatwave.`,
        });
      } else if (tmaxPreviousDay < limits.tmaxWarningLow) {
        issues.push({
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmaxPreviousDay}°C`,
          message: `Unusually cold maximum temperature (${tmaxPreviousDay}°C). Verify winter day conditions.`,
        });
      }
    }

    // Rule TEM-001: Inverted temperature relationship: Tmin cannot be greater than Tmax
    if (
      tmin !== null &&
      tmaxPreviousDay !== null &&
      tmin !== undefined &&
      tmaxPreviousDay !== undefined
    ) {
      if (tmin > tmaxPreviousDay) {
        issues.push({
          ruleId: 'TEM-001',
          category: 'Meteorological consistency',
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
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'error',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmax12Z}°C`,
          message: `Maximum temperature (${tmax12Z}°C) exceeds physical plausibility range (${limits.tmaxMinPlausible}°C to ${limits.tmaxMaxPlausible}°C).`,
        });
      } else if (tmax12Z > limits.tmaxWarningHigh) {
        issues.push({
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmax12Z}°C`,
          message: `Severe high maximum temperature (${tmax12Z}°C). Verify extreme heatwave.`,
        });
      } else if (tmax12Z < limits.tmaxWarningLow) {
        issues.push({
          ruleId: 'PLU-001',
          category: 'Plausibility',
          severity: 'warning',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `${tmax12Z}°C`,
          message: `Unusually cold maximum temperature (${tmax12Z}°C). Verify observation.`,
        });
      }

      // Rule TEM-001: 1200 GMT Tx cannot be less than 1200 GMT Dry Bulb (T)
      if (dryBulb !== null && dryBulb !== undefined && tmax12Z < dryBulb - 0.1) {
        issues.push({
          ruleId: 'TEM-001',
          category: 'Meteorological consistency',
          severity: 'error',
          stationId,
          stationName,
          field: 'tmax',
          decodedValue: `Tx: ${tmax12Z}°C < TT: ${dryBulb}°C`,
          message: `Maximum temperature (${tmax12Z}°C) cannot be lower than current dry-bulb temperature (${dryBulb}°C).`,
        });
      }
    }

    // Tmin should not be reported in 12Z Section 333
    if (tmin !== null && tmin !== undefined) {
      issues.push({
        ruleId: 'TEM-001',
        category: 'Coding',
        severity: 'warning',
        stationId,
        stationName,
        field: 'tmin',
        decodedValue: `${tmin}°C`,
        message: 'Section 333 minimum temperature group (2s_nTnTnTn) should only be reported at 0300 GMT.',
      });
    }
  }

  // 7. Weather Group 7 Validation: Rule WX-001 & Rule WX-002
  const sec1Group7 = sec1Tokens.slice(2).find((t) => t.length === 5 && t.startsWith('7'));
  if (sec1Group7) {
    const wwStr = sec1Group7.substring(1, 3);
    const w1Str = sec1Group7.charAt(3);
    const w2Str = sec1Group7.charAt(4);

    if (/^\d{2}$/.test(wwStr)) {
      const ww = parseInt(wwStr, 10);
      const w1 = parseInt(w1Str, 10);
      const w2 = parseInt(w2Str, 10);

      // Rule WX-001: Omission of Insignificant Weather (ww in [00..03], W1,W2 in [0..2])
      const isWwInsignificant = ww >= 0 && ww <= 3;
      const isW1Insignificant = isNaN(w1) || (w1 >= 0 && w1 <= 2);
      const isW2Insignificant = isNaN(w2) || (w2 >= 0 && w2 <= 2);

      if (isWwInsignificant && isW1Insignificant && isW2Insignificant) {
        issues.push({
          ruleId: 'WX-001',
          category: 'Coding',
          severity: 'error',
          stationId,
          stationName,
          rawGroup: sec1Group7,
          field: 'weather',
          decodedValue: `ww=${wwStr}, W1=${w1Str}, W2=${w2Str}`,
          message: `Group 7 reported with insignificant weather (ww=${wwStr}, W1W2=${w1Str}${w2Str}). Group 7 must be omitted when ww in [00-03] and past weather is not significant.`,
        });
      }

      // Rule WX-001: Past Weather Sequence (W2 <= W1)
      if (!isNaN(w1) && !isNaN(w2) && w2 > w1) {
        issues.push({
          ruleId: 'WX-001',
          category: 'Coding',
          severity: 'error',
          stationId,
          stationName,
          rawGroup: sec1Group7,
          field: 'weather_past',
          decodedValue: `W1=${w1}, W2=${w2}`,
          message: `Past weather W2 (${w2}) cannot exceed W1 (${w1}); W1 >= W2 is required.`,
        });
      }

      // Rule WX-002: Fog and Visibility Consistency (ww in 41-49 requires VV < 1.0 km)
      if (ww >= 41 && ww <= 49 && vvStr && /^\d{2}$/.test(vvStr)) {
        const vvNum = parseInt(vvStr, 10);
        // In Code 25: 10-89 is >= 1.0km, 94-99 is >= 1.0km
        const isVisibility1kmOrMore = (vvNum >= 10 && vvNum < 90) || vvNum >= 94;
        if (isVisibility1kmOrMore) {
          const visKm =
            vvNum < 90
              ? (vvNum / 10).toFixed(1).replace(/\.0$/, '')
              : vvNum === 94
                ? '1'
                : vvNum === 95
                  ? '2'
                  : vvNum === 96
                    ? '4'
                    : '>=1';
          issues.push({
            ruleId: 'WX-002',
            category: 'Meteorological consistency',
            severity: 'warning',
            stationId,
            stationName,
            rawGroup: sec1Group7,
            field: 'visibility_fog',
            decodedValue: `ww=${wwStr}, VV=${vvStr}`,
            message: `Fog (ww=${wwStr}) is reported but surface visibility is ${visKm} km (VV=${vvStr} >= 1.0 km).`,
          });
        }
      }
    }
  }

  // 8. Rainfall Validation: Rule RAI-001, Rule RAI-002 & Regional Limits
  const precipIndicator = parsePrecipitationIndicator(tokens);
  const rainfall = parseRainfall(tokens, precipIndicator);

  // Check presence of Section 1 or Section 3 Group 6 (6RRRtR)
  const group6 = [...sec1Tokens.slice(2), ...sec3Tokens].find((t) => t.length === 5 && t.startsWith('6'));
  const hasSec5Rainfall = sec5Tokens.some((t) => t.length === 5 && t.startsWith('0'));

  // Rule RAI-001: Precipitation Group Omission Logic
  if (iR !== null) {
    if ((iR === '3' || iR === '4') && group6) {
      issues.push({
        ruleId: 'RAI-001',
        category: 'Meteorological consistency',
        severity: 'error',
        stationId,
        stationName,
        rawGroup: group6,
        field: 'rainfall',
        decodedValue: `iR=${iR}`,
        message: `Group 6 must be omitted when iR=3 or 4 (iR=${iR} indicates no precipitation, but group '${group6}' is present).`,
      });
    }
  }

  // Rule RAI-002: Precipitation Period (tR) Fixed Value
  if (group6) {
    const tR = group6.charAt(4);
    if (tR !== '/' && tR !== '') {
      issues.push({
        ruleId: 'RAI-002',
        category: 'Coding',
        severity: 'error',
        stationId,
        stationName,
        rawGroup: group6,
        field: 'rainfallPeriod',
        decodedValue: `tR=${tR}`,
        message: "tR must be coded as solidus '/' for Indian stations as precipitation is always since 0300 GMT.",
      });
    }
  }

  if (rainfall !== null && rainfall !== undefined) {
    if (rainfall < 0) {
      issues.push({
        ruleId: 'PLU-001',
        category: 'Plausibility',
        severity: 'error',
        stationId,
        stationName,
        field: 'rainfall',
        decodedValue: `${rainfall} mm`,
        message: `Negative rainfall amount (${rainfall} mm) is invalid.`,
      });
    } else if (rainfall > limits.rainfallMaxPlausible) {
      issues.push({
        ruleId: 'PLU-001',
        category: 'Plausibility',
        severity: 'error',
        stationId,
        stationName,
        field: 'rainfall',
        decodedValue: `${rainfall} mm`,
        message: `Rainfall amount (${rainfall} mm) exceeds plausible regional limit (${limits.rainfallMaxPlausible} mm). Possible misplaced decimal or group error.`,
      });
    } else if (rainfall > limits.rainfallWarningHigh) {
      issues.push({
        ruleId: 'PLU-001',
        category: 'Plausibility',
        severity: 'warning',
        stationId,
        stationName,
        field: 'rainfall',
        decodedValue: `${rainfall} mm`,
        message: `Extremely heavy rainfall reported (${rainfall} mm). Verify exceptional weather event.`,
      });
    }
  }

  // 9. Pressure Validation: Rule PRE-001 (58 and 59 mutually exclusive in Section 3)
  const has58 = sec3Tokens.some((t) => t.length === 5 && t.startsWith('58'));
  const has59 = sec3Tokens.some((t) => t.length === 5 && t.startsWith('59'));
  if (has58 && has59) {
    issues.push({
      ruleId: 'PRE-001',
      category: 'Coding',
      severity: 'error',
      stationId,
      stationName,
      field: 'pressure_tendency',
      message: 'Report contains both pressure rise (58) and fall (59) groups which are mutually exclusive in Section 3.',
    });
  }

  // 10. Squalls & Section 5 Rules: Rule SQU-001 & Temporal Checks
  for (const t of sec5Tokens) {
    if (t.length === 5 && t.startsWith('2')) {
      issues.push({
        ruleId: 'SQU-001',
        category: 'Inland-Station Rules',
        severity: 'error',
        stationId,
        stationName,
        rawGroup: t,
        field: 'squall',
        message: 'Squall group 2DqFqqqt in Section 555 is not used; full-time IMD stations must report squalls using the 9SpSpSpSp group.',
      });
    }
    if (t.length === 5 && t.startsWith('1') && utcSlot === '12Z') {
      issues.push({
        ruleId: 'RAI-001',
        category: 'Coding',
        severity: 'warning',
        stationId,
        stationName,
        rawGroup: t,
        field: 'progressive_rainfall',
        message: 'Progressive rainfall group (1RTRTRTRT) in Section 5 is only reported at 0300 GMT.',
      });
    }
  }

  // 11. Contextual Departure & 24h Change checks (departure > 10°C, 24h change > 10°C)
  if (context?.reportingDate && stationId && stationId !== 'UNKNOWN') {
    // Departure from normal check
    if (context.normalProvider?.getNormalsForDate) {
      try {
        const rawNormals = context.normalProvider.getNormalsForDate(context.reportingDate, stationId);
        const normals = (rawNormals as any)?.normals ?? rawNormals;
        if (normals) {
          const normTmin = normals.tmin;
          const normTmax = normals.tmax;
          if (utcSlot === '03Z' && tmin !== null && tmin !== undefined && normTmin !== null && normTmin !== undefined) {
            const dep = Math.round((tmin - normTmin) * 10) / 10;
            if (Math.abs(dep) > 10) {
              issues.push({
                ruleId: 'PLU-001',
                category: 'Plausibility',
                severity: 'warning',
                stationId,
                stationName,
                field: 'tmin_departure',
                decodedValue: `${dep > 0 ? '+' : ''}${dep}°C`,
                message: `Large Tmin departure (${dep > 0 ? '+' : ''}${dep}°C) from normal (${normTmin}°C) exceeds 10°C threshold.`,
              });
            }
          }
          const tmaxVal = utcSlot === '12Z' ? tmaxPreviousDay : null;
          if (tmaxVal !== null && tmaxVal !== undefined && normTmax !== null && normTmax !== undefined) {
            const dep = Math.round((tmaxVal - normTmax) * 10) / 10;
            if (Math.abs(dep) > 10) {
              issues.push({
                ruleId: 'PLU-001',
                category: 'Plausibility',
                severity: 'warning',
                stationId,
                stationName,
                field: 'tmax_departure',
                decodedValue: `${dep > 0 ? '+' : ''}${dep}°C`,
                message: `Large Tmax departure (${dep > 0 ? '+' : ''}${dep}°C) from normal (${normTmax}°C) exceeds 10°C threshold.`,
              });
            }
          }
        }
      } catch {}
    }

    // 24-hour temperature change check
    if (context.observationStore?.getStationObservation) {
      try {
        const parts = context.reportingDate.split('-').map(Number);
        const prevD = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] - 1));
        const prevDateStr = `${prevD.getUTCFullYear()}-${String(prevD.getUTCMonth() + 1).padStart(2, '0')}-${String(prevD.getUTCDate()).padStart(2, '0')}`;
        const prevObs = context.observationStore.getStationObservation(stationId, prevDateStr);
        if (prevObs) {
          if (utcSlot === '03Z' && tmin !== null && tmin !== undefined && prevObs.tmin !== null && prevObs.tmin !== undefined) {
            const change24 = Math.round((tmin - prevObs.tmin) * 10) / 10;
            if (Math.abs(change24) > 10) {
              issues.push({
                ruleId: 'PLU-001',
                category: 'Plausibility',
                severity: 'warning',
                stationId,
                stationName,
                field: 'tmin_24h_change',
                decodedValue: `${change24 > 0 ? '+' : ''}${change24}°C`,
                message: `Large Tmin 24-hour change (${change24 > 0 ? '+' : ''}${change24}°C, yesterday: ${prevObs.tmin}°C) exceeds 10°C threshold.`,
              });
            }
          }
          const tmaxVal = utcSlot === '12Z' ? tmaxPreviousDay : null;
          if (tmaxVal !== null && tmaxVal !== undefined && prevObs.tmax !== null && prevObs.tmax !== undefined) {
            const change24 = Math.round((tmaxVal - prevObs.tmax) * 10) / 10;
            if (Math.abs(change24) > 10) {
              issues.push({
                ruleId: 'PLU-001',
                category: 'Plausibility',
                severity: 'warning',
                stationId,
                stationName,
                field: 'tmax_24h_change',
                decodedValue: `${change24 > 0 ? '+' : ''}${change24}°C`,
                message: `Large Tmax 24-hour change (${change24 > 0 ? '+' : ''}${change24}°C, yesterday: ${prevObs.tmax}°C) exceeds 10°C threshold.`,
              });
            }
          }
        }
      } catch {}
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
 * Performs syntax checks, duplicate station detection, and IMD meteorological checks.
 */
export function validateSynopBulletin(
  rawBulletin: string,
  utcSlot: UtcSlot = '03Z',
  customLimits?: Partial<SynopValidationLimits>,
  context?: ValidationContext
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

  for (let segment of segments) {
    segment = segment.trim();
    if (!segment) continue;

    // Strip bulletin header
    segment = segment.replace(/^AAXX\s+\d+(?:\s+(?:COR|AMD))?\s*/i, '');
    if (segment.length < 10) continue;

    const res = validateSingleTelegram(segment, utcSlot, customLimits, context);

    // Check for duplicate station codes within the same bulletin
    if (res.stationId && res.stationId !== 'UNKNOWN') {
      if (seenStationIds.has(res.stationId)) {
        const issue: SynopValidationIssue = {
          ruleId: 'STR-001',
          category: 'Structural',
          severity: 'warning',
          stationId: res.stationId,
          stationName: res.stationName,
          rawGroup: res.stationId,
          field: 'stationId',
          message: `Duplicate station report for ${res.stationId} (${res.stationName || 'Unknown'}) in bulletin. Later telegram may overwrite prior values.`,
        };
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
