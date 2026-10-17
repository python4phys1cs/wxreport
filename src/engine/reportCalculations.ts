/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subdivision extreme value with associated station names.
 */
export interface SubdivisionExtreme {
  value: number | null;
  stationNames: string;
  formattedText: string;
}

/**
 * Report 1: Station-level observation row.
 */
export interface StationReportRow {
  stationId: string;
  stationName: string;

  // Maximum Temperature (evening De1)
  tmax: number | null;
  tmax24hChange: number | null;
  tmaxDeparture: string | null;
  tmaxColor: string;

  // Minimum Temperature (morning Dm1)
  tmin: number | null;
  tmin24hChange: number | null;
  tminDeparture: string | null;
  tminColor: string;

  // Relative Humidity (%)
  rh0830: number | null;
  rh1730: number | null;

  // Visibility code translated to text (winter months)
  visibilityText: string;

  // Rainfall (mm)
  rainfall: number | null;
  rainfall0830: number | null;
  rainfall1730: number | null;
  rainfallColor: string;
  rainfallIntensity: string;

  // Metadata: indicates which fields were manually edited
  manualEdits?: Record<string, boolean>;
}

/**
 * Report 2: Subdivision summary report structure.
 */
export interface SubdivisionReportSummary {
  subdivisionId: string | number;
  subdivisionName: string;

  // Maximum Temperature
  tmax24hChangeAvg: number | null;
  tmax24hChangeClass: string; // MF, AF, NLC, AR, MR, or "N/A"
  tmaxDepartureAvg: number | null;
  tmaxDepartureClass: string; // MBN, ABN, BN, Normal, AN, AAN, MAN, or "N/A"
  highestTmax: SubdivisionExtreme;
  heatWaveStationsCount: number;
  heatWaveStationsTotal: number;
  isHeatWaveSeason: boolean; // March, April, May

  // Minimum Temperature
  tmin24hChangeAvg: number | null;
  tmin24hChangeClass: string; // MF, AF, NLC, AR, MR, or "N/A"
  tminDepartureAvg: number | null;
  tminDepartureClass: string; // MBN, ABN, BN, Normal, AN, AAN, MAN, or "N/A"
  lowestTmin: SubdivisionExtreme;
  coldWaveStationsCount: number;
  coldWaveStationsTotal: number;
  isColdWaveSeason: boolean; // Jan, Feb, Nov, Dec

  // Rainfall
  heaviestRainfall: SubdivisionExtreme;
  rainfallPercent: number;
  rainfallDistributionClass: 'WS' | 'FWS' | 'SCT' | 'ISOL' | 'DRY';
  rainfallDistributionColor: string;
}

/**
 * Emulates PHP's `round($value, $precision, PHP_ROUND_HALF_UP)` exactly.
 *
 * PHP ROUND_HALF_UP rounds half-values away from zero:
 *   round(1.5, 0)   => 2
 *   round(-1.5, 0)  => -2
 *   round(2.05, 1)  => 2.1
 *   round(-2.05, 1) => -2.1
 *
 * JavaScript's default Math.round rounds towards +infinity:
 *   Math.round(-1.5) => -1 (NOT -2!)
 *
 * This function preserves PHP's exact symmetric away-from-zero rounding
 * across all positive and negative half-boundaries, and eliminates negative zeroes.
 */
export function roundLikePhp(value: number, decimals: number = 0): number {
  if (isNaN(value) || !isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const factor = Math.pow(10, decimals);
  // Using exponential string avoids float representation artifacts (e.g. 1.15 * 10 = 11.499999999999998)
  const roundedAbs = Math.round(Number(Math.abs(value) + 'e' + decimals)) / factor;
  const res = sign * roundedAbs;
  return Object.is(res, -0) || res === 0 ? 0 : res;
}

/**
 * Calculates 24-hour temperature change: round(current - previous, 1).
 * If either value is missing (null/undefined/NaN), returns null.
 */
export function calculate24hChange(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    isNaN(current) ||
    isNaN(previous)
  ) {
    return null;
  }
  return roundLikePhp(current - previous, 1);
}

