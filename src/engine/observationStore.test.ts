/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryObservationStore,
  MemoryArchiveStorageProvider,
  validateArchiveData,
  type ObservationArchive,
} from './observationStore.ts';
import { generateDailyReports } from './reportOrchestrator.ts';
import { defaultPentadNormalProvider } from '../providers/pentadNormalProvider.ts';
import {
  SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
  SAMPLE_OPERATIONAL_12Z_SYNOP_BULLETIN,
} from '../providers/fixtureProvider.ts';
import archiveApiHandler from '../../api/observations/archive.ts';
import { createSessionToken } from '../server/authService.ts';

describe('Operational Observation Store & Ingestion Suite', () => {
  let store: InMemoryObservationStore;

  beforeEach(() => {
    store = new InMemoryObservationStore();
  });

  describe('1. 03 UTC Ingestion Semantics', () => {
    it('correctly ingests and updates 03 UTC fields for Akola (42933)', () => {
      // 03 UTC telegram for Akola:
      // 42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=
      // dryBulb: 26.2, dewPoint: 20.1 -> RH: 69%
      // Section 333: Tmin: 22.6 (20226)
      // Section 555: Rainfall: 0.0 (10000 -> 0.0)
      const bulletin = '42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=';
      const res = store.ingestBulletin('03Z', bulletin, '2026-01-05');

      assert.equal(res.decodedCount, 1);
      assert.deepEqual(res.updatedStationIds, ['42933']);

      const stn = store.getStationObservation('42933');
      assert.ok(stn);
      assert.equal(stn.stationId, '42933');
      assert.equal(stn.tmin, 22.6);
      assert.equal(stn.tminDate, '2026-01-05');
      assert.equal(stn.tminSlot, '03Z');
      assert.equal(stn.rh0830, 69);
      assert.equal(stn.rainfall, 0.0);
      assert.equal(stn.rainfall0830, 0.0);
      assert.equal(stn.visibilityCode, '96');
      assert.equal(stn.mslPressure0830, 1014.7);
      assert.equal(stn.lastUpdatedSlot, '03Z');

      // 12Z fields remain unpopulated
      assert.equal(stn.rh1730, null);
      assert.equal(stn.rainfall1730, null);
    });

    it('updates previous day Tmax if explicitly reported in 03 UTC Section 333', () => {
      // 42865 reports both Tmax (10330 -> 33.0) and Tmin (20210 -> 21.0)
      const bulletin = '42865 32596 53601 10260 20246 39940 40050 333 10330 20210 59002 555 11431=';
      store.ingestBulletin('03Z', bulletin, '2026-01-05');

      const stn = store.getStationObservation('42865');
      assert.ok(stn);
      assert.equal(stn.tmin, 21.0);
      assert.equal(stn.tmax, 33.0);
      assert.equal(stn.tmaxDate, '2026-01-04');
    });
  });

  describe('2. 12 UTC Ingestion Semantics', () => {
    it('correctly ingests and updates 12 UTC fields for Akola (42933)', () => {
      // 12 UTC telegram for Akola:
      // 42933 32996 02502 10385 20210 40120 333 10412 58005 555 10000=
      // dryBulb: 38.5, dewPoint: 21.0 -> RH: 37%
      // Section 333: today's Tmax: 41.2 (10412)
      // Section 555: rainfall: 0.0
      const bulletin = '42933 32996 02502 10385 20210 40120 333 10412 58005 555 10000=';
      const res = store.ingestBulletin('12Z', bulletin, '2026-01-05');

      assert.equal(res.decodedCount, 1);
      assert.deepEqual(res.updatedStationIds, ['42933']);

      const stn = store.getStationObservation('42933');
      assert.ok(stn);
      assert.equal(stn.stationId, '42933');
      assert.equal(stn.tmax, 41.2);
      assert.equal(stn.tmaxDate, '2026-01-05');
      assert.equal(stn.tmaxSlot, '12Z');
      assert.equal(stn.rh1730, 37);
      assert.equal(stn.rainfall1730, 0.0);
      assert.equal(stn.mslPressure1730, 1012.0);
      assert.equal(stn.lastUpdatedSlot, '12Z');

      // 03Z fields remain unpopulated initially
      assert.equal(stn.tmin, null);
      assert.equal(stn.rh0830, null);
    });

    it('correctly ingests 1730 IST accumulated rainfall from Section 555', () => {
      // Gondia (42871) reports 2.5 mm rainfall in Section 555 (00025 -> 2.5 mm) with i_R=1
      const bulletin = '42871 11995 22002 10366 20224 40122 70500 333 10398 58008 555 00025=';
      store.ingestBulletin('12Z', bulletin, '2026-01-05');

      const stn = store.getStationObservation('42871');
      assert.ok(stn);
      assert.equal(stn.tmax, 39.8);
      assert.equal(stn.rainfall1730, 2.5);
      assert.equal(stn.rainfall, 2.5);
    });
  });

  describe('3. Operational Persistence Lifecycle: 03Z → 12Z → next 03Z → next 12Z', () => {
    it('maintains independent persistence across four consecutive observation updates', () => {
      // --- STEP 1: Day 1, 03 UTC (2026-01-05 03Z) ---
      // Akola reports Tmin = 22.6, RH 0830 = 69%, Rainfall = 0.0
      const day1_03z = '42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=';
      store.ingestBulletin('03Z', day1_03z, '2026-01-05');

      let stn = store.getStationObservation('42933');
      assert.ok(stn);
      assert.equal(stn.tmin, 22.6);
      assert.equal(stn.rh0830, 69);
      assert.equal(stn.rainfall, 0.0);
      assert.equal(stn.tmax, null); // No Tmax yet
      assert.equal(stn.rh1730, null);

      // --- STEP 2: Day 1, 12 UTC (2026-01-05 12Z) ---
      // Akola reports Tmax = 41.2, RH 1730 = 37%
      const day1_12z = '42933 32996 02502 10385 20210 40120 333 10412 58005 555 10000=';
      store.ingestBulletin('12Z', day1_12z, '2026-01-05');

      stn = store.getStationObservation('42933');
      assert.ok(stn);
      // Newly updated 12Z fields:
      assert.equal(stn.tmax, 41.2);
      assert.equal(stn.rh1730, 37);
      // Retained 03Z fields:
      assert.equal(stn.tmin, 22.6);
      assert.equal(stn.rh0830, 69);
      assert.equal(stn.rainfall0830, 0.0);

      // --- STEP 3: Day 2, 03 UTC (2026-01-06 03Z) ---
      // Akola reports new Tmin = 21.0, new RH 0830 = 64%, new Rainfall = 1.2 mm, omits Tmax in 333
      const day2_03z = '42933 12996 00000 10250 20176 40145 333 20210 58010 555 00012=';
      store.ingestBulletin('03Z', day2_03z, '2026-01-06');

      stn = store.getStationObservation('42933');
      assert.ok(stn);
      // Newly updated 03Z fields for Day 2:
      assert.equal(stn.tmin, 21.0);
      assert.equal(stn.tminDate, '2026-01-06');
      assert.equal(stn.rh0830, 64);
      assert.equal(stn.rainfall, 1.2);
      // Previous day evening Tmax (41.2 from 2026-01-05 12Z) is carried forward for Day 2 03Z morning reporting:
      assert.equal(stn.tmax, 41.2);
      assert.equal(stn.tmaxDate, '2026-01-05');
      assert.equal(stn.tmaxSlot, '03Z');
      // RH 1730 is unpopulated for Day 2 until 12Z arrives (never carried over from Day 1):
      assert.equal(stn.rh1730, null);
      // Day 1 records remain intact and preserved in archive:
      const day1Obs = store.getStationObservation('42933', '2026-01-05');
      assert.equal(day1Obs?.tmax, 41.2);
      assert.equal(day1Obs?.rh1730, 37);

      // --- STEP 4: Day 2, 12 UTC (2026-01-06 12Z) ---
      // Akola reports new Tmax = 42.5, new RH 1730 = 34%, rainfall = 0.0
      const day2_12z = '42933 32996 02502 10398 20215 40118 333 10425 58004 555 10000=';
      store.ingestBulletin('12Z', day2_12z, '2026-01-06');

      stn = store.getStationObservation('42933');
      assert.ok(stn);
      // Newly updated 12Z fields for Day 2:
      assert.equal(stn.tmax, 42.5);
      assert.equal(stn.tmaxDate, '2026-01-06');
      assert.equal(stn.rh1730, 35);
      // Retained Day 2 03Z fields:
      assert.equal(stn.tmin, 21.0);
      assert.equal(stn.tminDate, '2026-01-06');
      assert.equal(stn.rh0830, 64);
      assert.equal(stn.rainfall0830, 1.2);
    });
  });

  describe('4. Partial Updates & Preservation of Stored Fields', () => {
    it('does not erase existing RH when a new bulletin omits temperature groups', () => {
      // Initial 03Z bulletin with complete fields
      const b1 = '42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=';
      store.ingestBulletin('03Z', b1, '2026-01-05');

      let stn = store.getStationObservation('42933');
      assert.ok(stn);
      assert.equal(stn.rh0830, 69);
      assert.equal(stn.tmin, 22.6);

      // Partial bulletin: reports Tmin and rainfall, but omits Section 1 temperatures (10/// 20///)
      const b2Partial = '42933 32996 00000 1//// 2//// 40147 333 20230 58009 555 10000=';
      store.ingestBulletin('03Z', b2Partial, '2026-01-05');

      stn = store.getStationObservation('42933');
      assert.ok(stn);
      // Tmin is updated:
      assert.equal(stn.tmin, 23.0);
      // Existing rh0830 is NOT erased:
      assert.equal(stn.rh0830, 69);
    });

    it('does not erase existing Tmax when a 12Z bulletin omits Section 333', () => {
      // 12Z with Tmax = 40.0
      const b1 = '42933 32996 02502 10385 20210 40120 333 10400 58005 555 10000=';
      store.ingestBulletin('12Z', b1, '2026-01-05');

      let stn = store.getStationObservation('42933');
      assert.equal(stn?.tmax, 40.0);

      // Follow-up 12Z update with new dry-bulb (yielding new RH), but no Section 333
      const b2No333 = '42933 32996 02502 10390 20200 40120=';
      store.ingestBulletin('12Z', b2No333, '2026-01-05');

      stn = store.getStationObservation('42933');
      assert.ok(stn);
      // Tmax remains 40.0:
      assert.equal(stn.tmax, 40.0);
      // RH 1730 updated (39.0 / 20.0 -> 34%):
      assert.equal(stn.rh1730, 34);
    });

    it('does not erase other stations when a subsequent bulletin updates only a single station', () => {
      // Ingest complete operational 03Z bulletin with 100+ stations
      store.ingestBulletin('03Z', SAMPLE_OPERATIONAL_SYNOP_BULLETIN, '2026-01-05');

      const akola = store.getStationObservation('42933');
      const nagpur = store.getStationObservation('42937');
      assert.ok(akola);
      assert.ok(nagpur);
      assert.equal(akola.tmin, 22.6);
      assert.equal(nagpur.tmin, 22.0);

      // Subsequent bulletin with ONLY Akola updated
      const akolaOnly = '42933 32996 00000 10270 20200 40147 333 20235 58009 555 10000=';
      store.ingestBulletin('03Z', akolaOnly, '2026-01-05');

      // Akola updated:
      assert.equal(store.getStationObservation('42933')?.tmin, 23.5);
      // Nagpur is completely preserved:
      assert.equal(store.getStationObservation('42937')?.tmin, 22.0);
    });
  });

  describe('5. Orchestrator Integration with Persistent Store', () => {
    it('generates reports showing both 03Z and 12Z values in Report 1', () => {
      // 1. Ingest 03Z bulletin
      generateDailyReports(
        SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
        '2026-01-05',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '03Z',
          observationStore: store,
        }
      );

      // 2. Ingest 12Z bulletin
      const result = generateDailyReports(
        SAMPLE_OPERATIONAL_12Z_SYNOP_BULLETIN,
        '2026-01-05',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '12Z',
          observationStore: store,
        }
      );

      const vidarbha = result.subdivisions.find((s) => s.subdivision.id === '26');
      assert.ok(vidarbha);

      // Check Akola (42933) row:
      // Tmin from 03Z: 22.6
      // Tmax from 12Z: 41.2
      // RH 0830 from 03Z: 69%
      // RH 1730 from 12Z: 37%
      const akola = vidarbha.report1Rows.find((r) => r.stationId === '42933');
      assert.ok(akola);
      assert.equal(akola.tmin, 22.6);
      assert.equal(akola.tmax, 41.2);
      assert.equal(akola.rh0830, 69);
      assert.equal(akola.rh1730, 37);

      // Check Nagpur (42937) row:
      // Tmin from 03Z: 22.0
      // Tmax from 12Z: 40.5
      // RH 0830 from 03Z: 68%
      // RH 1730 from 12Z: 41%
      const nagpur = vidarbha.report1Rows.find((r) => r.stationId === '42937');
      assert.ok(nagpur);
      assert.equal(nagpur.tmin, 22.0);
      assert.equal(nagpur.tmax, 40.5);
      assert.equal(nagpur.rh0830, 68);
      assert.equal(nagpur.rh1730, 41);

      // Check Gondia (42871) with 12Z rainfall
      const gondia = vidarbha.report1Rows.find((r) => r.stationId === '42871');
      assert.ok(gondia);
      assert.equal(gondia.tmax, 39.8);
      assert.equal(gondia.rh1730, 44);
      assert.equal(gondia.rainfall, 2.5);
    });

    it('shows null for 12Z parameters on 03Z report when 12Z is unavailable, then updates on 12Z ingestion', () => {
      // Step 1: Day 1, 12 UTC (Tmax recorded at 1730 IST: 41.2)
      generateDailyReports(
        '42933 32996 02502 10385 20210 40120 333 10412 58005 555 10000=',
        '2026-01-05',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '12Z',
          observationStore: store,
        }
      );

      // Step 2: Day 2, 03 UTC (morning observation: Tmin 20.4, RH0830 68)
      const resDay2_03z = generateDailyReports(
        '42933 32996 00000 10245 20180 40145 333 20204 58010 555 10000=',
        '2026-01-06',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '03Z',
          observationStore: store,
        }
      );

      const vidarbha03Z = resDay2_03z.subdivisions.find((s) => s.subdivision.id === '26');
      const akola03Z = vidarbha03Z?.report1Rows.find((r) => r.stationId === '42933');
      assert.ok(akola03Z);

      // Current morning parameters:
      assert.equal(akola03Z.tmin, 20.4);
      assert.equal(akola03Z.rh0830, 68);
      // Previous day evening Tmax (from 2026-01-05 12Z: 41.2) is carried forward to Day 2 03Z report:
      assert.equal(akola03Z.tmax, 41.2);
      // RH 1730 is unavailable on 03Z (never substitutes previous day's evening RH):
      assert.equal(akola03Z.rh1730, null);

      // Step 3: Ingest Day 2, 12 UTC (Tmax 42.5, RH1730 35%)
      const resDay2_12z = generateDailyReports(
        '42933 32996 02502 10398 20215 40118 333 10425 58004 555 10000=',
        '2026-01-06',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '12Z',
          observationStore: store,
        }
      );

      const vidarbha12Z = resDay2_12z.subdivisions.find((s) => s.subdivision.id === '26');
      const akola12Z = vidarbha12Z?.report1Rows.find((r) => r.stationId === '42933');
      assert.ok(akola12Z);

      // Retained morning values:
      assert.equal(akola12Z.tmin, 20.4);
      assert.equal(akola12Z.rh0830, 68);
      // Newly updated 12Z values:
      assert.equal(akola12Z.tmax, 42.5);
      assert.equal(akola12Z.rh1730, 35);
      // 24-hour Tmax change: 42.5 (Day 2 12Z) - 41.2 (Day 1 12Z) = +1.3
      assert.equal(akola12Z.tmax24hChange, 1.3);
    });
  });

  describe('6. Historical Archival & Clear Functionality', () => {
    it('archives daily historical snapshots for prior 24h comparisons', () => {
      store.ingestBulletin(
        '03Z',
        '42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=',
        '2026-01-04'
      );
      store.ingestBulletin(
        '12Z',
        '42933 32996 02502 10385 20210 40120 333 10412 58005 555 10000=',
        '2026-01-04'
      );

      const hist = store.getHistoricalObservation('42933', '2026-01-04');
      assert.ok(hist);
      assert.equal(hist.stationId, '42933');
      assert.equal(hist.date, '2026-01-04');
      assert.equal(hist.tmin, 22.6);
      assert.equal(hist.tmax, 41.2);
      assert.equal(hist.rh0830, 69);
      assert.equal(hist.rh1730, 37);
    });

    it('clears all store state on clear()', () => {
      store.ingestBulletin(
        '03Z',
        '42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=',
        '2026-01-05'
      );
      assert.equal(store.getAllObservations().size, 1);

      store.clear();
      assert.equal(store.getAllObservations().size, 0);
      assert.equal(store.getStationObservation('42933'), null);
    });
  });

  describe('7. 15-Day Archive Retention & Strict Date Pruning', () => {
    it('stores merged observations up to 15 distinct reporting dates', () => {
      // Ingest 15 distinct reporting dates: 2026-01-01 through 2026-01-15
      for (let day = 1; day <= 15; day++) {
        const dateStr = `2026-01-${day.toString().padStart(2, '0')}`;
        const bulletin = `42933 32996 00000 10250 20180 40145 333 20200 58010 555 10000=`;
        store.ingestBulletin('03Z', bulletin, dateStr);
      }

      assert.equal(store.getArchiveSize(), 15);
      const archivedDates = store.getArchivedDates();
      assert.equal(archivedDates.length, 15);
      assert.equal(archivedDates[0], '2026-01-01');
      assert.equal(archivedDates[14], '2026-01-15');
    });

    it('strictly purges the 16th and oldest date when a new date arrives', () => {
      // Ingest 16 consecutive dates: 2026-01-01 through 2026-01-16
      for (let day = 1; day <= 16; day++) {
        const dateStr = `2026-01-${day.toString().padStart(2, '0')}`;
        const bulletin = `42933 32996 00000 10250 20180 40145 333 20200 58010 555 10000=`;
        store.ingestBulletin('03Z', bulletin, dateStr);
      }

      // Archive size must not exceed 15
      assert.equal(store.getArchiveSize(), 15);
      const archivedDates = store.getArchivedDates();
      assert.equal(archivedDates.length, 15);

      // Oldest date 2026-01-01 must have been purged
      assert.equal(archivedDates.includes('2026-01-01'), false);
      // Newest date 2026-01-16 must be present
      assert.equal(archivedDates[0], '2026-01-02');
      assert.equal(archivedDates[14], '2026-01-16');
    });

    it('prevents duplicate date records when subsequent updates arrive for the same date', () => {
      const dateStr = '2026-01-10';
      // First bulletin: 03Z
      store.ingestBulletin('03Z', '42933 32996 00000 10250 20180 40145 333 20200 58010 555 10000=', dateStr);
      assert.equal(store.getArchiveSize(), 1);

      // Second bulletin: 12Z on the SAME date
      store.ingestBulletin('12Z', '42933 32996 02502 10385 20210 40120 333 10410 58005 555 10000=', dateStr);
      assert.equal(store.getArchiveSize(), 1);

      // Third bulletin: updated 03Z on the SAME date
      store.ingestBulletin('03Z', '42933 32996 00000 10255 20185 40145 333 20205 58010 555 10000=', dateStr);
      assert.equal(store.getArchiveSize(), 1);

      const stn = store.getStationObservation('42933', dateStr);
      assert.ok(stn);
      assert.equal(stn.tmin, 20.5);
      assert.equal(stn.tmax, 41.0);
    });
  });

  describe('8. Browser Persistence & Storage Provider Hydration', () => {
    it('persists archive across simulated application reload / reinitialization', () => {
      const storageProvider = new MemoryArchiveStorageProvider();
      const store1 = new InMemoryObservationStore([], storageProvider);

      // Ingest day 1: 03Z and 12Z
      store1.ingestBulletin('03Z', '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000=', '2026-01-05');
      store1.ingestBulletin('12Z', '42933 32996 02502 10390 20210 40120 333 10415 58005 555 10000=', '2026-01-05');

      // Ingest day 2: 03Z
      store1.ingestBulletin('03Z', '42933 12996 00000 10245 20175 40145 333 20205 58010 555 00010=', '2026-01-06');

      // Verify data is saved in storageProvider
      const rawStored = storageProvider.load();
      assert.ok(rawStored);
      assert.equal(rawStored.metadata.dateCount, 2);
      assert.equal(rawStored.metadata.dates[0], '2026-01-05');
      assert.equal(rawStored.metadata.dates[1], '2026-01-06');

      // Simulate browser refresh / page reload by instantiating a new store with the same storage
      const store2 = new InMemoryObservationStore([], storageProvider);

      assert.equal(store2.getArchiveSize(), 2);
      assert.deepEqual(store2.getArchivedDates(), ['2026-01-05', '2026-01-06']);

      const day1 = store2.getStationObservation('42933', '2026-01-05');
      assert.ok(day1);
      assert.equal(day1.tmin, 22.0);
      assert.equal(day1.tmax, 41.5);

      const day2 = store2.getStationObservation('42933', '2026-01-06');
      assert.ok(day2);
      // Day 2 carries forward Day 1's evening Tmax (41.5) for the 03Z morning reporting cycle
      assert.equal(day2.tmax, 41.5);
      assert.equal(day2.tmaxDate, '2026-01-05');
      assert.equal(day2.tmaxSlot, '03Z');
    });
  });

  describe('9. Archive JSON Serialization, Deserialization & Data Integrity', () => {
    it('exports canonical JSON archive conforming to stable schema version 1.0', () => {
      store.ingestBulletin('03Z', '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000=', '2026-01-05');
      const archive = store.exportArchive();

      assert.equal(archive.metadata.version, '1.0');
      assert.equal(archive.metadata.system, 'WXOps');
      assert.equal(archive.metadata.retentionLimit, 15);
      assert.equal(archive.metadata.dateCount, 1);
      assert.equal(archive.metadata.dates[0], '2026-01-05');
      assert.equal(archive.metadata.stationCount, 1);
      assert.ok(archive.records['2026-01-05']);
      assert.ok(archive.records['2026-01-05']['42933']);
      assert.equal(archive.records['2026-01-05']['42933'].tmin, 22.0);

      const jsonStr = store.exportArchiveJson(true);
      assert.ok(typeof jsonStr === 'string');
      const reParsed = JSON.parse(jsonStr);
      assert.equal(reParsed.metadata.version, '1.0');
    });

    it('rejects malformed archive payloads during validation', () => {
      assert.equal(validateArchiveData(null).valid, false);
      assert.equal(validateArchiveData(undefined).valid, false);
      assert.equal(validateArchiveData('not an object').valid, false);
      assert.equal(validateArchiveData({ version: '2.0', records: {} }).valid, false);
      assert.equal(validateArchiveData({ records: null }).valid, false);
      assert.equal(validateArchiveData({ records: { 'invalid-date': {} } }).valid, false);
      assert.equal(validateArchiveData({ records: { '2026-01-05': { '': {} } } }).valid, false);
    });

    it('restores valid archive JSON and rejects corrupt strings', () => {
      store.ingestBulletin('03Z', '42933 32996 00000 10260 20200 40145 333 20220 58009 555 10000=', '2026-01-05');
      const exportedJson = store.exportArchiveJson();

      const newStore = new InMemoryObservationStore();
      assert.equal(newStore.getArchiveSize(), 0);

      const result = newStore.restoreArchive(exportedJson);
      assert.equal(result.success, true);
      assert.equal(result.datesRestored.length, 1);
      assert.equal(result.datesRestored[0], '2026-01-05');
      assert.equal(result.stationCount, 1);

      // Verify restored content
      const obs = newStore.getStationObservation('42933', '2026-01-05');
      assert.ok(obs);
      assert.equal(obs.tmin, 22.0);

      // Reject invalid JSON syntax
      const badResult = newStore.restoreArchive('{ corrupt: json ...');
      assert.equal(badResult.success, false);
      assert.ok(badResult.error?.includes('JSON parse error'));
    });
  });

  describe('10. Archive HTTP API Endpoint Contract (/api/observations/archive)', () => {
    let origSupabaseUrl: string | undefined;
    let origServiceKey: string | undefined;

    beforeEach(() => {
      origSupabaseUrl = process.env.SUPABASE_URL;
      origServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });

    afterEach(() => {
      if (origSupabaseUrl !== undefined) process.env.SUPABASE_URL = origSupabaseUrl;
      if (origServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origServiceKey;
    });

    function createMockHttp(
      method: 'GET' | 'POST' | 'PUT',
      body?: unknown,
      headersInput?: Record<string, string>,
      noAuth: boolean = false
    ) {
      const headers: Record<string, string> = {
        ...(noAuth ? {} : { authorization: `Bearer ${createSessionToken('AMSS Nagpur')}` }),
        ...(headersInput || {}),
      };
      const req = { method, body, headers };
      let statusCode = 200;
      const responseHeaders: Record<string, string> = {};
      let responseBody: any = null;

      const res = {
        status(code: number) {
          statusCode = code;
          return res;
        },
        setHeader(name: string, value: string) {
          responseHeaders[name.toLowerCase()] = value;
          return res;
        },
        send(data: string) {
          responseBody = data;
          return res;
        },
        json(data: any) {
          responseBody = data;
          return res;
        },
      };

      return {
        req,
        res,
        getStatusCode: () => statusCode,
        getHeaders: () => responseHeaders,
        getBody: () => responseBody,
      };
    }

    it('rejects unauthenticated requests with 401', async () => {
      const { req, res, getStatusCode, getBody } = createMockHttp('GET', undefined, undefined, true);
      await archiveApiHandler(req, res);
      assert.equal(getStatusCode(), 401);
      assert.ok(getBody().error);
    });

    it('GET returns 200 with JSON attachment and canonical archive payload', async () => {
      const { req, res, getStatusCode, getHeaders, getBody } = createMockHttp('GET');
      await archiveApiHandler(req, res);

      assert.equal(getStatusCode(), 200);
      assert.equal(getHeaders()['content-type'], 'application/json; charset=utf-8');
      assert.ok(getHeaders()['content-disposition'].startsWith('attachment; filename="wxops_archive_'));

      const parsed = JSON.parse(getBody());
      assert.equal(parsed.metadata.version, '1.0');
      assert.equal(parsed.metadata.system, 'WXOps');
      assert.equal(parsed.metadata.retentionLimit, 15);
      assert.ok(typeof parsed.records === 'object');
    });

    it('POST restores valid archive and returns 200', async () => {
      const validPayload: ObservationArchive = {
        metadata: {
          version: '1.0',
          system: 'WXOps',
          exportedAt: new Date().toISOString(),
          retentionLimit: 15,
          dateCount: 1,
          dates: ['2026-01-05'],
          stationCount: 1,
        },
        records: {
          '2026-01-05': {
            '42933': {
              stationId: '42933',
              reportingDate: '2026-01-05',
              tmax: 41.2,
              tmaxDate: '2026-01-05',
              tmaxSlot: '12Z',
              tmin: 22.6,
              tminDate: '2026-01-05',
              tminSlot: '03Z',
              rh0830: 69,
              rh1730: 37,
              dryBulb0830: 26.2,
              dewPoint0830: 20.1,
              dryBulb1730: 38.5,
              dewPoint1730: 21.0,
              rainfall0830: 0.0,
              rainfall1730: 0.0,
              rainfall: 0.0,
              mslPressure0830: 1014.7,
              mslPressure1730: 1012.0,
              visibilityCode: null,
              lastUpdatedSlot: '12Z',
              lastUpdatedDate: '2026-01-05',
            },
          },
        },
      };

      const { req, res, getStatusCode, getBody } = createMockHttp('POST', validPayload);
      await archiveApiHandler(req, res);

      assert.equal(getStatusCode(), 200);
      assert.equal(getBody().success, true);
      assert.deepEqual(getBody().datesRestored, ['2026-01-05']);
      assert.equal(getBody().stationCount, 1);
    });

    it('POST returns 400 when given invalid or corrupt payload', async () => {
      const { req, res, getStatusCode, getBody } = createMockHttp('POST', { bad: 'data' });
      await archiveApiHandler(req, res);

      assert.equal(getStatusCode(), 400);
      assert.equal(getBody().success, false);
      assert.ok(getBody().error);
    });

    it('returns 405 Method Not Allowed for unsupported verbs', async () => {
      const { req, res, getStatusCode, getHeaders } = createMockHttp('PUT');
      await archiveApiHandler(req, res);

      assert.equal(getStatusCode(), 405);
      assert.ok(getHeaders()['allow']);
    });
  });

  describe('Revised Station Code (Explicit Station-Level Merge)', () => {
    it('updates only the revised station and preserves other stations for 03Z', () => {
      const store = new InMemoryObservationStore();
      const date = '2026-02-10';

      // 1. Initial 03 UTC bulletin with 3 stations: Akola (42933), Amravati (42937), Gondia (42865)
      const initialBulletin = `AAXX 10034
42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=
42937 32596 20203 10280 20216 40138 82500 333 20220 58016 555 10000=
42865 32596 53601 10260 20246 39940 40050 333 10330 20210 59002 555 11431=`;

      store.ingestBulletin('03Z', initialBulletin, date);

      const akolaBefore = store.getStationObservation('42933', date);
      const amravatiBefore = store.getStationObservation('42937', date);
      const gondiaBefore = store.getStationObservation('42865', date);

      assert.ok(akolaBefore && amravatiBefore && gondiaBefore);
      assert.equal(amravatiBefore.tmin, 22.0); // 20220 -> 22.0
      assert.equal(akolaBefore.tmin, 22.6); // 20226 -> 22.6

      // 2. Revised Station Code bulletin with Amravati ONLY (corrected tmin = 19.5, 20195)
      const revisedBulletinAmravati = `AAXX 10034
42937 32596 20203 10280 20216 40138 82500 333 20195 58016 555 10000=`;

      const result = store.ingestRevisedBulletin('03Z', revisedBulletinAmravati, date);

      assert.equal(result.slot, '03Z');
      assert.equal(result.decodedCount, 1);
      assert.deepEqual(result.updatedStationIds, ['42937']);

      const akolaAfter = store.getStationObservation('42933', date);
      const amravatiAfter = store.getStationObservation('42937', date);
      const gondiaAfter = store.getStationObservation('42865', date);

      // Amravati was updated
      assert.ok(amravatiAfter);
      assert.equal(amravatiAfter.tmin, 19.5);

      // Akola and Gondia remain completely unchanged
      assert.ok(akolaAfter);
      assert.equal(akolaAfter.tmin, akolaBefore.tmin);
      assert.equal(akolaAfter.rh0830, akolaBefore.rh0830);
      assert.equal(akolaAfter.rainfall0830, akolaBefore.rainfall0830);

      assert.ok(gondiaAfter);
      assert.equal(gondiaAfter.tmin, gondiaBefore.tmin);
      assert.equal(gondiaAfter.rainfall0830, gondiaBefore.rainfall0830);

      // Total count of stations in archive for this date is still 3
      const allObs = store.getAllObservations(date);
      assert.equal(allObs.size, 3);
    });

    it('updates only the revised station and preserves other stations for 12Z', () => {
      const store = new InMemoryObservationStore();
      const date = '2026-02-10';

      // 1. Initial 12 UTC bulletin with 2 stations
      const initial12Z = `AAXX 10124
42933 32996 00000 10385 20201 40147 333 10392=
42937 32596 20203 10370 20216 40138 333 10378=`;

      store.ingestBulletin('12Z', initial12Z, date);

      const akolaBefore = store.getStationObservation('42933', date);
      const amravatiBefore = store.getStationObservation('42937', date);
      assert.equal(akolaBefore?.tmax, 39.2);
      assert.equal(amravatiBefore?.tmax, 37.8);

      // 2. Revised Station Code for Akola ONLY with corrected Tmax = 41.5 (10415)
      const revisedAkola = `AAXX 10124
42933 32996 00000 10385 20201 40147 333 10415=`;

      store.ingestRevisedBulletin('12Z', revisedAkola, date);

      const akolaAfter = store.getStationObservation('42933', date);
      const amravatiAfter = store.getStationObservation('42937', date);

      assert.equal(akolaAfter?.tmax, 41.5);
      assert.equal(amravatiAfter?.tmax, 37.8); // Amravati untouched
    });
  });

  describe('Operational 12Z evening Max Temp carry-forward to next day 03Z report', () => {
    it('carries forward 24 Oct 12Z Max Temp to 25 Oct 03Z report even before 25 Oct bulletin is entered', () => {
      const store = new InMemoryObservationStore();

      // User enters 24 Oct 12Z bulletin with Akola (42933) Tmax 33.5 and Nagpur (42867) Tmax 34.2
      const synop24Oct12Z = `AAXX 24124
42933 32996 02502 10325 20195 40120 333 10335 58005 555 10000=
42867 32996 02502 10330 20190 40125 333 10342 58004 555 10000=`;

      store.ingestBulletin('12Z', synop24Oct12Z, '2026-10-24');

      // Now user views or generates 25 Oct 03Z report (no 25 Oct bulletin entered yet)
      const res03Z = generateDailyReports(
        '',
        '2026-10-25',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '03Z',
          observationStore: store,
        }
      );

      const vidarbha = res03Z.subdivisions.find((s) => s.subdivision.id === '26');
      assert.ok(vidarbha);

      const akola = vidarbha.report1Rows.find((r) => r.stationId === '42933');
      assert.ok(akola);
      assert.equal(akola.tmax, 33.5, '24 Oct 12Z Tmax (33.5) must carry forward to 25 Oct 03Z report for Akola');
      assert.ok(akola.tmaxDeparture !== null, 'Tmax departure must be calculated against pentad');

      const nagpur = vidarbha.report1Rows.find((r) => r.stationId === '42867');
      assert.ok(nagpur);
      assert.equal(nagpur.tmax, 34.2, '24 Oct 12Z Tmax (34.2) must carry forward to 25 Oct 03Z report for Nagpur');

      // RH1730 must NOT be carried forward to 03Z report
      assert.equal(akola.rh1730, null);
      assert.equal(nagpur.rh1730, null);
    });

    it('carries forward 24 Oct 12Z Max Temp when 25 Oct 03Z bulletin omits Section 333 Group 1', () => {
      const store = new InMemoryObservationStore();

      // 1. Ingest 24 Oct 12Z
      const synop24Oct12Z = `AAXX 24124
42933 32996 02502 10325 20195 40120 333 10358 58005 555 10000=`;
      store.ingestBulletin('12Z', synop24Oct12Z, '2026-10-24');

      // 2. Ingest 25 Oct 03Z telegram with Tmin 21.0, but omitting Section 333 Group 1 (only 20210 for Tmin)
      const synop25Oct03Z = `AAXX 25034
42933 32996 00000 10250 20185 40150 333 20210 58010 555 10000=`;
      const res03Z = generateDailyReports(
        synop25Oct03Z,
        '2026-10-25',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '03Z',
          observationStore: store,
        }
      );

      const vidarbha = res03Z.subdivisions.find((s) => s.subdivision.id === '26');
      const akola = vidarbha?.report1Rows.find((r) => r.stationId === '42933');
      assert.ok(akola);

      // Morning 25 Oct 03Z values:
      assert.equal(akola.tmin, 21.0);
      // Carried forward Tmax from 24 Oct 12Z:
      assert.equal(akola.tmax, 35.8, 'Tmax from 24 Oct 12Z must carry forward to 25 Oct 03Z');
      assert.ok(akola.tmaxDeparture !== null, 'Tmax departure must be computed');

      // 3. When 25 Oct 12Z arrives, it updates Tmax to 25 Oct afternoon reading:
      const synop25Oct12Z = `AAXX 25124
42933 32996 02502 10365 20190 40115 333 10372 58005 555 10000=`;
      const res12Z = generateDailyReports(
        synop25Oct12Z,
        '2026-10-25',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '12Z',
          observationStore: store,
        }
      );

      const vidarbha12Z = res12Z.subdivisions.find((s) => s.subdivision.id === '26');
      const akola12Z = vidarbha12Z?.report1Rows.find((r) => r.stationId === '42933');
      assert.ok(akola12Z);
      assert.equal(akola12Z.tmin, 21.0, 'Retains morning Tmin');
      assert.equal(akola12Z.tmax, 37.2, 'Updated with 25 Oct 12Z afternoon Tmax');
    });

    it('propagates 24 Oct 12Z Tmax even if 25 Oct 03Z was ingested prior to 24 Oct 12Z', () => {
      const store = new InMemoryObservationStore();

      // 1. Ingest 25 Oct 03Z first (without Section 333 Group 1)
      const synop25Oct03Z = `AAXX 25034
42933 32996 00000 10250 20185 40150 333 20205 58010 555 10000=`;
      store.ingestBulletin('03Z', synop25Oct03Z, '2026-10-25');

      // Check initially 25 Oct has no Tmax
      const obsBefore = store.getStationObservation('42933', '2026-10-25');
      assert.equal(obsBefore?.tmax, null);

      // 2. Later, forecaster enters 24 Oct 12Z
      const synop24Oct12Z = `AAXX 24124
42933 32996 02502 10325 20195 40120 333 10364 58005 555 10000=`;
      store.ingestBulletin('12Z', synop24Oct12Z, '2026-10-24');

      // 3. 25 Oct record in store is forward-propagated with 24 Oct 12Z Tmax
      const obsAfter = store.getStationObservation('42933', '2026-10-25');
      assert.equal(obsAfter?.tmax, 36.4, '25 Oct record must have 24 Oct 12Z Tmax');

      // 4. Report for 25 Oct 03Z now displays 36.4
      const res03Z = generateDailyReports(
        '',
        '2026-10-25',
        defaultPentadNormalProvider,
        undefined,
        {
          utcSlot: '03Z',
          observationStore: store,
        }
      );
      const akolaReport = res03Z.subdivisions
        .find((s) => s.subdivision.id === '26')
        ?.report1Rows.find((r) => r.stationId === '42933');
      assert.equal(akolaReport?.tmax, 36.4);
    });
  });
});

