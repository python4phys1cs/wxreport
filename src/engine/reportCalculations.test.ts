/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundLikePhp,
  calculate24hChange,
  classify24hChange,
  classifyDeparture,
  classifyRainfallDistribution,
  isHeatWaveSeason,
  isColdWaveSeason,
  isStationHeatWave,
  isStationColdWave,
  getStationMaxTempColor,
  getStationMinTempColor,
  getRainfallIntensityAndColor,
  mapVisibilityCodeToString,
  calculateStationReportRows,
  calculateSubdivisionReportSummary,
  type StationInputData,
} from './reportCalculations.ts';
import { formatDeparture } from './climatology.ts';

describe('Report Calculations & Aggregation Suite', () => {

  describe('1. 24-Hour Temperature Change Arithmetic', () => {
    it('calculates normal rise and fall correctly rounded to 1 decimal', () => {
      assert.equal(calculate24hChange(42.5, 40.2), 2.3);
      assert.equal(calculate24hChange(21.4, 23.8), -2.4);
      assert.equal(calculate24hChange(30.0, 30.0), 0);
    });

    it('returns null if either current or previous value is missing', () => {
      assert.equal(calculate24hChange(null, 40.0), null);
      assert.equal(calculate24hChange(42.0, null), null);
      assert.equal(calculate24hChange(undefined, 40.0), null);
      assert.equal(calculate24hChange(42.0, NaN), null);
    });
  });

  describe('2. 24-Hour Change Classification (MF, AF, NLC, AR, MR)', () => {
    it('classifies Marked Fall (<= -4.1)', () => {
      assert.equal(classify24hChange(-4.1), 'MF');
      assert.equal(classify24hChange(-6.5), 'MF');
    });

    it('classifies Appreciable Fall (-4.0 to -2.1)', () => {
      assert.equal(classify24hChange(-4.0), 'AF');
      assert.equal(classify24hChange(-3.0), 'AF');
      assert.equal(classify24hChange(-2.1), 'AF');
    });

    it('classifies No Large Change (-2.0 to 2.0)', () => {
      assert.equal(classify24hChange(-2.0), 'NLC');
      assert.equal(classify24hChange(0.0), 'NLC');
      assert.equal(classify24hChange(2.0), 'NLC');
    });

    it('classifies Appreciable Rise (> 2.0 to 4.0)', () => {
      assert.equal(classify24hChange(2.1), 'AR');
      assert.equal(classify24hChange(3.0), 'AR');
      assert.equal(classify24hChange(4.0), 'AR');
    });

    it('classifies Marked Rise (>= 4.1)', () => {
      assert.equal(classify24hChange(4.1), 'MR');
      assert.equal(classify24hChange(5.8), 'MR');
    });

    it('returns N/A for null/NaN values', () => {
      assert.equal(classify24hChange(null), 'N/A');
      assert.equal(classify24hChange(undefined), 'N/A');
    });
  });

  describe('3. Temperature Departure Classification', () => {
    it('classifies Markedly Below Normal (<= -5.0)', () => {
      assert.equal(classifyDeparture(-5.0), 'MBN');
      assert.equal(classifyDeparture(-6.2), 'MBN');
    });

    it('classifies Appreciably Below Normal (> -5.0 to -3.1)', () => {
      assert.equal(classifyDeparture(-4.9), 'ABN');
      assert.equal(classifyDeparture(-3.1), 'ABN');
    });

    it('classifies Below Normal (> -3.1 to -1.6)', () => {
      assert.equal(classifyDeparture(-3.0), 'BN');
      assert.equal(classifyDeparture(-1.6), 'BN');
    });

    it('classifies Normal (> -1.6 to 1.5)', () => {
      assert.equal(classifyDeparture(-1.5), 'Normal');
      assert.equal(classifyDeparture(0.0), 'Normal');
      assert.equal(classifyDeparture(1.5), 'Normal');
    });

    it('classifies Above Normal (> 1.5 to 3.0)', () => {
      assert.equal(classifyDeparture(1.6), 'AN');
      assert.equal(classifyDeparture(3.0), 'AN');
    });

    it('classifies Appreciably Above Normal (> 3.0 to 5.0)', () => {
      assert.equal(classifyDeparture(3.1), 'AAN');
      assert.equal(classifyDeparture(5.0), 'AAN');
    });

    it('classifies Markedly Above Normal (> 5.0)', () => {
      assert.equal(classifyDeparture(5.1), 'MAN');
      assert.equal(classifyDeparture(7.5), 'MAN');
    });

    it('returns N/A for null/NaN values', () => {
      assert.equal(classifyDeparture(null), 'N/A');
    });
  });

  describe('4. Rainfall Spatial Distribution Classification', () => {
    it('classifies Widespread (> 75%)', () => {
      const res = classifyRainfallDistribution(76);
      assert.equal(res.code, 'WS');
      assert.equal(res.color, '#6699ee');
    });

    it('classifies Fairly Widespread (51% to 75%)', () => {
      const res1 = classifyRainfallDistribution(75);
      assert.equal(res1.code, 'FWS');
      assert.equal(res1.color, '#66ccff');

      const res2 = classifyRainfallDistribution(51);
      assert.equal(res2.code, 'FWS');
    });

    it('classifies Scattered (26% to 50%)', () => {
      const res1 = classifyRainfallDistribution(50);
      assert.equal(res1.code, 'SCT');
      assert.equal(res1.color, '#99ee99');

      const res2 = classifyRainfallDistribution(26);
      assert.equal(res2.code, 'SCT');
    });

    it('classifies Isolated (1% to 25%)', () => {
      const res1 = classifyRainfallDistribution(25);
      assert.equal(res1.code, 'ISOL');
      assert.equal(res1.color, '#ddffdd');

      const res2 = classifyRainfallDistribution(1);
      assert.equal(res2.code, 'ISOL');
    });

    it('classifies Dry (0%)', () => {
      const res = classifyRainfallDistribution(0);
      assert.equal(res.code, 'DRY');
      assert.equal(res.color, '#ffffff');
    });
  });

  describe('5. Heat Wave & Cold Wave Criteria and Seasons', () => {
    it('identifies Heat Wave season (March, April, May)', () => {
      assert.equal(isHeatWaveSeason(3), true);
      assert.equal(isHeatWaveSeason(4), true);
      assert.equal(isHeatWaveSeason(5), true);
      assert.equal(isHeatWaveSeason(2), false);
      assert.equal(isHeatWaveSeason(6), false);
    });

    it('identifies Cold Wave season (Jan, Feb, Nov, Dec)', () => {
      assert.equal(isColdWaveSeason(1), true);
      assert.equal(isColdWaveSeason(2), true);
      assert.equal(isColdWaveSeason(11), true);
      assert.equal(isColdWaveSeason(12), true);
      assert.equal(isColdWaveSeason(3), false);
      assert.equal(isColdWaveSeason(10), false);
    });

    it('evaluates Heat Wave station condition correctly', () => {
      // Tmax >= 45 => HW regardless of departure
      assert.equal(isStationHeatWave(45.0, '+2.0'), true);
      assert.equal(isStationHeatWave(46.5, null), true);

      // Tmax >= 40 with +4.5 <= departure < +6.5 => HW
      assert.equal(isStationHeatWave(41.0, '+4.5'), true);
      assert.equal(isStationHeatWave(43.0, '+6.4'), true);

      // Fails if departure < +4.5
      assert.equal(isStationHeatWave(42.0, '+4.4'), false);

      // Fails if departure >= +6.5 (Severe Heat Wave in WMO, not in this legacy HW check)
      assert.equal(isStationHeatWave(42.0, '+6.5'), false);

      // Fails if Tmax < 40
      assert.equal(isStationHeatWave(39.5, '+5.0'), false);
    });

    it('evaluates Cold Wave station condition correctly', () => {
      // Tmin <= 10 and departure <= -4.5 => CW
      assert.equal(isStationColdWave(8.0, '-4.5'), true);
      assert.equal(isStationColdWave(6.0, '-6.0'), true);

      // Fails if departure > -4.5
      assert.equal(isStationColdWave(8.0, '-4.4'), false);

      // Fails if Tmin > 10
      assert.equal(isStationColdWave(11.0, '-5.0'), false);
    });
  });

  describe('6. Station Report 1 Display Helpers (Colors, Intensity, Visibility)', () => {
    it('determines Max Temp color highlights', () => {
      // 40 <= Tmax < 45 with departure 4.5..6.4 -> orange
      assert.equal(getStationMaxTempColor(42.0, '+5.0'), 'orange');
      // 40 <= Tmax < 45 with departure >= 6.5 -> red
      assert.equal(getStationMaxTempColor(43.0, '+7.0'), 'red');
      // 45 <= Tmax < 47 -> orange
      assert.equal(getStationMaxTempColor(45.5, '+2.0'), 'orange');
      // Tmax >= 47 -> red
      assert.equal(getStationMaxTempColor(47.2, '+1.0'), 'red');
      // Normal temperature -> default #ffffee
      assert.equal(getStationMaxTempColor(38.0, '+1.0'), '#ffffee');
    });

    it('determines Min Temp color highlights', () => {
      // 4 < Tmin <= 10 with departure -4.5..-6.4 -> #0096FF
      assert.equal(getStationMinTempColor(8.0, '-5.0'), '#0096FF');
      // 4 < Tmin <= 10 with departure <= -6.5 -> #0047AB
      assert.equal(getStationMinTempColor(8.0, '-7.0'), '#0047AB');
      // 2 < Tmin <= 4 -> #0096FF
      assert.equal(getStationMinTempColor(3.5, '-2.0'), '#0096FF');
      // Tmin <= 2 -> #0047AB
      assert.equal(getStationMinTempColor(1.8, '-1.0'), '#0047AB');
      // Normal minimum -> #ffffee
      assert.equal(getStationMinTempColor(18.0, '0'), '#ffffee');
    });

    it('maps rainfall intensity and colors', () => {
      assert.deepEqual(getRainfallIntensityAndColor(0.0), { intensity: 'Dry', color: 'white' });
      assert.deepEqual(getRainfallIntensityAndColor(1.5), { intensity: 'Very Light', color: 'white' });
      assert.deepEqual(getRainfallIntensityAndColor(10.0), { intensity: 'Light', color: 'white' });
      assert.deepEqual(getRainfallIntensityAndColor(35.0), { intensity: 'Moderate', color: 'white' });
      assert.deepEqual(getRainfallIntensityAndColor(75.0), { intensity: 'Heavy', color: '#FFFF00' });
      assert.deepEqual(getRainfallIntensityAndColor(150.0), { intensity: 'Very Heavy', color: '#FFA500' });
      assert.deepEqual(getRainfallIntensityAndColor(220.0), { intensity: 'Extremely Heavy', color: '#FF0000' });
    });

    it('maps visibility codes to distance strings', () => {
      assert.equal(mapVisibilityCodeToString('99'), '> 50 km');
      assert.equal(mapVisibilityCodeToString('96'), '04-10 km');
      assert.equal(mapVisibilityCodeToString('91'), '50-200 m');
      assert.equal(mapVisibilityCodeToString(null), '');
    });
  });

  describe('7. Subdivision Aggregation & Extremes (End-to-End Synthetic Subdivision)', () => {
    const testStations: StationInputData[] = [
      {
        stationId: '42937',
        stationName: 'Nagpur',
        tmax: 43.5,
        tmax24hPrior: 41.5, // Change: +2.0
        tmaxDepartureStr: '+2.5',
        tmin: 24.0,
        tmin24hPrior: 22.0, // Change: +2.0
        tminDepartureStr: '+1.0',
        rh0830: 55,
        rh1730: 40,
        visibilityCode: '96',
        rainfall: 0.0,
      },
      {
        stationId: '42933',
        stationName: 'Akola',
        tmax: 43.5, // Tied for highest Tmax with Nagpur!
        tmax24hPrior: 42.5, // Change: +1.0
        tmaxDepartureStr: '+1.5',
        tmin: 22.0,
        tmin24hPrior: 24.0, // Change: -2.0
        tminDepartureStr: '-1.0',
        rh0830: 50,
        rh1730: 35,
        visibilityCode: '96',
        rainfall: 12.0,
      },
      {
        stationId: '42867',
        stationName: 'Amravati',
        tmax: 41.0,
        tmax24hPrior: 40.0, // Change: +1.0
        tmaxDepartureStr: '---', // Missing departure
        tmin: 21.0, // Lowest Tmin
        tmin24hPrior: 21.0, // Change: 0.0
        tminDepartureStr: '-2.0',
        rh0830: 60,
        rh1730: 45,
        visibilityCode: '96',
        rainfall: 12.0, // Tied for heaviest rainfall with Akola!
      },
      {
        stationId: '42946',
        stationName: 'Wardha',
        tmax: null, // Missing Tmax
        tmax24hPrior: 40.0,
        tmaxDepartureStr: null,
        tmin: 25.0,
        tmin24hPrior: null, // Missing prior Tmin
        tminDepartureStr: '+2.0',
        rh0830: 48,
        rh1730: 30,
        visibilityCode: '96',
        rainfall: 0.0,
      },
    ];

    it('calculates Report 1 rows accurately', () => {
      const rows = calculateStationReportRows(testStations);
      assert.equal(rows.length, 4);

      // Nagpur
      assert.equal(rows[0].stationName, 'Nagpur');
      assert.equal(rows[0].tmax24hChange, 2.0);
      assert.equal(rows[0].tmin24hChange, 2.0);
      assert.equal(rows[0].rainfallIntensity, 'Dry');

      // Wardha with missing values
      assert.equal(rows[3].stationName, 'Wardha');
      assert.equal(rows[3].tmax, null);
      assert.equal(rows[3].tmax24hChange, null);
      assert.equal(rows[3].tmin24hChange, null);
    });

    it('aggregates Report 2 summary with ties, averages, and rainfall distribution', () => {
      // Month 5 = May (Heat Wave season)
      const summary = calculateSubdivisionReportSummary('26', 'Vidarbha', testStations, 5);

      assert.equal(summary.subdivisionId, '26');
      assert.equal(summary.subdivisionName, 'Vidarbha');

      // Tmax 24h Change Average: (2.0 + 1.0 + 1.0) / 3 = 4.0 / 3 = 1.333 -> 1.3
      assert.equal(summary.tmax24hChangeAvg, 1.3);
      assert.equal(summary.tmax24hChangeClass, 'NLC'); // -2.0 to 2.0 is NLC

      // Tmax Departure Average: (2.5 + 1.5) / 2 = 2.0 (Amravati '---' and Wardha null excluded)
      assert.equal(summary.tmaxDepartureAvg, 2.0);
      assert.equal(summary.tmaxDepartureClass, 'AN'); // 1.6 to 3.0 is AN

      // Highest Tmax tie: 43.5 at Nagpur, Akola
      assert.equal(summary.highestTmax.value, 43.5);
      assert.equal(summary.highestTmax.stationNames, 'Nagpur, Akola');
      assert.equal(summary.highestTmax.formattedText, '43.5 at Nagpur, Akola');

      // Tmin 24h Change Average: (2.0 + -2.0 + 0.0) / 3 = 0.0
      assert.equal(summary.tmin24hChangeAvg, 0.0);
      assert.equal(summary.tmin24hChangeClass, 'NLC');

      // Tmin Departure Average: (1.0 + -1.0 + -2.0 + 2.0) / 4 = 0.0
      assert.equal(summary.tminDepartureAvg, 0.0);
      assert.equal(summary.tminDepartureClass, 'Normal');

      // Lowest Tmin: 21.0 at Amravati
      assert.equal(summary.lowestTmin.value, 21.0);
      assert.equal(summary.lowestTmin.stationNames, 'Amravati');

      // Rainfall: 4 stations reporting, 2 active (12.0 mm each), 2 dry (0.0)
      // Percentage: round(100 * (4 - 2) / 4) = 50%
      assert.equal(summary.rainfallPercent, 50);
      assert.equal(summary.rainfallDistributionClass, 'SCT'); // 26% to 50% is SCT
      assert.equal(summary.rainfallDistributionColor, '#99ee99');

      // Heaviest rainfall tie: 12.0 at Akola, Amravati
      assert.equal(summary.heaviestRainfall.value, 12.0);
      assert.equal(summary.heaviestRainfall.stationNames, 'Akola, Amravati');

      // Heat wave seasonal flags in May
      assert.equal(summary.isHeatWaveSeason, true);
      assert.equal(summary.isColdWaveSeason, false);
      assert.equal(summary.heatWaveStationsTotal, 4);
      assert.equal(summary.coldWaveStationsTotal, 4);
    });

    it('handles subdivision where all observations are missing gracefully', () => {
      const emptyStations: StationInputData[] = [
        {
          stationId: '00001',
          stationName: 'Blank 1',
          tmax: null,
          tmax24hPrior: null,
          tmaxDepartureStr: null,
          tmin: null,
          tmin24hPrior: null,
          tminDepartureStr: null,
          rh0830: null,
          rh1730: null,
          visibilityCode: null,
          rainfall: null,
        },
      ];

      const summary = calculateSubdivisionReportSummary('99', 'Empty', emptyStations, 1);
      assert.equal(summary.tmax24hChangeAvg, null);
      assert.equal(summary.tmax24hChangeClass, 'N/A');
      assert.equal(summary.tmaxDepartureAvg, null);
      assert.equal(summary.tmaxDepartureClass, 'N/A');
      assert.equal(summary.highestTmax.value, null);
      assert.equal(summary.highestTmax.formattedText, '---');
      assert.equal(summary.rainfallPercent, 0);
      assert.equal(summary.rainfallDistributionClass, 'DRY');
    });
  });

  describe('8. Operational Report Equivalence & Boundary Audits', () => {
    it('classifies floating-point 24h changes across all fractional boundaries seamlessly', () => {
      // Floating numbers near boundaries
      assert.equal(classify24hChange(-4.12), 'MF'); // rounds to -4.1
      assert.equal(classify24hChange(-4.04), 'AF'); // rounds to -4.0
      assert.equal(classify24hChange(-2.06), 'AF'); // rounds to -2.1
      assert.equal(classify24hChange(-2.04), 'NLC'); // rounds to -2.0
      assert.equal(classify24hChange(2.04), 'NLC');  // rounds to 2.0
      assert.equal(classify24hChange(2.06), 'AR');   // rounds to 2.1
      assert.equal(classify24hChange(4.04), 'AR');   // rounds to 4.0
      assert.equal(classify24hChange(4.06), 'MR');   // rounds to 4.1
    });

    it('classifies floating-point departures across all fractional boundaries seamlessly', () => {
      assert.equal(classifyDeparture(-5.04), 'MBN'); // <= -5.0
      assert.equal(classifyDeparture(-4.96), 'MBN'); // rounds to -5.0 -> MBN
      assert.equal(classifyDeparture(-4.94), 'ABN'); // rounds to -4.9 -> ABN
      assert.equal(classifyDeparture(-3.14), 'ABN'); // rounds to -3.1 -> ABN
      assert.equal(classifyDeparture(-3.06), 'ABN'); // rounds to -3.1 -> ABN
      assert.equal(classifyDeparture(-3.04), 'BN');  // rounds to -3.0 -> BN
      assert.equal(classifyDeparture(-1.54), 'Normal'); // rounds to -1.5 -> Normal
      assert.equal(classifyDeparture(1.54), 'Normal');  // rounds to 1.5 -> Normal
      assert.equal(classifyDeparture(1.56), 'AN');      // rounds to 1.6 -> AN
      assert.equal(classifyDeparture(3.04), 'AN');      // rounds to 3.0 -> AN
      assert.equal(classifyDeparture(3.06), 'AAN');     // rounds to 3.1 -> AAN
      assert.equal(classifyDeparture(5.04), 'AAN');     // rounds to 5.0 -> AAN
      assert.equal(classifyDeparture(5.06), 'MAN');     // rounds to 5.1 -> MAN
    });

    it('preserves exact legacy departure formatting conventions', () => {
      // "+2.4", "-1.8", "0", "---"
      assert.equal(formatDeparture(2.4), '+2.4');
      assert.equal(formatDeparture(-1.8), '-1.8');
      assert.equal(formatDeparture(0), '0');
      assert.equal(formatDeparture(0.0), '0');
      assert.equal(formatDeparture(-0.0), '0');
      assert.equal(formatDeparture(null), null);
      assert.equal(formatDeparture(undefined), null);
    });

    it('tests spatial rainfall distribution percentage boundaries exhaustively', () => {
      assert.equal(classifyRainfallDistribution(0).code, 'DRY');
      assert.equal(classifyRainfallDistribution(1).code, 'ISOL');
      assert.equal(classifyRainfallDistribution(25).code, 'ISOL');
      assert.equal(classifyRainfallDistribution(26).code, 'SCT');
      assert.equal(classifyRainfallDistribution(50).code, 'SCT');
      assert.equal(classifyRainfallDistribution(51).code, 'FWS');
      assert.equal(classifyRainfallDistribution(75).code, 'FWS');
      assert.equal(classifyRainfallDistribution(76).code, 'WS');
      assert.equal(classifyRainfallDistribution(100).code, 'WS');
    });

    it('handles 3-way ties for extreme values preserving original encounter order', () => {
      const tiedStations: StationInputData[] = [
        {
          stationId: '01',
          stationName: 'Station Alpha',
          tmax: 42.0,
          tmax24hPrior: null,
          tmaxDepartureStr: null,
          tmin: 15.0,
          tmin24hPrior: null,
          tminDepartureStr: null,
          rh0830: null,
          rh1730: null,
          visibilityCode: null,
          rainfall: 25.0,
        },
        {
          stationId: '02',
          stationName: 'Station Beta',
          tmax: 42.0,
          tmax24hPrior: null,
          tmaxDepartureStr: null,
          tmin: 15.0,
          tmin24hPrior: null,
          tminDepartureStr: null,
          rh0830: null,
          rh1730: null,
          visibilityCode: null,
          rainfall: 25.0,
        },
        {
          stationId: '03',
          stationName: 'Station Gamma',
          tmax: 42.0,
          tmax24hPrior: null,
          tmaxDepartureStr: null,
          tmin: 15.0,
          tmin24hPrior: null,
          tminDepartureStr: null,
          rh0830: null,
          rh1730: null,
          visibilityCode: null,
          rainfall: 25.0,
        },
      ];

      const summary = calculateSubdivisionReportSummary('99', 'Tied', tiedStations, 5);
      assert.equal(summary.highestTmax.stationNames, 'Station Alpha, Station Beta, Station Gamma');
      assert.equal(summary.lowestTmin.stationNames, 'Station Alpha, Station Beta, Station Gamma');
      assert.equal(summary.heaviestRainfall.stationNames, 'Station Alpha, Station Beta, Station Gamma');
      assert.equal(summary.heaviestRainfall.formattedText, '25 at Station Alpha, Station Beta, Station Gamma');
    });
  });

  describe('9. Exact PHP Rounding & Negative Half-Boundary Verification', () => {
    it('verifies all 14 mandatory half-boundary values against PHP away-from-zero rounding', () => {
      // In PHP: round(float, 1) uses PHP_ROUND_HALF_UP (rounds half away from zero)
      assert.equal(roundLikePhp(-4.15, 1), -4.2);
      assert.equal(roundLikePhp(-4.05, 1), -4.1);
      assert.equal(roundLikePhp(-2.15, 1), -2.2);
      assert.equal(roundLikePhp(-2.05, 1), -2.1);
      assert.equal(roundLikePhp(-1.55, 1), -1.6);
      assert.equal(roundLikePhp(-1.05, 1), -1.1);
      assert.equal(roundLikePhp(-0.05, 1), -0.1);
      assert.equal(roundLikePhp(0.05, 1), 0.1);
      assert.equal(roundLikePhp(1.05, 1), 1.1);
      assert.equal(roundLikePhp(1.55, 1), 1.6);
      assert.equal(roundLikePhp(2.05, 1), 2.1);
      assert.equal(roundLikePhp(2.15, 1), 2.2);
      assert.equal(roundLikePhp(4.05, 1), 4.1);
      assert.equal(roundLikePhp(4.15, 1), 4.2);
    });

    it('verifies values just below, at, and just above negative half-boundaries', () => {
      // Around -2.05:
      assert.equal(roundLikePhp(-2.051, 1), -2.1);
      assert.equal(roundLikePhp(-2.050, 1), -2.1);
      assert.equal(roundLikePhp(-2.049, 1), -2.0);

      // Around -4.05:
      assert.equal(roundLikePhp(-4.051, 1), -4.1);
      assert.equal(roundLikePhp(-4.050, 1), -4.1);
      assert.equal(roundLikePhp(-4.049, 1), -4.0);

      // Around 2.05:
      assert.equal(roundLikePhp(2.051, 1), 2.1);
      assert.equal(roundLikePhp(2.050, 1), 2.1);
      assert.equal(roundLikePhp(2.049, 1), 2.0);
    });

    it('normalizes negative zero to positive 0', () => {
      const res = roundLikePhp(-0.04, 1);
      assert.equal(res, 0);
      assert.equal(Object.is(res, -0), false);
    });

    it('classifies 24h change correctly at negative half-boundaries using PHP rounding', () => {
      // -4.05 rounds to -4.1 => MF
      assert.equal(classify24hChange(-4.05), 'MF');
      // -4.04 rounds to -4.0 => AF
      assert.equal(classify24hChange(-4.04), 'AF');
      // -2.05 rounds to -2.1 => AF
      assert.equal(classify24hChange(-2.05), 'AF');
      // -2.04 rounds to -2.0 => NLC
      assert.equal(classify24hChange(-2.04), 'NLC');
    });

    it('classifies departure correctly at negative half-boundaries using PHP rounding', () => {
      // -4.95 rounds to -5.0 => MBN
      assert.equal(classifyDeparture(-4.95), 'MBN');
      // -4.94 rounds to -4.9 => ABN
      assert.equal(classifyDeparture(-4.94), 'ABN');
      // -3.05 rounds to -3.1 => ABN
      assert.equal(classifyDeparture(-3.05), 'ABN');
      // -3.04 rounds to -3.0 => BN
      assert.equal(classifyDeparture(-3.04), 'BN');
      // -1.55 rounds to -1.6 => BN
      assert.equal(classifyDeparture(-1.55), 'BN');
      // -1.54 rounds to -1.5 => Normal
      assert.equal(classifyDeparture(-1.54), 'Normal');
    });
  });
});