/**
 * Temperature 24-hour change classification:
 * Source: observations_report_include_fast.php lines 142-152
 *   <= -4.1       => MF  (Marked Fall)
 *   -4.0 to -2.1  => AF  (Appreciable Fall)
 *   -2.0 to 2.0   => NLC (No Large Change)
 *   > 2.0 to 4.0  => AR  (Appreciable Rise)
 *   >= 4.1        => MR  (Marked Rise)
 */
export function classify24hChange(avgChange: number | null | undefined): string {
  if (avgChange === null || avgChange === undefined || isNaN(avgChange)) {
    return 'N/A';
  }
  const val = roundLikePhp(avgChange, 1);
  if (val <= -4.1) return 'MF';
  if (val >= -4.0 && val <= -2.1) return 'AF';
  if (val >= -2.0 && val <= 2.0) return 'NLC';
  if (val > 2.0 && val <= 4.0) return 'AR';
  if (val >= 4.1) return 'MR';
  return 'N/A';
}

/**
 * Temperature departure classification:
 * Source: observations_report_include_fast.php lines 154-168
 *   <= -5.0        => MBN    (Markedly Below Normal)
 *   > -5.0 to -3.1 => ABN    (Appreciably Below Normal)
 *   > -3.1 to -1.6 => BN     (Below Normal)
 *   > -1.6 to 1.5  => Normal (Normal)
 *   > 1.5 to 3.0   => AN     (Above Normal)
 *   > 3.0 to 5.0   => AAN    (Appreciably Above Normal)
 *   > 5.0          => MAN    (Markedly Above Normal)
 */
export function classifyDeparture(avgDeparture: number | null | undefined): string {
  if (avgDeparture === null || avgDeparture === undefined || isNaN(avgDeparture)) {
    return 'N/A';
  }
  const val = roundLikePhp(avgDeparture, 1);
  if (val <= -5.0) return 'MBN';
  if (val > -5.0 && val <= -3.1) return 'ABN';
  if (val > -3.1 && val <= -1.6) return 'BN';
  if (val > -1.6 && val <= 1.5) return 'Normal';
  if (val > 1.5 && val <= 3.0) return 'AN';
  if (val > 3.0 && val <= 5.0) return 'AAN';
  if (val > 5.0) return 'MAN';
  return 'N/A';
}

/**
 * Rainfall spatial distribution classification:
 * Source: observations_report_include_fast.php lines 170-176
 *   > 75%       => WS   (#6699ee - Widespread / Most Places)
 *   51% to 75%  => FWS  (#66ccff - Fairly Widespread / Many Places)
 *   26% to 50%  => SCT  (#99ee99 - Scattered / A Few Places)
 *   1% to 25%   => ISOL (#ddffdd - Isolated / One or Two Places)
 *   0%          => DRY  (#ffffff - Dry)
 */
export function classifyRainfallDistribution(percent: number): {
  code: 'WS' | 'FWS' | 'SCT' | 'ISOL' | 'DRY';
  color: string;
} {
  if (percent > 75) return { code: 'WS', color: '#6699ee' };
  if (percent > 50) return { code: 'FWS', color: '#66ccff' };
  if (percent > 25) return { code: 'SCT', color: '#99ee99' };
  if (percent > 0) return { code: 'ISOL', color: '#ddffdd' };
  return { code: 'DRY', color: '#ffffff' };
}

/**
 * Heat Wave season check: March (3), April (4), May (5).
 */
export function isHeatWaveSeason(month: number): boolean {
  return month === 3 || month === 4 || month === 5;
}

/**
 * Cold Wave season check: January (1), February (2), November (11), December (12).
 */
export function isColdWaveSeason(month: number): boolean {
  return month === 1 || month === 2 || month === 11 || month === 12;
}

/**
 * Heat Wave criteria for a single station:
 * Source: observations_report_include_fast.php line 125
 *   (($r4['tmax'] >= 45) or
 *    ($r4['tmax'] >= 40 and $r4['tmxd'] != '' and $tmx >= 4.5 and $tmx < 6.5 and substr($r4['tmxd'],0,1) == '+'))
 */
