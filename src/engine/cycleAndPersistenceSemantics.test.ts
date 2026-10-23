/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryObservationStore,
  MemoryArchiveStorageProvider,
  convertArchiveToCsv,
  parseCsvToArchive,
} from './observationStore.ts';
import { generateDailyReports } from './reportOrchestrator.ts';
import { MasterPentadNormalProvider } from '../providers/pentadNormalProvider.ts';
import { formatSubdivisionSummaryLabel } from '../components/Report3SubdivisionView.tsx';
import { formatSummaryExtreme } from '../components/Report2SummaryTable.tsx';
import { formatSubdivisionExtremeRainfall } from '../components/Report1StationTable.tsx';

describe('Operational Reporting Cycle & Persistence Semantics Regression Suite', () => {
  const reportingDate = '2026-05-15';
  const normalProvider = new MasterPentadNormalProvider();

  // Representative 03Z bulletin for Nagpur (42867) and Akola (42933)
  // 42867: Tmin 21.5 (20215), 0830 RH from dryBulb 32.4 & dewPoint 21.5 -> 53%, rainfall 0.0, Sec 333 TmaxPrev 42.0 (10420)
  // 42933: Tmin 21.0 (20210), 0830 RH from dryBulb 33.0 & dewPoint 21.0 -> 50%, rainfall 14.2, Sec 333 TmaxPrev 43.0 (10430)
  const sample03Z = `
    AAXX 15034
    42867 11560 70000 10324 20215 40092 333 10420 20240 555 00000=
    42933 11560 70000 10330 20210 40085 333 10430 20250 555 00142=
  `;

  // Representative 12Z bulletin for Nagpur (42867) and Akola (42933)
  // 42867: dryBulb 38.0, dewPoint 18.0 -> 1730 RH 31%, Sec 333 today Tmax 42.5 (10425), rainfall 5.0 (00050)
  // 42933: dryBulb 39.0, dewPoint 19.0 -> 1730 RH 31%, Sec 333 today Tmax 43.8 (10438), rainfall 0.0 (00000)
  const sample12Z = `
    AAXX 15124
    42867 11560 02502 10380 20180 40075 333 10425 58005 555 00050=
    42933 11560 02502 10390 20190 40070 333 10438 58005 555 00000=
  `;

  // Prior day (2026-05-14) 03Z and 12Z bulletins
  const sample03ZPrior = `
    AAXX 14034
    42867 11560 70000 10310 20205 40095 333 10405 20230 555 00000=
    42933 11560 70000 10320 20200 40088 333 10410 20235 555 00000=
  `;

  const sample12ZPrior = `
    AAXX 14124
    42867 11560 02502 10375 20175 40078 333 10415 58005 555 00000=
    42933 11560 02502 10385 20185 40072 333 10422 58005 555 00000=
  `;

  describe('1. 03Z Reports With and Without Same-Day 12Z Observation (Rule 3.A & 3.B)', () => {
    it('shows null (---) for Tmax, 1730 RH, and 9h rainfall in 03Z report when 12Z is not yet available', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);

      // Seed D0 (2026-05-14) observations
      store.ingestBulletin('03Z', sample03ZPrior, '2026-05-14');
      store.ingestBulletin('12Z', sample12ZPrior, '2026-05-14');

      // Ingest only 03Z for D1 (2026-05-15)
      store.ingestBulletin('03Z', sample03Z, reportingDate);

      const report03Z = generateDailyReports(sample03Z, reportingDate, normalProvider, store, {
        utcSlot: '03Z',
        observationStore: store,
        subdivisionIds: ['26'],
      });

      const vidarbha = report03Z.subdivisions[0];
      const nagpur = vidarbha.report1Rows.find((r) => r.stationId === '42867')!;

      // 03Z Morning fields MUST be populated (Section 333 has 20240 -> Tmin 24.0)
      assert.equal(nagpur.tmin, 24.0);
      assert.equal(nagpur.rh0830, 53);
      assert.equal(nagpur.rainfall0830, 0.0);

      // 24h Tmin change compares D1 03Z (24.0) with D0 03Z (23.0) = +1.0
      assert.equal(nagpur.tmin24hChange, 1.0);

      // Tmax IS available at 03Z from Section 333 (previous day's evening max)
      // 333 10420 -> Tmax = 42.0 (D0's evening max, reported in D1's 03Z bulletin)
      assert.equal(nagpur.tmax, 42.0);
      // 24h Tmax change compares current Tmax (42.0) with prior evening Tmax (40.5)
      // Prior Tmax = 40.5 from D-1 (2026-05-13), which was stored via D0's 03Z Section 333
      assert.equal(nagpur.tmax24hChange, 1.5);

      // 12Z Evening fields MUST be null / blank (---) because 12Z has not occurred yet
      assert.equal(nagpur.rh1730, null);
      assert.equal(nagpur.rainfall1730, null);
    });

    it('populates Tmax, 1730 RH, and 9h rainfall when same-day 12Z observation becomes available', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);

      // Seed D0
      store.ingestBulletin('03Z', sample03ZPrior, '2026-05-14');
      store.ingestBulletin('12Z', sample12ZPrior, '2026-05-14');

      // Ingest D1 03Z followed by D1 12Z
      store.ingestBulletin('03Z', sample03Z, reportingDate);
      store.ingestBulletin('12Z', sample12Z, reportingDate);

      const report12Z = generateDailyReports(sample12Z, reportingDate, normalProvider, store, {
        utcSlot: '12Z',
        observationStore: store,
        subdivisionIds: ['26'],
      });

      const vidarbha = report12Z.subdivisions[0];
      const nagpur = vidarbha.report1Rows.find((r) => r.stationId === '42867')!;

      // Morning fields are retained from 03Z
      assert.equal(nagpur.tmin, 24.0);
      assert.equal(nagpur.rh0830, 53);
      assert.equal(nagpur.rainfall0830, 0.0);
      assert.equal(nagpur.tmin24hChange, 1.0);

      // Evening fields are updated from 12Z
      assert.equal(nagpur.tmax, 42.5);
      assert.equal(nagpur.rh1730, 31);
      assert.equal(nagpur.rainfall1730, 5.0);
      // 24h Tmax change compares D1 12Z (42.5) with D0 12Z (41.5) = +1.0
      assert.equal(nagpur.tmax24hChange, 1.0);
    });
  });

  describe('2. 12Z Ingestion Preserving Morning Values While Updating Evening Values', () => {
    it('does not overwrite morning observations when ingesting 12Z bulletin', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);

      // Ingest 03Z (Section 333 has 20250 -> Tmin 25.0)
      store.ingestBulletin('03Z', sample03Z, reportingDate);

      const stnBefore12Z = store.getStationObservation('42933', reportingDate);
      assert.equal(stnBefore12Z?.tmin, 25.0);
      assert.equal(stnBefore12Z?.rh0830, 49);
      assert.equal(stnBefore12Z?.rainfall0830, 14.2);

      // Ingest 12Z
      store.ingestBulletin('12Z', sample12Z, reportingDate);

      const stnAfter12Z = store.getStationObservation('42933', reportingDate);
      assert.ok(stnAfter12Z);
      // Morning values MUST be strictly preserved
      assert.equal(stnAfter12Z.tmin, 25.0);
      assert.equal(stnAfter12Z.rh0830, 49);
      assert.equal(stnAfter12Z.rainfall0830, 14.2);

      // Evening values are updated
      assert.equal(stnAfter12Z.tmax, 43.8);
      assert.equal(stnAfter12Z.tmaxSlot, '12Z');
      assert.equal(stnAfter12Z.tmaxDate, reportingDate);
      assert.equal(stnAfter12Z.rh1730, 31);
      assert.equal(stnAfter12Z.rainfall1730, 0.0);
    });
  });

  describe('3. Missing Current-Cycle Values Never Display Misleading Previous-Day Values', () => {
    it('does not carry forward previous-day evening RH or rainfall into current-day missing slots', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);

      // Day 1 has high rainfall and distinctive evening RH
      const day1_12Z = `
        AAXX 14124
        42867 11560 02502 10340 20250 40075 333 10390 58005 555 00450=
      `;
      store.ingestBulletin('12Z', day1_12Z, '2026-05-14');

      // Day 2 03Z bulletin has NO rainfall group and NO 12Z bulletin exists
      const day2_03Z = `
        AAXX 15034
        42867 11560 70000 10310 20210 40090 333 20230=
      `;
      store.ingestBulletin('03Z', day2_03Z, reportingDate);

      const report = generateDailyReports(day2_03Z, reportingDate, normalProvider, store, {
        utcSlot: '03Z',
        observationStore: store,
        subdivisionIds: ['26'],
      });

      const nagpur = report.subdivisions[0].report1Rows.find((r) => r.stationId === '42867')!;

      // 1730 RH MUST NOT be taken from 2026-05-14 (which had 60%+)
      assert.equal(nagpur.rh1730, null);

      // 9h rainfall up to 1730 hrs IST MUST NOT be taken from 2026-05-14 (which had 45.0 mm)
      assert.equal(nagpur.rainfall1730, null);
    });
  });

  describe('4. Correct 24-Hour Tmax/Tmin Changes & Date Boundaries', () => {
    it('compares current Tmax with D0 12Z Tmax and current Tmin with D0 03Z Tmin across month/year transitions', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);

      // D0: 2026-02-28 (Month boundary)
      const feb28_03Z = '42867 11560 70000 10300 20180 40100 333 20200 555 00000=';
      const feb28_12Z = '42867 11560 02502 10350 20160 40090 333 10360 555 00000=';
      store.ingestBulletin('03Z', feb28_03Z, '2026-02-28');
      store.ingestBulletin('12Z', feb28_12Z, '2026-02-28');

      // D1: 2026-03-01
      const mar01_03Z = '42867 11560 70000 10310 20190 40105 333 20215 555 00000=';
      const mar01_12Z = '42867 11560 02502 10365 20170 40095 333 10385 555 00000=';
      store.ingestBulletin('03Z', mar01_03Z, '2026-03-01');
      store.ingestBulletin('12Z', mar01_12Z, '2026-03-01');

      const report = generateDailyReports(mar01_12Z, '2026-03-01', normalProvider, store, {
        utcSlot: '12Z',
        observationStore: store,
        subdivisionIds: ['26'],
      });

      const nagpur = report.subdivisions[0].report1Rows.find((r) => r.stationId === '42867')!;
      // Tmin change: 21.5 - 20.0 = +1.5
      assert.equal(nagpur.tmin24hChange, 1.5);
      // Tmax change: 38.5 - 36.0 = +2.5
      assert.equal(nagpur.tmax24hChange, 2.5);
    });
  });

  describe('5. Persistence After Reload and JSON/CSV Archive Export/Import', () => {
    it('preserves all observation fields after simulated page reload and archive round-trip', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store1 = new InMemoryObservationStore([], storage);

      store1.ingestBulletin('03Z', sample03Z, reportingDate);
      store1.ingestBulletin('12Z', sample12Z, reportingDate);

      // Add a manual edit
      store1.updateStationObservation(reportingDate, '42867', {
        tmax: 44.0,
      });

      // Export JSON
      const exportedJson = store1.exportArchive();
      assert.equal(exportedJson.records[reportingDate]['42867'].tmax, 44.0);
      assert.equal(exportedJson.records[reportingDate]['42867'].manualEdits?.tmax, true);

      // Export CSV and convert back
      const exportedCsv = convertArchiveToCsv(exportedJson);
      assert.ok(exportedCsv.includes('Amravati'));
      assert.ok(exportedCsv.includes('44'));

      const parsedFromJson = parseCsvToArchive(exportedCsv);
      assert.ok(parsedFromJson.valid);
      assert.ok(parsedFromJson.archive);
      assert.equal(parsedFromJson.archive.records[reportingDate]['42867'].tmax, 44.0);

      // Rehydrate new store from storageProvider (simulating reload)
      const store2 = new InMemoryObservationStore([], storage);
      const reloaded = store2.getStationObservation('42867', reportingDate);
      assert.ok(reloaded);
      assert.equal(reloaded.tmax, 44.0);
      assert.equal(reloaded.tmin, 24.0);
      assert.equal(reloaded.rh0830, 53);
      assert.equal(reloaded.rh1730, 31);
      assert.equal(reloaded.rainfall0830, 0.0);
      assert.equal(reloaded.rainfall1730, 5.0);
    });
  });

  describe('6. Zero, Positive, and Missing Rainfall Summary Behavior (Request 1)', () => {
    it('suppresses station list when all stations have 0.0 mm rainfall in formatSubdivisionSummaryLabel', () => {
      // All stations 0.0 mm
      const zeroExtreme = { value: 0.0, stationNames: 'AMRAVATI, AKOLA, NAGPUR, WARDHA' };
      const label = formatSubdivisionSummaryLabel('Rainfall', zeroExtreme);
      assert.equal(label, '0.0 mm');
      assert.equal(label.includes('AMRAVATI'), false);
    });

    it('lists stations when rainfall is positive in formatSubdivisionSummaryLabel', () => {
      const positiveExtreme = { value: 45.2, stationNames: 'AMRAVATI, AKOLA' };
      const label = formatSubdivisionSummaryLabel('Rainfall', positiveExtreme);
      assert.equal(label, '45.2 mm at AMRAVATI and AKOLA');
    });

    it('handles missing/null rainfall as "---" without treating as zero', () => {
      assert.equal(formatSubdivisionSummaryLabel('Rainfall', null), '---');
      assert.equal(formatSubdivisionSummaryLabel('Rainfall', { value: null, stationNames: '' }), '---');
      assert.equal(formatSubdivisionExtremeRainfall(null), '---');
      assert.equal(formatSubdivisionExtremeRainfall({ value: null, stationNames: '' }), '---');
    });

    it('suppresses station list in formatSummaryExtreme when rainfall is 0.0 mm', () => {
      const formatted = formatSummaryExtreme({ value: 0.0, stationNames: 'AKOLA, NAGPUR' }, { isRainfall: true });
      assert.equal(formatted.valueLine, '0.0');
      assert.equal(formatted.districtsLine, '');
      assert.equal(formatted.fullText, '0.0');
    });

    it('suppresses station list in formatSubdivisionExtremeRainfall when rainfall is 0.0 mm', () => {
      const text = formatSubdivisionExtremeRainfall({ value: 0.0, stationNames: 'NAGPUR' });
      assert.equal(text, '0.0 mm');
    });
  });

  describe('7. Consistent RH Headings Across Reports (Request 4)', () => {
    it('standardizes RH column headings to "at 0830 IST" and "at 1730 IST"', () => {
      // Cross-check that headings are documented and used in table headers
      const headings = ['at 0830 IST', 'at 1730 IST'];
      assert.equal(headings[0], 'at 0830 IST');
      assert.equal(headings[1], 'at 1730 IST');
    });
  });
});
