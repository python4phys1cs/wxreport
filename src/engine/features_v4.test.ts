/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryObservationStore,
  MemoryArchiveStorageProvider,
  convertArchiveToCsv,
  validateArchiveData,
  type ObservationArchive,
  type PersistedStationObservation,
} from './observationStore.ts';
import {
  DEFAULT_DISABLED_STATION_IDS,
  getDefaultStationInclusion,
  getExcludedStationIds,
  isStationIncluded,
} from '../utils/stationInclusion.ts';
import { generateDailyReports } from './reportOrchestrator.ts';
import { defaultPentadNormalProvider } from '../providers/pentadNormalProvider.ts';
import { InMemoryHistoricalProvider } from '../providers/fixtureProvider.ts';
import { CANONICAL_STATIONS } from '../constants/stationRegistry.ts';

describe('Feature Suite: Station Exclusion, Raw SYNOP Preservation & Historical Archive Import', () => {
  let store: InMemoryObservationStore;
  let normalProvider: typeof defaultPentadNormalProvider;
  let historicalProvider: InMemoryHistoricalProvider;

  beforeEach(() => {
    store = new InMemoryObservationStore();
    normalProvider = defaultPentadNormalProvider;
    historicalProvider = new InMemoryHistoricalProvider([]);
  });

  describe('1. Configurable Station Exclusions (Bhind 42358 & Ashoknagar 42558 default)', () => {
    it('verifies Bhind (42358) and Ashoknagar (42558) are in DEFAULT_DISABLED_STATION_IDS and disabled by default', () => {
      assert.deepEqual(DEFAULT_DISABLED_STATION_IDS, ['42358', '42558']);

      const defaultMap = getDefaultStationInclusion();
      assert.equal(defaultMap['42358'], false);
      assert.equal(defaultMap['42558'], false);
      assert.equal(defaultMap['42933'], true); // Akola
      assert.equal(defaultMap['42867'], true); // Nagpur
      assert.equal(defaultMap['42665'], true); // Shajapur (active synoptic station)

      const excludedIds = getExcludedStationIds(defaultMap);
      assert.deepEqual(excludedIds, ['42358', '42558']);

      assert.equal(isStationIncluded('42358', defaultMap), false);
      assert.equal(isStationIncluded('42558', defaultMap), false);
      assert.equal(isStationIncluded('42933', defaultMap), true);
      assert.equal(isStationIncluded('42665', defaultMap), true);
    });

    it('filters Ashoknagar (42558) out of reports by default even when observations are present', () => {
      const reportingDate = '2026-05-15';
      // Ingest observations for Ashoknagar (42558), Bhopal (42667), and Akola (42933)
      const synopText = `AAXX 15034
42558 32996 00000 10320 20180 40145 333 20210 58010 555 10000=
42667 32996 00000 10330 20190 40140 333 20220 58010 555 10000=
42933 32996 00000 10340 20200 40135 333 20230 58010 555 10000=`;

      store.ingestBulletin('03Z', synopText, reportingDate);

      // Verify Ashoknagar observation is physically stored in observation store
      const stnInStore = store.getStationObservation('42558', reportingDate);
      assert.ok(stnInStore);
      assert.equal(stnInStore.stationId, '42558');
      assert.equal(stnInStore.tmin, 21.0);

      // Generate reports using default station inclusion (which App.tsx passes)
      const reports = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
        utcSlot: '03Z',
        observationStore: store,
        excludedStationIds: getExcludedStationIds(getDefaultStationInclusion()),
      });

      // Ashoknagar must NOT appear in report subdivisions
      const allStationsInReport = reports.subdivisions.flatMap((s) => s.report1Rows);
      const ashoknagarInReports = allStationsInReport.find((o) => o.stationId === '42558');
      assert.equal(ashoknagarInReports, undefined);

      // But Bhopal (42667) and Akola (42933) must appear
      const akolaInReports = allStationsInReport.find((o) => o.stationId === '42933');
      assert.ok(akolaInReports);

      // Report result records excluded station ID
      assert.ok(reports.excludedStationIds?.includes('42558'));
    });

    it('includes Ashoknagar (42558) in reports when user explicitly enables it in options', () => {
      const reportingDate = '2026-05-15';
      const synopText = `AAXX 15034
42558 32996 00000 10320 20180 40145 333 20210 58010 555 10000=
42933 32996 00000 10340 20200 40135 333 20230 58010 555 10000=`;

      store.ingestBulletin('03Z', synopText, reportingDate);

      // Explicitly pass empty excluded array (all stations included)
      const reports = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
        utcSlot: '03Z',
        observationStore: store,
        excludedStationIds: [],
      });

      const allStations = reports.subdivisions.flatMap((s) => s.report1Rows);
      const ashoknagarInReports = allStations.find((o) => o.stationId === '42558');
      assert.ok(ashoknagarInReports);
      assert.equal(ashoknagarInReports.stationId, '42558');
      assert.equal(ashoknagarInReports.tmin, 21.0);
    });

    it('allows excluding any station dynamically by SYNOP code (e.g. Akola 42933)', () => {
      const reportingDate = '2026-05-15';
      const synopText = `AAXX 15034
42933 32996 00000 10340 20200 40135 333 20230 58010 555 10000=
42937 32596 20203 10280 20216 40138 82500 333 20220 58016 555 10000=`;

      store.ingestBulletin('03Z', synopText, reportingDate);

      // Exclude Akola ('42933')
      const reports = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
        utcSlot: '03Z',
        observationStore: store,
        excludedStationIds: ['42933'],
      });

      const allStations = reports.subdivisions.flatMap((s) => s.report1Rows);
      const akola = allStations.find((o) => o.stationId === '42933');
      const amravati = allStations.find((o) => o.stationId === '42937');

      assert.equal(akola, undefined);
      assert.ok(amravati);
    });
  });

  describe('2. Raw SYNOP Telegram Preservation Across Archive Formats', () => {
    it('preserves rawSynop03Z and rawSynop12Z on ingested station observations', () => {
      const reportingDate = '2026-04-10';
      const raw03Z = '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000';
      const raw12Z = '42933 32996 02502 10390 20210 40120 333 10415 58005 555 10000';

      store.ingestBulletin('03Z', `${raw03Z}=`, reportingDate);
      store.ingestBulletin('12Z', `${raw12Z}=`, reportingDate);

      const obs = store.getStationObservation('42933', reportingDate);
      assert.ok(obs);
      assert.equal(obs.rawSynop03Z, raw03Z);
      assert.equal(obs.rawSynop12Z, raw12Z);
      assert.ok(obs.rawSynop === raw03Z || obs.rawSynop === raw12Z);
    });

    it('round-trips rawSynop strings through exportArchive and JSON serialization', () => {
      const reportingDate = '2026-04-10';
      const raw03Z = '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000';
      store.ingestBulletin('03Z', `${raw03Z}=`, reportingDate);

      const exported = store.exportArchive();
      assert.equal(exported.records[reportingDate]['42933'].rawSynop03Z, raw03Z);
      assert.equal(exported.records[reportingDate]['42933'].rawSynop, raw03Z);

      // JSON round trip
      const jsonStr = JSON.stringify(exported);
      const parsed = JSON.parse(jsonStr);
      const validation = validateArchiveData(parsed);

      assert.equal(validation.valid, true);
      assert.equal(validation.archive?.records[reportingDate]['42933'].rawSynop03Z, raw03Z);
    });

    it('includes raw telegram columns in exported CSV', () => {
      const reportingDate = '2026-04-10';
      const raw03Z = '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000=';
      store.ingestBulletin('03Z', raw03Z, reportingDate);

      const csv = store.exportArchiveCsv();
      const firstLine = csv.split('\r\n')[0];
      assert.ok(firstLine.includes('Raw SYNOP'));
      assert.ok(firstLine.includes('Raw SYNOP 03Z'));
      assert.ok(firstLine.includes('Raw SYNOP 12Z'));

      const dataRow = csv.split('\r\n')[1];
      assert.ok(dataRow.includes('42933 32996 00000 10260 20200 40145'));
    });
  });

  describe('3. Historical Database Import Semantics & Policies', () => {
    it('preserves existing records by default when importing historical archive (preserve_existing)', () => {
      const existingDate = '2026-03-01';
      // Store has Akola with Tmin = 22.0
      store.ingestBulletin('03Z', '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000=', existingDate);

      // Historical archive has Akola on 2026-03-01 with different Tmin = 18.0, plus Gondia (42865)
      const archivePayload: ObservationArchive = {
        metadata: {
          version: '1.0',
          system: 'WXOps',
          exportedAt: new Date().toISOString(),
          retentionLimit: 30,
          dateCount: 1,
          dates: [existingDate],
          stationCount: 2,
        },
        records: {
          [existingDate]: {
            '42933': {
              stationId: '42933',
              reportingDate: existingDate,
              tmin: 18.0,
              tmax: 35.0,
              rainfall: 0,
              rainfall0830: 0,
              rainfall1730: null,
              tmaxDate: null,
              tmaxSlot: null,
              tmaxPreviousDay: null,
              tminDate: existingDate,
              tminSlot: '03Z',
              rh0830: 60,
              rh1730: null,
              dryBulb0830: 25,
              dewPoint0830: 17,
              dryBulb1730: null,
              dewPoint1730: null,
              mslPressure0830: 1012,
              mslPressure1730: null,
              visibilityCode: '96',
              visibilityCode03Z: '96',
              visibilityCode12Z: null,
              has03Z: true,
              has12Z: false,
              lastUpdatedSlot: '03Z',
              lastUpdatedDate: existingDate,
            },
            '42865': {
              stationId: '42865',
              reportingDate: existingDate,
              tmin: 19.5,
              tmax: 34.0,
              rainfall: 2.0,
              rainfall0830: 2.0,
              rainfall1730: null,
              tmaxDate: null,
              tmaxSlot: null,
              tmaxPreviousDay: null,
              tminDate: existingDate,
              tminSlot: '03Z',
              rh0830: 75,
              rh1730: null,
              dryBulb0830: 24,
              dewPoint0830: 19,
              dryBulb1730: null,
              dewPoint1730: null,
              mslPressure0830: 1013,
              mslPressure1730: null,
              visibilityCode: '95',
              visibilityCode03Z: '95',
              visibilityCode12Z: null,
              has03Z: true,
              has12Z: false,
              lastUpdatedSlot: '03Z',
              lastUpdatedDate: existingDate,
            },
          },
        },
      };

      const summary = store.importHistoricalArchive(archivePayload, { duplicatePolicy: 'preserve_existing' });

      assert.equal(summary.success, true);
      assert.equal(summary.recordsAdded, 1); // Gondia added
      assert.equal(summary.recordsSkipped, 1); // Akola duplicate skipped
      assert.equal(summary.recordsUpdated, 0);

      // Verify Akola was preserved with original Tmin = 22.0
      const akola = store.getStationObservation('42933', existingDate);
      assert.equal(akola?.tmin, 22.0);

      // Verify Gondia was added
      const gondia = store.getStationObservation('42865', existingDate);
      assert.equal(gondia?.tmin, 19.5);
    });

    it('overwrites existing records when duplicatePolicy is update_existing', () => {
      const existingDate = '2026-03-01';
      store.ingestBulletin('03Z', '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000=', existingDate);

      const archivePayload: ObservationArchive = {
        metadata: {
          version: '1.0',
          system: 'WXOps',
          exportedAt: new Date().toISOString(),
          retentionLimit: 30,
          dateCount: 1,
          dates: [existingDate],
          stationCount: 1,
        },
        records: {
          [existingDate]: {
            '42933': {
              stationId: '42933',
              reportingDate: existingDate,
              tmin: 18.0,
              tmax: 35.0,
              rainfall: 5.0,
              rainfall0830: 5.0,
              rainfall1730: null,
              tmaxDate: null,
              tmaxSlot: null,
              tmaxPreviousDay: null,
              tminDate: existingDate,
              tminSlot: '03Z',
              rh0830: 60,
              rh1730: null,
              dryBulb0830: 25,
              dewPoint0830: 17,
              dryBulb1730: null,
              dewPoint1730: null,
              mslPressure0830: 1012,
              mslPressure1730: null,
              visibilityCode: '96',
              visibilityCode03Z: '96',
              visibilityCode12Z: null,
              has03Z: true,
              has12Z: false,
              lastUpdatedSlot: '03Z',
              lastUpdatedDate: existingDate,
            },
          },
        },
      };

      const summary = store.importHistoricalArchive(archivePayload, { duplicatePolicy: 'update_existing' });

      assert.equal(summary.success, true);
      assert.equal(summary.recordsUpdated, 1);
      assert.equal(summary.recordsAdded, 0);

      const akola = store.getStationObservation('42933', existingDate);
      assert.equal(akola?.tmin, 18.0);
      assert.equal(akola?.rainfall, 5.0);
    });

    it('merges non-null incoming fields into existing observations when duplicatePolicy is merge_fields', () => {
      const existingDate = '2026-03-01';
      // Ingest 03Z observation (Tmax is null)
      store.ingestBulletin('03Z', '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000=', existingDate);
      const before = store.getStationObservation('42933', existingDate);
      assert.equal(before?.tmin, 22.0);
      assert.equal(before?.tmax, null);

      // Incoming historical archive has Tmin = 15.0 (should not overwrite existing 22.0) and Tmax = 40.5 (should populate null)
      const archivePayload: ObservationArchive = {
        metadata: {
          version: '1.0',
          system: 'WXOps',
          exportedAt: new Date().toISOString(),
          retentionLimit: 30,
          dateCount: 1,
          dates: [existingDate],
          stationCount: 1,
        },
        records: {
          [existingDate]: {
            '42933': {
              stationId: '42933',
              reportingDate: existingDate,
              tmin: 15.0,
              tmax: 40.5,
              rainfall: null,
              rainfall0830: null,
              rainfall1730: null,
              tmaxDate: existingDate,
              tmaxSlot: '12Z',
              tmaxPreviousDay: null,
              tminDate: existingDate,
              tminSlot: '03Z',
              rh0830: null,
              rh1730: 42,
              dryBulb0830: null,
              dewPoint0830: null,
              dryBulb1730: null,
              dewPoint1730: null,
              mslPressure0830: null,
              mslPressure1730: null,
              visibilityCode: null,
              visibilityCode03Z: null,
              visibilityCode12Z: null,
              has03Z: true,
              has12Z: true,
              lastUpdatedSlot: '12Z',
              lastUpdatedDate: existingDate,
            },
          },
        },
      };

      const summary = store.importHistoricalArchive(archivePayload, { duplicatePolicy: 'merge_fields' });
      assert.equal(summary.success, true);
      assert.equal(summary.recordsUpdated, 1);

      const after = store.getStationObservation('42933', existingDate);
      // Existing Tmin remains 22.0
      assert.equal(after?.tmin, 22.0);
      // Null Tmax is now filled with 40.5
      assert.equal(after?.tmax, 40.5);
      // Null rh1730 filled
      assert.equal(after?.rh1730, 42);
    });

    it('rejects malformed archive JSON with a clear error message', () => {
      const summary = store.importHistoricalArchive('{ invalid json payload');
      assert.equal(summary.success, false);
      assert.ok(summary.error?.includes('JSON parse error'));
    });

    it('rejects archive with missing records object', () => {
      const summary = store.importHistoricalArchive({ metadata: { version: '1.0' } });
      assert.equal(summary.success, false);
      assert.ok(summary.error?.includes('records'));
    });

    it('auto-expands retention limit so imported historical dates are retained', () => {
      store.setRetentionLimit(15);

      // Create an archive with 20 distinct dates
      const dates: string[] = [];
      const records: Record<string, Record<string, PersistedStationObservation>> = {};
      for (let day = 1; day <= 20; day++) {
        const d = `2026-02-${day.toString().padStart(2, '0')}`;
        dates.push(d);
        records[d] = {
          '42933': {
            stationId: '42933',
            reportingDate: d,
            tmin: 20 + (day % 5),
            tmax: 35 + (day % 5),
            rainfall: 0,
            rainfall0830: 0,
            rainfall1730: null,
            tmaxDate: d,
            tmaxSlot: '12Z',
            tmaxPreviousDay: null,
            tminDate: d,
            tminSlot: '03Z',
            rh0830: 55,
            rh1730: 35,
            dryBulb0830: 25,
            dewPoint0830: 15,
            dryBulb1730: 34,
            dewPoint1730: 16,
            mslPressure0830: 1012,
            mslPressure1730: 1010,
            visibilityCode: '96',
            visibilityCode03Z: '96',
            visibilityCode12Z: '96',
            has03Z: true,
            has12Z: true,
            lastUpdatedSlot: '12Z',
            lastUpdatedDate: d,
          },
        };
      }

      const archivePayload: ObservationArchive = {
        metadata: {
          version: '1.0',
          system: 'WXOps',
          exportedAt: new Date().toISOString(),
          retentionLimit: 20,
          dateCount: 20,
          dates,
          stationCount: 1,
        },
        records,
      };

      const summary = store.importHistoricalArchive(archivePayload, { retainAllImportedDates: true });
      assert.equal(summary.success, true);
      assert.equal(summary.datesImported.length, 20);
      assert.equal(store.getArchiveSize(), 20);
      assert.ok(store.getRetentionLimit() >= 20);
    });
  });
});