export function isStationHeatWave(
  tmax: number | null | undefined,
  tmaxDepartureStr: string | number | null | undefined
): boolean {
  if (tmax === null || tmax === undefined || isNaN(tmax)) {
    return false;
  }
  // Criterion 1: Tmax >= 45 °C regardless of normal
  if (tmax >= 45) {
    return true;
  }
  // Criterion 2: Tmax >= 40 °C with departure between +4.5 and +6.4 °C
  if (tmax >= 40 && tmaxDepartureStr !== null && tmaxDepartureStr !== undefined) {
    const depStr = String(tmaxDepartureStr).trim();
    const num = parseFloat(depStr);
    const isPositive = depStr.startsWith('+') || (typeof tmaxDepartureStr === 'number' && tmaxDepartureStr > 0);
    if (isPositive && !isNaN(num)) {
      const depNum = Math.abs(num);
      if (depNum >= 4.5 && depNum < 6.5) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Cold Wave criteria for a single station:
 * Source: observations_report_include_fast.php line 130
 *   ($r3['tmin'] != '' and $r3['tmin'] <= 10 and $r3['tmnd'] != '' and $tmn >= 4.5 and substr($r3['tmnd'],0,1) == '-')
 */
export function isStationColdWave(
  tmin: number | null | undefined,
  tminDepartureStr: string | number | null | undefined
): boolean {
  if (tmin === null || tmin === undefined || isNaN(tmin)) {
    return false;
  }
  // Tmin <= 10 °C with departure <= -4.5 °C (departure starts with '-' or negative)
  if (tmin <= 10 && tminDepartureStr !== null && tminDepartureStr !== undefined) {
    const depStr = String(tminDepartureStr).trim();
    const num = parseFloat(depStr);
    const isNegative = depStr.startsWith('-') || (typeof tminDepartureStr === 'number' && tminDepartureStr < 0);
    if (isNegative && !isNaN(num)) {
      const depNum = Math.abs(num);
      if (depNum >= 4.5) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Station-level Tmax highlight color for Report 1:
 * Source: observations_include_fast.php lines 95-104
 */
export function getStationMaxTempColor(
  tmax: number | null | undefined,
  tmxdStr: string | number | null | undefined
): string {
  const defaultBg = '#ffffee';
  if (tmax === null || tmax === undefined || isNaN(tmax) || tmax === 0) {
    return defaultBg;
  }
  const depVal = tmxdStr !== null && tmxdStr !== undefined ? parseFloat(String(tmxdStr)) : NaN;

  if (tmax >= 40 && tmax < 45) {
    if (!isNaN(depVal)) {
      if (depVal >= 4.5 && depVal <= 6.4) return 'orange';
      if (depVal >= 6.5) return 'red';
    }
  } else if (tmax >= 45 && tmax < 47) {
    return 'orange';
  } else if (tmax >= 47) {
    return 'red';
  }
  return defaultBg;
}

/**
 * Station-level Tmin highlight color for Report 1:
 * Source: observations_include_fast.php lines 106-115
 */
export function getStationMinTempColor(
  tmin: number | null | undefined,
  tmndStr: string | number | null | undefined
): string {
  const defaultBg = '#ffffee';
  if (tmin === null || tmin === undefined || isNaN(tmin) || tmin === 0) {
    return defaultBg;
  }
  const depVal = tmndStr !== null && tmndStr !== undefined ? parseFloat(String(tmndStr)) : NaN;

  if (tmin <= 10 && tmin > 4) {
    if (!isNaN(depVal)) {
      if (depVal <= -4.5 && depVal >= -6.4) return '#0096FF';
      if (depVal <= -6.5) return '#0047AB';
    }
  } else if (tmin <= 4 && tmin > 2) {
    return '#0096FF';
  } else if (tmin <= 2) {
    return '#0047AB';
  }
  return defaultBg;
}

/**
 * Station-level rainfall intensity and highlight color for Report 1:
 * Source: observations_include_fast.php lines 117-133
 */
export function getRainfallIntensityAndColor(rainfall: number | null | undefined): {
  intensity: string;
  color: string;
} {
  if (rainfall === null || rainfall === undefined || isNaN(rainfall) || rainfall <= 0) {
    return { intensity: 'Dry', color: 'white' };
  }
  if (rainfall >= 0.1 && rainfall <= 2.4) {
    return { intensity: 'Very Light', color: 'white' };
  }
  if (rainfall >= 2.5 && rainfall <= 15.5) {
    return { intensity: 'Light', color: 'white' };
  }
  if (rainfall >= 15.6 && rainfall <= 64.4) {
    return { intensity: 'Moderate', color: 'white' };
  }
  if (rainfall >= 64.5 && rainfall <= 115.5) {
    return { intensity: 'Heavy', color: '#FFFF00' };
  }
  if (rainfall >= 115.6 && rainfall <= 204.4) {
    return { intensity: 'Very Heavy', color: '#FFA500' };
  }
  if (rainfall >= 204.5) {
    return { intensity: 'Extremely Heavy', color: '#FF0000' };
  }
  return { intensity: 'Dry', color: 'white' };
}

/**
 * Translates SYNOP 2-digit visibility code to operational text:
 * Source: observations_include_fast.php lines 78-91
 */
export function mapVisibilityCodeToString(code: string | null | undefined): string {
  if (!code) return '';
  switch (code) {
    case '99': return '> 50 km';
    case '98': return '20-50 km';
    case '97': return '10-20 km';
    case '96': return '04-10 km';
    case '95': return '02-04 km';
    case '94': return '01-02 km';
    case '93': return '500-1000 m';
    case '92': return '200-500 m';
    case '91': return '50-200 m';
    case '90': return '< 50 m';
    default: return '';
  }
}

/**
 * Input station record required for subdivision report calculations.
 */
export interface StationInputData {
  stationId: string;
  stationName: string;

  // Max temperature (observed previous evening De1)
  tmax: number | null;
  // Historical Max temperature 24h prior (observed De2)
  tmax24hPrior: number | null;
  tmaxDepartureStr: string | null;

  // Min temperature (observed current morning Dm1)
  tmin: number | null;
  // Historical Min temperature 24h prior (observed Dm2)
  tmin24hPrior: number | null;
  tminDepartureStr: string | null;

  // Relative humidity
  rh0830: number | null;
  rh1730: number | null;

  // Visibility code
  visibilityCode: string | null;

  // 24h accumulated rainfall (mm) up to 0830 IST
  rainfall: number | null;
  rainfall0830?: number | null;
  rainfall1730?: number | null;

  // Metadata: indicates which fields were manually edited
  manualEdits?: Record<string, boolean>;
}

/**
 * Calculates Report 1 rows for a list of stations.
 */
export function calculateStationReportRows(stations: StationInputData[]): StationReportRow[] {
  return stations.map((stn) => {
    const tmax24hChange = calculate24hChange(stn.tmax, stn.tmax24hPrior);
    const tmin24hChange = calculate24hChange(stn.tmin, stn.tmin24hPrior);
    const tmaxColor = getStationMaxTempColor(stn.tmax, stn.tmaxDepartureStr);
    const tminColor = getStationMinTempColor(stn.tmin, stn.tminDepartureStr);
    const { intensity, color } = getRainfallIntensityAndColor(stn.rainfall);
    const visibilityText = mapVisibilityCodeToString(stn.visibilityCode);
    const rf0830 = stn.rainfall0830 !== undefined ? stn.rainfall0830 : (stn.rainfall ?? null);
    const rf1730 = stn.rainfall1730 !== undefined ? stn.rainfall1730 : null;

    return {
      stationId: stn.stationId,
      stationName: stn.stationName,
      tmax: stn.tmax,
      tmax24hChange,
      tmaxDeparture: stn.tmaxDepartureStr,
      tmaxColor,
      tmin: stn.tmin,
      tmin24hChange,
      tminDeparture: stn.tminDepartureStr,
      tminColor,
      rh0830: stn.rh0830,
      rh1730: stn.rh1730,
      visibilityText,
      rainfall: stn.rainfall,
      rainfall0830: rf0830,
      rainfall1730: rf1730,
      rainfallColor: color,
      rainfallIntensity: intensity,
      manualEdits: stn.manualEdits,
    };
  });
}

/**
 * Calculates Report 2 Summary for a single meteorological subdivision.
 * Replicates exact statistical aggregations, classifications, extreme tie-breaking,
 * heat/cold-wave counting, and spatial rainfall distribution logic.
 */
export function calculateSubdivisionReportSummary(
  subdivisionId: string | number,
  subdivisionName: string,
  stations: StationInputData[],
  reportingMonth: number // 1 to 12
): SubdivisionReportSummary {
  let tmaxChTotal = 0;
  let tmaxChCounter = 0;
  let tmxdTotal = 0;
  let tmxdCounter = 0;

  let tminChTotal = 0;
  let tminChCounter = 0;
  let tmndTotal = 0;
  let tmndCounter = 0;

  let highestTmaxVal: number | null = null;
  let highestTmaxStations: string[] = [];

  let lowestTminVal: number | null = null;
  let lowestTminStations: string[] = [];

  let heaviestRfVal: number | null = null;
  let heaviestRfStations: string[] = [];

  let rfReportingCount = 0;
  let rfDryCount = 0;

  let heatWaveCount = 0;
  let coldWaveCount = 0;
  const stationsTotal = stations.length;

  for (const stn of stations) {
    // ----------------- Tmin 24h Change & Extremes -----------------
    if (
      stn.tmin !== null &&
      stn.tmin !== undefined &&
      stn.tmin24hPrior !== null &&
      stn.tmin24hPrior !== undefined
    ) {
      const ch = roundLikePhp(stn.tmin - stn.tmin24hPrior, 1);
      tminChTotal += ch;
      tminChCounter++;
    }

    if (stn.tmin !== null && stn.tmin !== undefined) {
      if (lowestTminVal === null || stn.tmin < lowestTminVal) {
        lowestTminVal = stn.tmin;
        lowestTminStations = [stn.stationName];
      } else if (stn.tmin === lowestTminVal) {
        lowestTminStations.push(stn.stationName);
      }
    }

    if (
      stn.tminDepartureStr !== null &&
      stn.tminDepartureStr !== undefined &&
      stn.tminDepartureStr !== '' &&
      stn.tminDepartureStr !== '---'
    ) {
      const depNum = parseFloat(stn.tminDepartureStr);
      if (!isNaN(depNum)) {
        tmndTotal += depNum;
        tmndCounter++;
      }
    }

    // ----------------- Tmax 24h Change & Extremes -----------------
    if (
      stn.tmax !== null &&
      stn.tmax !== undefined &&
      stn.tmax24hPrior !== null &&
      stn.tmax24hPrior !== undefined
    ) {
      const ch = roundLikePhp(stn.tmax - stn.tmax24hPrior, 1);
      tmaxChTotal += ch;
      tmaxChCounter++;
    }

    if (stn.tmax !== null && stn.tmax !== undefined) {
      if (highestTmaxVal === null || stn.tmax > highestTmaxVal) {
        highestTmaxVal = stn.tmax;
        highestTmaxStations = [stn.stationName];
      } else if (stn.tmax === highestTmaxVal) {
        highestTmaxStations.push(stn.stationName);
      }
    }

    if (
      stn.tmaxDepartureStr !== null &&
      stn.tmaxDepartureStr !== undefined &&
      stn.tmaxDepartureStr !== '' &&
      stn.tmaxDepartureStr !== '---'
    ) {
      const depNum = parseFloat(stn.tmaxDepartureStr);
      if (!isNaN(depNum)) {
        tmxdTotal += depNum;
        tmxdCounter++;
      }
    }

    // ----------------- Rainfall -----------------
    if (stn.rainfall !== null && stn.rainfall !== undefined) {
      rfReportingCount++;
      if (stn.rainfall === 0 || stn.rainfall === 0.0) {
        rfDryCount++;
      }

      if (heaviestRfVal === null || stn.rainfall > heaviestRfVal) {
        heaviestRfVal = stn.rainfall;
        heaviestRfStations = [stn.stationName];
      } else if (stn.rainfall === heaviestRfVal) {
        heaviestRfStations.push(stn.stationName);
      }
    }

    // ----------------- Heat Wave / Cold Wave -----------------
    if (isStationHeatWave(stn.tmax, stn.tmaxDepartureStr)) {
      heatWaveCount++;
    }

    if (isStationColdWave(stn.tmin, stn.tminDepartureStr)) {
      coldWaveCount++;
    }
  }

  // Subdivision Averages
  const tmax24hChangeAvg =
    tmaxChCounter > 0 ? roundLikePhp(tmaxChTotal / tmaxChCounter, 1) : null;
  const tmaxDepartureAvg =
    tmxdCounter > 0 ? roundLikePhp(tmxdTotal / tmxdCounter, 1) : null;

  const tmin24hChangeAvg =
    tminChCounter > 0 ? roundLikePhp(tminChTotal / tminChCounter, 1) : null;
  const tminDepartureAvg =
    tmndCounter > 0 ? roundLikePhp(tmndTotal / tmndCounter, 1) : null;

  // Classifications
  const tmax24hChangeClass = classify24hChange(tmax24hChangeAvg);
  const tmaxDepartureClass = classifyDeparture(tmaxDepartureAvg);

  const tmin24hChangeClass = classify24hChange(tmin24hChangeAvg);
  const tminDepartureClass = classifyDeparture(tminDepartureAvg);

  // Rainfall Distribution
  let rainfallPercent = 0;
  if (rfReportingCount > 0) {
    rainfallPercent = roundLikePhp(100 * ((rfReportingCount - rfDryCount) / rfReportingCount), 0);
  }
  const { code: rfDistrCode, color: rfDistrColor } = classifyRainfallDistribution(rainfallPercent);

  // Highest Tmax formatted
  let highestTmax: SubdivisionExtreme = {
    value: highestTmaxVal,
    stationNames: highestTmaxStations.join(', ') || '---',
    formattedText: '---',
  };
  if (highestTmaxVal !== null) {
    highestTmax.formattedText = `${highestTmaxVal} at ${highestTmax.stationNames}`;
  }

  // Lowest Tmin formatted
  let lowestTmin: SubdivisionExtreme = {
    value: lowestTminVal,
    stationNames: lowestTminStations.join(', ') || '---',
    formattedText: '---',
  };
  if (lowestTminVal !== null) {
    lowestTmin.formattedText = `${lowestTminVal} at ${lowestTmin.stationNames}`;
  }

  // Heaviest Rainfall formatted
  let heaviestRainfall: SubdivisionExtreme = {
    value: heaviestRfVal,
    stationNames: heaviestRfStations.join(', ') || '---',
    formattedText: '---',
  };
  if (heaviestRfVal !== null) {
    if (heaviestRfVal > 0) {
      heaviestRainfall.formattedText = `${heaviestRfVal} at ${heaviestRainfall.stationNames}`;
    } else {
      heaviestRainfall.formattedText = `${heaviestRfVal}`;
    }
  }

  return {
    subdivisionId,
    subdivisionName,
    tmax24hChangeAvg,
    tmax24hChangeClass,
    tmaxDepartureAvg,
    tmaxDepartureClass,
    highestTmax,
    heatWaveStationsCount: heatWaveCount,
    heatWaveStationsTotal: stationsTotal,
    isHeatWaveSeason: isHeatWaveSeason(reportingMonth),
    tmin24hChangeAvg,
    tmin24hChangeClass,
    tminDepartureAvg,
    tminDepartureClass,
    lowestTmin,
    coldWaveStationsCount: coldWaveCount,
    coldWaveStationsTotal: stationsTotal,
    isColdWaveSeason: isColdWaveSeason(reportingMonth),
    heaviestRainfall,
    rainfallPercent,
    rainfallDistributionClass: rfDistrCode,
    rainfallDistributionColor: rfDistrColor,
  };
}
