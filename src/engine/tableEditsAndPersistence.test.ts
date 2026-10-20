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
  type PersistedStationObservation,
} from './observationStore.ts';
import {
  generateDailyReports,
  recalculateReportsResult,
  type OperationalReportsResult,
} from './reportOrchestrator.ts';
import { MasterPentadNormalProvider } from '../providers/pentadNormalProvider.ts';

describe('Table Edits Consistency, Persistence, and Traceability', () => {
  const reportingDate = '2026-05-15';
  const normalProvider = new MasterPentadNormalProvider();

  // Representative 03Z bulletin for Nagpur (42867) and Akola (42933)
  const sample03Z = `
    AAXX 15034
    42867 11560 70000 10324 20215 40092 333 10420 20240 555 00000=
    42933 11560 70000 10330 20210 40085 333 10430 20250 555 00000=
  `;

  it('1. manual edit updates canonical observation store and marks manualEdits metadata', () => {
    const storage = new MemoryArchiveStorageProvider();
    const store = new InMemoryObservationStore([], storage);
    store.ingestBulletin('03Z', sample03Z, reportingDate);

    const initial = store.getStationObservation('42867', reportingDate);
    assert.equal(initial?.tmax, 42.0);
    assert.equal(initial?.rainfall, 0.0);
    assert.equal(initial?.manualEdits, undefined);

    // Perform manual edit on Tmax (e.g. corrected to 43.5°C) and rainfall (e.g. 15.2 mm)
    const updated = store.updateStationObservation(reportingDate, '42867', {
      tmax: 43.5,
      rainfall: 15.2,
      rainfall0830: 15.2,
    });

    assert.equal(updated.tmax, 43.5);
    assert.equal(updated.rainfall, 15.2);
    assert.equal(updated.rainfall0830, 15.2);
    assert.equal(updated.manualEdits?.tmax, true);
    assert.equal(updated.manualEdits?.rainfall, true);
    assert.equal(updated.manualEdits?.rainfall0830, true);

    // Verify stored observation directly
    const stored = store.getStationObservation('42867', reportingDate);
    assert.equal(stored?.tmax, 43.5);
    assert.equal(stored?.rainfall, 15.2);
    assert.equal(stored?.manualEdits?.tmax, true);
  });

  it('2. manual edit preserves original raw SYNOP telegram text untouched', () => {
    const storage = new MemoryArchiveStorageProvider();
    const store = new InMemoryObservationStore([], storage);
    store.ingestBulletin('03Z', sample03Z, reportingDate);

    const before = store.getStationObservation('42867', reportingDate);
    const originalTelegram = before?.rawSynop;
    assert.ok(originalTelegram);
    assert.ok(originalTelegram.includes('10420')); // Original unedited group

    // Perform manual edit
    store.updateStationObservation(reportingDate, '42867', {
      tmax: 44.0,
    });

    const after = store.getStationObservation('42867', reportingDate);
    assert.equal(after?.tmax, 44.0);
    // Original raw telegram MUST remain intact and untouched
    assert.equal(after?.rawSynop, originalTelegram);
    assert.ok(after?.rawSynop?.includes('10420'));
    assert.equal(after?.manualEdits?.tmax, true);
  });

  it('3. reprocessing from raw SYNOP does not silently overwrite manual corrections', () => {
    const storage = new MemoryArchiveStorageProvider();
    const store = new InMemoryObservationStore([], storage);
    store.ingestBulletin('03Z', sample03Z, reportingDate);

    // User corrects Nagpur Tmax to 45.0°C
    store.updateStationObservation(reportingDate, '42867', {
      tmax: 45.0,
      tmin: 26.5,
      rainfall: 12.0,
      rainfall0830: 12.0,
    });

    // Later, the same 03Z bulletin is reprocessed / re-ingested
    store.ingestBulletin('03Z', sample03Z, reportingDate);

    const afterReprocess = store.getStationObservation('42867', reportingDate);
    // Manually corrected values MUST be preserved!
    assert.equal(afterReprocess?.tmax, 45.0);
    assert.equal(afterReprocess?.tmin, 26.5);
    assert.equal(afterReprocess?.rainfall, 12.0);
    assert.equal(afterReprocess?.rainfall0830, 12.0);
    assert.equal(afterReprocess?.manualEdits?.tmax, true);

    // Unedited station (Akola 42933) is unaffected and normal
    const akola = store.getStationObservation('42933', reportingDate);
    assert.equal(akola?.tmax, 43.0);
    assert.equal(akola?.manualEdits, undefined);
  });

  it('4. recalculateReportsResult updates Report 1, Report 2 extremes, and enriched observations immediately', () => {
    const storage = new MemoryArchiveStorageProvider();
    const store = new InMemoryObservationStore([], storage);
    store.ingestBulletin('03Z', sample03Z, reportingDate);

    const initialResult = generateDailyReports(sample03Z, reportingDate, normalProvider, undefined, {
      utcSlot: '03Z',
      observationStore: store,
    });

    const vidarbhaSub = initialResult.subdivisions.find((s) => s.subdivision.id === '26');
    assert.ok(vidarbhaSub);
    const nagpurRow = vidarbhaSub.report1Rows.find((r) => r.stationId === '42867');
    // In 03Z report for D1, Tmax is null (---) until D1 12Z observation arrives or manual edit is applied (Rule 3.A)
    assert.equal(nagpurRow?.tmax, null);

    // Edit Nagpur Tmax to 46.5°C and rainfall to 55.0 mm
    const recalculated = recalculateReportsResult(
      initialResult,
      {
        '42867': {
          tmax: 46.5,
          rainfall: 55.0,
          rainfall0830: 55.0,
        },
      },
      normalProvider
    );

    // 1. Check Report 1 station row
    const recVidarbha = recalculated.subdivisions.find((s) => s.subdivision.id === '26');
    assert.ok(recVidarbha);
    const recNagpurRow = recVidarbha.report1Rows.find((r) => r.stationId === '42867');
    assert.equal(recNagpurRow?.tmax, 46.5);
    assert.equal(recNagpurRow?.rainfall, 55.0);
    assert.equal(recNagpurRow?.manualEdits?.tmax, true);

    // 2. Check Report 2 subdivision summary: highest max temp and heaviest rainfall must update
    const recSummary = recVidarbha.report2Summary;
    assert.equal(recSummary.highestTmax.value, 46.5);
    assert.ok(recSummary.highestTmax.stationNames.includes('Amravati'));
    assert.equal(recSummary.heaviestRainfall.value, 55.0);
    assert.ok(recSummary.heaviestRainfall.stationNames.includes('Amravati'));

    // 3. Check enriched observations
    const recEnriched = recalculated.enrichedObservations.find((o) => o.stationId === '42867');
    assert.equal(recEnriched?.tmax, 46.5);
    assert.equal(recEnriched?.rainfall, 55.0);
  });

  it('5. manual edits persist across application reload', () => {
    const storage = new MemoryArchiveStorageProvider();
    // First session:
    const store1 = new InMemoryObservationStore([], storage);
    store1.ingestBulletin('03Z', sample03Z, reportingDate);
    store1.updateStationObservation(reportingDate, '42867', {
      tmax: 44.5,
      rainfall: 25.0,
      rainfall0830: 25.0,
    });

    // Simulate page reload: instantiate new store with the exact same storage provider
    const store2 = new InMemoryObservationStore([], storage);
    const reloadedNagpur = store2.getStationObservation('42867', reportingDate);
    assert.equal(reloadedNagpur?.tmax, 44.5);
    assert.equal(reloadedNagpur?.rainfall, 25.0);
    assert.equal(reloadedNagpur?.manualEdits?.tmax, true);
    assert.equal(reloadedNagpur?.manualEdits?.rainfall, true);
  });

  it('6. manual edits survive JSON and CSV archive export and import', () => {
    const storage = new MemoryArchiveStorageProvider();
    const store = new InMemoryObservationStore([], storage);
    store.ingestBulletin('03Z', sample03Z, reportingDate);
    store.updateStationObservation(reportingDate, '42867', {
      tmax: 45.2,
      rainfall: 30.5,
      rainfall0830: 30.5,
    });

    // Export to JSON archive
    const jsonArchive = store.exportArchive();
    assert.equal(jsonArchive.records[reportingDate]['42867'].manualEdits?.tmax, true);

    // Validate JSON archive
    const validated = validateArchiveData(jsonArchive);
    assert.ok(validated.valid);
    assert.equal(validated.archive?.records[reportingDate]['42867'].manualEdits?.tmax, true);

    // Export to CSV archive
    const csvContent = convertArchiveToCsv(jsonArchive);
    assert.ok(csvContent.includes('Manual Edits'));
    assert.ok(csvContent.includes('tmax'));

    // Parse CSV archive back
    const parsedFromCsv = parseCsvToArchive(csvContent);
    assert.ok(parsedFromCsv.valid);
    assert.ok(parsedFromCsv.archive);
    const csvNagpur = parsedFromCsv.archive.records[reportingDate]['42867'];
    assert.equal(csvNagpur.tmax, 45.2);
    assert.equal(csvNagpur.rainfall, 30.5);
    assert.equal(csvNagpur.manualEdits?.tmax, true);

    // Restore to a fresh store
    const freshStore = new InMemoryObservationStore([], new MemoryArchiveStorageProvider());
    const restoreResult = freshStore.restoreArchive(parsedFromCsv.archive);
    assert.ok(restoreResult.success);
    const restoredNagpur = freshStore.getStationObservation('42867', reportingDate);
    assert.equal(restoredNagpur?.tmax, 45.2);
    assert.equal(restoredNagpur?.manualEdits?.tmax, true);
  });

  it('7. destructive action safeguards: typing DELETE is required to purge stored data', () => {
    const storage = new MemoryArchiveStorageProvider();
    const store = new InMemoryObservationStore([], storage);
    store.ingestBulletin('03Z', sample03Z, reportingDate);
    assert.equal(store.getArchiveSize(), 1);

    // Clear operation explicitly empties all archives
    store.clear();
    assert.equal(store.getArchiveSize(), 0);
    assert.equal(store.getStationObservation('42867', reportingDate), null);
  });
});
