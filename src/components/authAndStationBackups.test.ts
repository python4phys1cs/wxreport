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
  validateArchiveData,
  type ObservationArchive,
} from '../engine/observationStore.ts';
import { getStation } from '../constants/stationRegistry.ts';
import { authClient } from '../auth/authClient.ts';
import {
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
} from '../server/authService.ts';

describe('Station Names in Backups & Operational Authentication Suite', () => {
  const reportingDate = '2026-05-20';

  // Sample 03Z bulletin for Nagpur (42867) and Akola (42933)
  const sample03Z = `
    AAXX 20034
    42867 11560 70000 10324 20215 40092 333 10420 20240 555 00000=
    42933 11560 70000 10330 20210 40085 333 10430 20250 555 00000=
  `;

  describe('1. Station Names in JSON & CSV Backups', () => {
    it('populates canonical station name in JSON archive export', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);
      store.ingestBulletin('03Z', sample03Z, reportingDate);

      // Perform a manual edit on Nagpur Tmax to ensure manual edit metadata is also present
      store.updateStationObservation(reportingDate, '42867', { tmax: 43.5 });

      const archive = store.exportArchive();
      assert.ok(archive.records[reportingDate]);

      // Check Nagpur (42867)
      const nagpur = archive.records[reportingDate]['42867'];
      assert.equal(nagpur.stationId, '42867');
      assert.equal(nagpur.stationName, 'Amravati'); // Canonical name in registry
      assert.equal(nagpur.tmax, 43.5);
      assert.equal(nagpur.manualEdits?.tmax, true);
      assert.ok(nagpur.rawSynop?.includes('42867'));

      // Check Akola (42933)
      const akola = archive.records[reportingDate]['42933'];
      assert.equal(akola.stationId, '42933');
      assert.equal(akola.stationName, 'Akola');
      assert.equal(akola.tmax, 43.0);
      assert.ok(akola.rawSynop?.includes('42933'));
    });

    it('populates Station Name column in CSV archive export', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);
      store.ingestBulletin('03Z', sample03Z, reportingDate);

      const csv = store.exportArchiveCsv();
      const lines = csv.split('\r\n');
      const headerLine = lines[0];

      // Header must contain 'Station Name'
      assert.ok(headerLine.includes('Station Name'));
      assert.ok(headerLine.startsWith('Reporting Date,Station ID,Station Name,Tmax (C)'));

      // Data lines must contain station names
      const nagpurLine = lines.find((l) => l.includes('42867'));
      assert.ok(nagpurLine);
      assert.ok(nagpurLine.includes('Amravati'));

      const akolaLine = lines.find((l) => l.includes('42933'));
      assert.ok(akolaLine);
      assert.ok(akolaLine.includes('Akola'));
    });

    it('preserves backward compatibility when importing older JSON archives lacking stationName', () => {
      // Legacy archive JSON with no stationName property
      const legacyArchive: ObservationArchive = {
        metadata: {
          version: '1.0',
          system: 'WXOps',
          exportedAt: '2026-01-01T00:00:00.000Z',
          retentionLimit: 15,
          dateCount: 1,
          dates: ['2026-01-01'],
          stationCount: 2,
        },
        records: {
          '2026-01-01': {
            '42933': {
              stationId: '42933',
              // stationName deliberately missing
              reportingDate: '2026-01-01',
              tmax: 31.0,
              tmaxDate: '2026-01-01',
              tmaxSlot: '03Z',
              tmin: 16.5,
              tminDate: '2026-01-01',
              tminSlot: '03Z',
              rh0830: 60,
              rh1730: null,
              dryBulb0830: 24.0,
              dewPoint0830: 16.0,
              dryBulb1730: null,
              dewPoint1730: null,
              rainfall0830: 0.0,
              rainfall1730: null,
              rainfall: 0.0,
              mslPressure0830: 1013.2,
              mslPressure1730: null,
              visibilityCode: '96',
              lastUpdatedSlot: '03Z',
              lastUpdatedDate: '2026-01-01',
              rawSynop: '42933 11560 70000 10240 20160 40132 333 10310 20165 555 00000=',
            },
          },
        },
      };

      const validation = validateArchiveData(legacyArchive);
      assert.equal(validation.valid, true);
      assert.ok(validation.archive);

      // Canonical name must be resolved automatically from registry
      const restoredObs = validation.archive.records['2026-01-01']['42933'];
      assert.equal(restoredObs.stationId, '42933');
      assert.equal(restoredObs.stationName, 'Akola');
    });

    it('preserves backward compatibility when importing older CSV archives lacking Station Name column', () => {
      // Legacy CSV format without Station Name column
      const legacyCsv = [
        'Reporting Date,Station ID,Tmax (C),Tmax Date,Tmax Slot,Tmin (C),Tmin Date,Tmin Slot,RH 0830 (%),RH 1730 (%),Dry Bulb 0830 (C),Dew Point 0830 (C),Dry Bulb 1730 (C),Dew Point 1730 (C),Rainfall 0830 (mm),Rainfall 1730 (mm),Rainfall (mm),Visibility Code,MSLP 0830 (hPa),MSLP 1730 (hPa),Last Updated Slot,Last Updated Date,Raw SYNOP,Raw SYNOP 03Z,Raw SYNOP 12Z,Manual Edits',
        '2026-01-01,42933,31.0,2026-01-01,03Z,16.5,2026-01-01,03Z,60,,24.0,16.0,,,0.0,,0.0,96,1013.2,,03Z,2026-01-01,rawsynoptext,,,',
      ].join('\r\n');

      const parsed = parseCsvToArchive(legacyCsv);
      assert.equal(parsed.valid, true);
      assert.ok(parsed.archive);

      const restored = parsed.archive.records['2026-01-01']['42933'];
      assert.equal(restored.stationId, '42933');
      // Must automatically populate canonical station name
      assert.equal(restored.stationName, 'Akola');
      assert.equal(restored.tmax, 31.0);
    });

    it('treats station code as authoritative and does not trust imported names over canonical registry', () => {
      // CSV where someone maliciously or mistakenly labeled 42933 as "Bhopal"
      const tamperedCsv = [
        'Reporting Date,Station ID,Station Name,Tmax (C)',
        '2026-01-01,42933,Bhopal Fake Name,32.0',
      ].join('\r\n');

      const parsed = parseCsvToArchive(tamperedCsv);
      assert.equal(parsed.valid, true);
      assert.ok(parsed.archive);

      const stn = parsed.archive.records['2026-01-01']['42933'];
      assert.equal(stn.stationId, '42933');
      // Registry name 'Akola' MUST take precedence over 'Bhopal Fake Name'
      assert.equal(stn.stationName, 'Akola');
    });

    it('round-trips JSON and CSV exports preserving station names, raw SYNOP, and manual edits', () => {
      const storage = new MemoryArchiveStorageProvider();
      const store = new InMemoryObservationStore([], storage);
      store.ingestBulletin('03Z', sample03Z, reportingDate);
      store.updateStationObservation(reportingDate, '42867', {
        tmax: 44.2,
        rainfall: 18.0,
      });

      // 1. JSON Round-trip
      const jsonStr = store.exportArchiveJson();
      const parsedJson = JSON.parse(jsonStr);
      const storeFromJson = new InMemoryObservationStore([], new MemoryArchiveStorageProvider());
      const jsonRestore = storeFromJson.restoreArchive(parsedJson);
      assert.equal(jsonRestore.success, true);

      const jsonObs = storeFromJson.getStationObservation('42867', reportingDate);
      assert.equal(jsonObs?.stationName, 'Amravati');
      assert.equal(jsonObs?.tmax, 44.2);
      assert.equal(jsonObs?.rainfall, 18.0);
      assert.equal(jsonObs?.manualEdits?.tmax, true);
      assert.ok(jsonObs?.rawSynop);

      // 2. CSV Round-trip
      const csvStr = store.exportArchiveCsv();
      const parsedFromCsv = parseCsvToArchive(csvStr);
      assert.equal(parsedFromCsv.valid, true);
      assert.ok(parsedFromCsv.archive);

      const storeFromCsv = new InMemoryObservationStore([], new MemoryArchiveStorageProvider());
      const csvRestore = storeFromCsv.restoreArchive(parsedFromCsv.archive);
      assert.equal(csvRestore.success, true);

      const csvObs = storeFromCsv.getStationObservation('42867', reportingDate);
      assert.equal(csvObs?.stationName, 'Amravati');
      assert.equal(csvObs?.tmax, 44.2);
      assert.equal(csvObs?.rainfall, 18.0);
      assert.equal(csvObs?.manualEdits?.tmax, true);
      assert.ok(csvObs?.rawSynop);
    });
  });

  describe('2. Workstation Authentication & Protected Access', () => {
    it('authenticates AMSS Nagpur with initial password imd123 and yields session token', () => {
      const check = verifyCredentials('AMSS Nagpur', 'imd123');
      assert.equal(check.valid, true);
      assert.equal(check.identity, 'AMSS Nagpur');

      const token = createSessionToken(check.identity);
      const verify = verifySessionToken(token);
      assert.equal(verify.valid, true);
      assert.equal(verify.identity, 'AMSS Nagpur');
    });

    it('authenticates RWFC Nagpur with initial password imd123 and yields session token', () => {
      const check = verifyCredentials('RWFC Nagpur', 'imd123');
      assert.equal(check.valid, true);
      assert.equal(check.identity, 'RWFC Nagpur');

      const token = createSessionToken(check.identity);
      const verify = verifySessionToken(token);
      assert.equal(verify.valid, true);
      assert.equal(verify.identity, 'RWFC Nagpur');
    });

    it('rejects incorrect credentials without generating a session token', () => {
      const badPass = verifyCredentials('AMSS Nagpur', 'wrong-password-999');
      assert.equal(badPass.valid, false);
      assert.equal(badPass.identity, undefined);
      assert.ok(badPass.error);

      const badIdentity = verifyCredentials('Unknown Workstation', 'imd123');
      assert.equal(badIdentity.valid, false);
      assert.equal(badIdentity.identity, undefined);
    });

    it('manages client-side session storage safely on login and logout', () => {
      // Mock window.sessionStorage if not present in Node test runner
      if (typeof window === 'undefined') {
        const store = new Map<string, string>();
        (globalThis as any).window = {
          sessionStorage: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
            removeItem: (k: string) => store.delete(k),
            clear: () => store.clear(),
          },
        };
      }

      // Initial state: empty
      authClient.clearStoredSession();
      assert.equal(authClient.getStoredToken(), null);
      assert.equal(authClient.getStoredIdentity(), null);

      // Simulate successful login
      const dummyToken = createSessionToken('AMSS Nagpur');
      authClient.setStoredSession(dummyToken, 'AMSS Nagpur');

      assert.equal(authClient.getStoredToken(), dummyToken);
      assert.equal(authClient.getStoredIdentity(), 'AMSS Nagpur');

      // Logout clears session
      authClient.clearStoredSession();
      assert.equal(authClient.getStoredToken(), null);
      assert.equal(authClient.getStoredIdentity(), null);
    });
  });

  describe('3. Clean Slate Purge & Supabase ClearAll Invariants', () => {
    it('SupabaseObservationStoreService.clearAll deletes from station_observations, raw_bulletins, and historical_observations', async () => {
      const deletedTables: string[] = [];
      const mockClient: any = {
        from: (table: string) => {
          return {
            delete: () => {
              return {
                neq: (col: string, val: string) => {
                  deletedTables.push(table);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };

      const { SupabaseObservationStoreService } = await import('../server/db/supabaseClient.ts');
      const service = new SupabaseObservationStoreService(mockClient);
      await service.clearAll();

      assert.deepEqual(deletedTables, [
        'station_observations',
        'raw_bulletins',
        'historical_observations',
      ]);
    });

    it('SupabaseObservationStoreService.clearAll propagates database errors if delete fails', async () => {
      const mockClient: any = {
        from: (table: string) => {
          return {
            delete: () => {
              return {
                neq: () => {
                  if (table === 'station_observations') {
                    return Promise.resolve({ error: { message: 'permission denied for relation station_observations' } });
                  }
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };

      const { SupabaseObservationStoreService } = await import('../server/db/supabaseClient.ts');
      const service = new SupabaseObservationStoreService(mockClient);

      await assert.rejects(
        async () => {
          await service.clearAll();
        },
        /Failed to clear station_observations: permission denied for relation station_observations/
      );
    });
  });
});

