/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  roundLikePhp,
  calculate24hChange,
  classify24hChange,
  classifyDeparture,
  classifyRainfallDistribution,
  isStationHeatWave,
  isStationColdWave,
  calculateSubdivisionReportSummary,
  type StationInputData,
} from './reportCalculations.ts';
import { shiftDateString } from '../components/SynopInput.tsx';
import { formatExtremeDistrictList, formatSummaryExtreme } from '../components/Report2SummaryTable.tsx';
import { cleanExtremeStationList, formatSubdivisionSummaryLabel } from '../components/Report3SubdivisionView.tsx';
import { WORKSTATION_IDENTITIES } from '../server/authService.ts';

describe('Targeted Corrections Regression Test Suite', () => {

  describe('1. Print Layout and Report Typography', () => {
    it('restores default browser/system print margins by removing margin overrides from @page in reports.css', () => {
      const cssPath = path.resolve(process.cwd(), 'src/styles/reports.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Ensure @page does NOT contain custom margin overrides (e.g. margin: 5mm ...)
      const printBlock = cssContent.slice(cssContent.indexOf('@media print'));
      const pageMatch = printBlock.match(/@page\s*\{([^}]+)\}/);
      assert.ok(pageMatch, '@page rule must exist in @media print');
      assert.match(pageMatch[1], /size:\s*A4\s*portrait/i);
      assert.doesNotMatch(pageMatch[1], /margin\s*:/i, '@page must not enforce custom margin overrides interfering with Print dialog');
    });

    it('displays station names in UPPERCASE across report tables and extreme components', () => {
      const cssPath = path.resolve(process.cwd(), 'src/styles/reports.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Table station cells must have text-transform: uppercase
      assert.match(
        cssContent,
        /\.cell-station\s*\{[^}]*text-transform:\s*uppercase/s,
        '.cell-station must specify text-transform: uppercase'
      );

      // Report 2 uppercase district list
      assert.equal(formatExtremeDistrictList('nagpur'), 'NAGPUR');
      assert.equal(formatExtremeDistrictList('akola, amravati'), 'AKOLA and AMRAVATI');

      // Report 3 uppercase clean extreme station list
      assert.equal(cleanExtremeStationList('nagpur (Normal)'), 'NAGPUR');
      assert.equal(cleanExtremeStationList('ujjain, morena'), 'UJJAIN and MORENA');
      assert.equal(
        formatSubdivisionSummaryLabel('Max', { value: 42.5, stationNames: 'nagpur' }),
        '42.5 °C at NAGPUR'
      );
    });
  });

  describe('2. Legacy PHP Calculation Equivalence & Discrepancy Fixes', () => {
    it('uses exact PHP away-from-zero rounding for 24-hour temperature changes and subdivision averages', () => {
      // Direct half-boundary rounding (PHP_ROUND_HALF_UP)
      assert.equal(roundLikePhp(-2.05, 1), -2.1);
      assert.equal(roundLikePhp(2.05, 1), 2.1);
      assert.equal(roundLikePhp(-4.05, 1), -4.1);
      assert.equal(roundLikePhp(4.05, 1), 4.1);

      // 24-hour change calculation
      assert.equal(calculate24hChange(40.0, 42.1), -2.1);
      assert.equal(calculate24hChange(42.1, 40.0), 2.1);
      assert.equal(calculate24hChange(30.0, 34.1), -4.1);
      assert.equal(calculate24hChange(34.1, 30.0), 4.1);

      // Classification checks at half-boundaries
      assert.equal(classify24hChange(-4.05), 'MF'); // -4.1
      assert.equal(classify24hChange(-2.05), 'AF'); // -2.1
      assert.equal(classify24hChange(2.05), 'AR');  // 2.1
      assert.equal(classify24hChange(4.05), 'MR');  // 4.1
    });

    it('reproduces PHP Heat Wave classification rules (Tmax >= 45, or Tmax >= 40 with +4.5 <= dep < +6.5)', () => {
      // Rule 1: Tmax >= 45 regardless of normal or departure
      assert.equal(isStationHeatWave(45.0, null), true);
      assert.equal(isStationHeatWave(45.0, '+1.0'), true);
      assert.equal(isStationHeatWave(47.5, '-1.0'), true);

      // Rule 2: Tmax >= 40 with departure between +4.5 and +6.4
      assert.equal(isStationHeatWave(41.0, '+4.5'), true);
      assert.equal(isStationHeatWave(42.5, '+5.5'), true);
      assert.equal(isStationHeatWave(43.0, '+6.4'), true);
      assert.equal(isStationHeatWave(43.0, 5.5), true); // Numeric departure support

      // Boundary exclusions
      assert.equal(isStationHeatWave(41.0, '+4.4'), false); // Below +4.5
      assert.equal(isStationHeatWave(41.0, '+6.5'), false); // >= +6.5
      assert.equal(isStationHeatWave(39.9, '+5.5'), false); // Tmax < 40
      assert.equal(isStationHeatWave(41.0, '-5.0'), false); // Negative departure
    });

    it('reproduces PHP Cold Wave classification rules (Tmin <= 10 and departure <= -4.5)', () => {
      // Tmin <= 10 and departure <= -4.5
      assert.equal(isStationColdWave(10.0, '-4.5'), true);
      assert.equal(isStationColdWave(8.0, '-5.0'), true);
      assert.equal(isStationColdWave(4.0, '-7.2'), true);
      assert.equal(isStationColdWave(7.0, -5.5), true); // Numeric departure support

      // Boundary exclusions
      assert.equal(isStationColdWave(10.1, '-5.0'), false); // Tmin > 10
      assert.equal(isStationColdWave(9.0, '-4.4'), false);  // Departure > -4.5
      assert.equal(isStationColdWave(9.0, '+2.0'), false);  // Positive departure
    });

    it('computes subdivision averages and rainfall spatial percentage using roundLikePhp without Math.round artifacts', () => {
      const stations: StationInputData[] = [
        {
          stationId: '01',
          stationName: 'Station 1',
          tmax: 42.0,
          tmax24hPrior: 44.05, // Change: -2.05 -> rounds to -2.1 in PHP
          tmaxDepartureStr: '+2.4',
          tmin: 9.0,
          tmin24hPrior: 11.05, // Change: -2.05 -> rounds to -2.1 in PHP
          tminDepartureStr: '-4.6', // Cold wave!
          rh0830: 50,
          rh1730: 40,
          visibilityCode: '96',
          rainfall: 5.0,
        },
        {
          stationId: '02',
          stationName: 'Station 2',
          tmax: 45.5, // Heat wave!
          tmax24hPrior: 44.0, // Change: +1.5
          tmaxDepartureStr: '+3.5',
          tmin: 12.0,
          tmin24hPrior: 14.0, // Change: -2.0
          tminDepartureStr: '-1.0',
          rh0830: 60,
          rh1730: 45,
          visibilityCode: '96',
          rainfall: 0.0, // Dry
        },
      ];

      // Month 5 (May)
      const summary = calculateSubdivisionReportSummary('26', 'Vidarbha', stations, 5);

      // Tmax 24h Change total: (-2.1 + 1.5) = -0.6 / 2 = -0.3
      assert.equal(summary.tmax24hChangeAvg, -0.3);
      assert.equal(summary.tmax24hChangeClass, 'NLC');

      // Tmin 24h Change total: (-2.1 + -2.0) = -4.1 / 2 = -2.05 -> rounds to -2.1 in PHP!
      assert.equal(summary.tmin24hChangeAvg, -2.1);
      assert.equal(summary.tmin24hChangeClass, 'AF');

      // Heat wave count: 1 (Station 2 has Tmax 45.5 >= 45)
      assert.equal(summary.heatWaveStationsCount, 1);
      assert.equal(summary.heatWaveStationsTotal, 2);

      // Cold wave count: 1 (Station 1 has Tmin 9 <= 10 and dep -4.6 <= -4.5)
      assert.equal(summary.coldWaveStationsCount, 1);

      // Rainfall percentage: 1 active out of 2 reporting = 50%
      assert.equal(summary.rainfallPercent, 50);
      assert.equal(summary.rainfallDistributionClass, 'SCT');
    });

    it('gracefully handles missing departures "---" and null values in subdivision aggregation without arithmetic error', () => {
      const sparseStations: StationInputData[] = [
        {
          stationId: '01',
          stationName: 'Station Alpha',
          tmax: 38.0,
          tmax24hPrior: 36.0,
          tmaxDepartureStr: '---', // Missing departure
          tmin: 18.0,
          tmin24hPrior: 18.0,
          tminDepartureStr: null,
          rh0830: 50,
          rh1730: null,
          visibilityCode: null,
          rainfall: null,
        },
        {
          stationId: '02',
          stationName: 'Station Beta',
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

      const summary = calculateSubdivisionReportSummary('26', 'Vidarbha', sparseStations, 1);
      assert.equal(summary.tmax24hChangeAvg, 2.0);
      assert.equal(summary.tmaxDepartureAvg, null); // "---" correctly skipped
      assert.equal(summary.tmaxDepartureClass, 'N/A');
      assert.equal(summary.highestTmax.value, 38.0);
      assert.equal(summary.lowestTmin.value, 18.0);
      assert.equal(summary.rainfallPercent, 0);
      assert.equal(summary.rainfallDistributionClass, 'DRY');
    });
  });

  describe('3. Simplified Login Screen', () => {
    it('verifies LoginScreen removes default password hint, banner, and security footer text', () => {
      const loginPath = path.resolve(process.cwd(), 'src/components/LoginScreen.tsx');
      const loginContent = fs.readFileSync(loginPath, 'utf8');

      // 1. No default password hint in placeholder
      assert.doesNotMatch(loginContent, /default:\s*imd123/i);
      assert.match(loginContent, /placeholder="Enter password\.\.\."/);

      // 2. No RESTRICTED ACCESS banner
      assert.doesNotMatch(loginContent, /RESTRICTED ACCESS/);
      assert.doesNotMatch(loginContent, /IMD MET-REP/);

      // 3. No cryptographically signed footer text
      assert.doesNotMatch(loginContent, /Official meteorological operations only/);
      assert.doesNotMatch(loginContent, /cryptographically signed and audited/);

      // 4. Preserves exactly the two workstation identities
      assert.deepEqual(WORKSTATION_IDENTITIES, ['AMSS Nagpur', 'RWFC Nagpur']);
    });
  });

  describe('4. Compact Operational Controls & Date Navigation', () => {
    it('shifts reporting date backwards and forwards with shiftDateString across all calendar transitions', () => {
      // 1. Regular day shift
      assert.equal(shiftDateString('2026-10-15', -1), '2026-10-14');
      assert.equal(shiftDateString('2026-10-15', 1), '2026-10-16');

      // 2. Month transition (March 1 back to Feb 28 in non-leap year 2026)
      assert.equal(shiftDateString('2026-03-01', -1), '2026-02-28');

      // 3. Leap-year month transition (March 1 back to Feb 29 in leap year 2024)
      assert.equal(shiftDateString('2024-03-01', -1), '2024-02-29');

      // 4. End of month forward transition
      assert.equal(shiftDateString('2026-04-30', 1), '2026-05-01');

      // 5. Year transition backwards (Jan 1 back to Dec 31)
      assert.equal(shiftDateString('2026-01-01', -1), '2025-12-31');

      // 6. Year transition forward (Dec 31 to Jan 1)
      assert.equal(shiftDateString('2025-12-31', 1), '2026-01-01');
    });

    it('verifies compact styling for 03Z / 12Z tabs in reports.css', () => {
      const cssPath = path.resolve(process.cwd(), 'src/styles/reports.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // btn-utc-toggle has reduced padding and font size
      assert.match(
        cssContent,
        /\.btn-utc-toggle\s*\{[^}]*padding:\s*0\.25rem/s,
        'btn-utc-toggle should have reduced compact padding'
      );
      assert.match(
        cssContent,
        /\.btn-utc-toggle\s*\{[^}]*font-size:\s*0\.75rem/s,
        'btn-utc-toggle should have compact font-size'
      );
    });

    it('verifies date navigation arrow buttons are integrated in SynopInput.tsx', () => {
      const synopPath = path.resolve(process.cwd(), 'src/components/SynopInput.tsx');
      const synopContent = fs.readFileSync(synopPath, 'utf8');

      assert.match(synopContent, /className="btn-date-nav btn-date-prev"/);
      assert.match(synopContent, /className="btn-date-nav btn-date-next"/);
      assert.match(synopContent, /shiftDateString\(reportingDate,\s*-1\)/);
      assert.match(synopContent, /shiftDateString\(reportingDate,\s*1\)/);
    });
  });

  describe('5. Single SYNOP Checker Verification', () => {
    it('verifies exactly one "Check SYNOP" button exists in SynopInput.tsx', () => {
      const synopPath = path.resolve(process.cwd(), 'src/components/SynopInput.tsx');
      const synopContent = fs.readFileSync(synopPath, 'utf8');

      // Count occurrences of "Check SYNOP" text
      const matches = synopContent.match(/Check SYNOP/g);
      assert.equal(matches?.length, 1, 'SynopInput must have exactly one "Check SYNOP" button');

      // Check button is situated in button-row
      assert.match(
        synopContent,
        /<div className="button-row">[\s\S]*?Check SYNOP[\s\S]*?<\/div>/,
        'Check SYNOP button must be cleanly placed in the operational button-row'
      );

      // Verify validation functionality (panel, issues table) is preserved
      assert.match(synopContent, /className="synop-checker-panel"/);
      assert.match(synopContent, /className="checker-issues-table"/);
    });
  });
});
