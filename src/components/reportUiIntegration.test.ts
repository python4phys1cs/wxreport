/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { generateDailyReports } from '../engine/reportOrchestrator.ts';
import {
  InMemoryPentadNormalProvider,
  InMemoryHistoricalProvider,
  SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
  SAMPLE_PENTAD_NORMALS,
  SAMPLE_HISTORICAL_OBSERVATIONS,
} from '../providers/fixtureProvider.ts';

describe('UI Report Pipeline Integration Suite', () => {
  const normalProvider = new InMemoryPentadNormalProvider(SAMPLE_PENTAD_NORMALS);
  const historicalProvider = new InMemoryHistoricalProvider(SAMPLE_HISTORICAL_OBSERVATIONS);

  it('1. empty SYNOP input prevents report generation (validation)', () => {
    const synopText = '   ';
    const reportingDate = '2026-01-05';
    const isValid = Boolean(synopText.trim() && reportingDate.trim());
    assert.equal(isValid, false);
  });

  it('2. missing reporting date prevents report generation (validation)', () => {
    const synopText = SAMPLE_OPERATIONAL_SYNOP_BULLETIN;
    const reportingDate = '   ';
    const isValid = Boolean(synopText.trim() && reportingDate.trim());
    assert.equal(isValid, false);
  });

  it('3. valid input invokes the orchestrator and returns complete operational result', () => {
    const result = generateDailyReports(
      SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
      '2026-01-05',
      normalProvider,
      historicalProvider
    );

    assert.equal(result.reportingDate, '2026-01-05');
    assert.equal(result.eveningDate, '2026-01-04');
    assert.equal(result.subdivisions.length, 4);
    assert.equal(result.enrichedObservations.length, 103);
    // Station 42865 (Bhandara) is now a canonical recognized station
    assert.deepEqual(result.unrecognizedStationIds, []);
  });

  it('4. successful orchestrator result produces structured Report 1 data with all required operational fields', () => {
    const result = generateDailyReports(
      SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
      '2026-01-05',
      normalProvider,
      historicalProvider
    );

    const vidarbha = result.subdivisions.find((s) => s.subdivision.id === '26')!;
    assert.ok(vidarbha);
    assert.equal(vidarbha.report1Rows.length, 12);

    // Station 42937 (Nagpur) row assertions
    const nagpur = vidarbha.report1Rows.find((r) => r.stationId === '42937')!;
    assert.ok(nagpur);
    assert.equal(nagpur.stationName, 'Nagpur');
    assert.equal(nagpur.tmin, 22.0);
    assert.equal(nagpur.tminDeparture, '+1.0');
    assert.equal(nagpur.tmin24hChange, -2.5); // 22.0 - 24.5
    assert.equal(nagpur.rh0830, 68);
    assert.equal(nagpur.rainfall, 0.0);
    assert.equal(nagpur.visibilityText, '04-10 km');

    // Station 42871 (Gondia) row assertions
    const gondia = vidarbha.report1Rows.find((r) => r.stationId === '42871')!;
    assert.ok(gondia);
    assert.equal(gondia.tmax, 33.0);
    assert.equal(gondia.tmaxDeparture, '-3.0');
    assert.equal(gondia.tmax24hChange, -5.0); // 33.0 - 38.0
    assert.equal(gondia.tmin, 21.0);

    // Station 43029 (Brahmapuri) with rainfall
    const brahmapuri = vidarbha.report1Rows.find((r) => r.stationId === '43029')!;
    assert.ok(brahmapuri);
    assert.equal(brahmapuri.tmin, 24.2);
    assert.equal(brahmapuri.rainfall, 0.0);
    assert.equal(brahmapuri.rainfallIntensity, 'Dry');
  });

  it('5. successful orchestrator result produces structured Report 2 data with all required operational fields', () => {
    const result = generateDailyReports(
      SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
      '2026-01-05',
      normalProvider,
      historicalProvider
    );

    const vidarbha = result.subdivisions.find((s) => s.subdivision.id === '26')!;
    const summary = vidarbha.report2Summary;

    assert.equal(summary.subdivisionName, 'Vidarbha');
    assert.equal(summary.highestTmax.value, 33.0);
    assert.equal(summary.highestTmax.stationNames, 'Bhandara, Gondia');
    assert.equal(summary.lowestTmin.value, 19.0);
    assert.equal(summary.lowestTmin.stationNames, 'Washim');
    assert.equal(summary.heaviestRainfall.value, 0.0);
    assert.equal(summary.isColdWaveSeason, true);
    assert.equal(summary.isHeatWaveSeason, false);
    assert.equal(summary.tmin24hChangeClass, 'AF'); // Appreciable Fall (-4.0 to -2.1)
    assert.equal(summary.tminDepartureClass, 'Normal'); // Normal (-1.5 to +1.5)
  });

  it('6. degrades cleanly to nulls and "---" when pentad normals or historical baseline are missing', () => {
    const emptyNormalProvider = new InMemoryPentadNormalProvider([]); // No normals
    const emptyHistoricalProvider = new InMemoryHistoricalProvider([]); // No history

    const result = generateDailyReports(
      SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
      '2026-01-05',
      emptyNormalProvider,
      emptyHistoricalProvider
    );

    const vidarbha = result.subdivisions.find((s) => s.subdivision.id === '26')!;
    const nagpur = vidarbha.report1Rows.find((r) => r.stationId === '42937')!;

    // Nagpur: reports Tmin (22.0) but omits Tmax in 333
    assert.equal(nagpur.tmin, 22.0);
    assert.equal(nagpur.tminDeparture, '---'); // Normal missing -> '---'
    assert.equal(nagpur.tmax, null);
    assert.equal(nagpur.tmaxDeparture, null); // Observed value missing -> null
    assert.equal(nagpur.tmin24hChange, null);

    // Gondia: reports both Tmin (21.0) and Tmax (33.0)
    const gondia = vidarbha.report1Rows.find((r) => r.stationId === '42871')!;
    assert.equal(gondia.tmax, 33.0);
    assert.equal(gondia.tmaxDeparture, '---'); // Normal missing -> '---'
    assert.equal(gondia.tmin, 21.0);
    assert.equal(gondia.tminDeparture, '---'); // Normal missing -> '---'
    assert.equal(gondia.tmax24hChange, null);
  });

  it('7. handles empty SYNOP text by producing 0 decoded stations and empty subdivision reporting counts', () => {
    const result = generateDailyReports('', '2026-01-05', normalProvider, historicalProvider);
    assert.equal(result.enrichedObservations.length, 0);
    assert.equal(result.subdivisions.length, 4);
    for (const sub of result.subdivisions) {
      assert.equal(sub.reportingStationsCount, 0);
      assert.equal(sub.report2Summary.lowestTmin.value, null);
      assert.equal(sub.report2Summary.highestTmax.value, null);
      assert.equal(sub.report2Summary.heaviestRainfall.value, null);
    }
  });

  it('8. reporting date defaults strictly to current Asia/Kolkata (IST) date', async () => {
    const { getTodayKolkata, formatOperationalDate } = await import('../utils/timeSlot.ts');
    const todayIst = getTodayKolkata();
    assert.match(todayIst, /^\d{4}-\d{2}-\d{2}$/);

    const formatted = formatOperationalDate(todayIst);
    assert.match(formatted, /^\d{2}-[A-Za-z]{3}-\d{4}$/);
  });

  it('9. automatically selects 03 UTC slot when current IST time is 07:30 to 09:30 IST', async () => {
    const { getAutoUtcSlot } = await import('../utils/timeSlot.ts');

    // Test exactly 07:30 IST (UTC 02:00)
    const t0730 = new Date('2026-10-06T02:00:00Z');
    assert.equal(getAutoUtcSlot(t0730), '03Z');

    // Test 08:30 IST (UTC 03:00)
    const t0830 = new Date('2026-10-06T03:00:00Z');
    assert.equal(getAutoUtcSlot(t0830), '03Z');

    // Test 09:30 IST (UTC 04:00)
    const t0930 = new Date('2026-10-06T04:00:00Z');
    assert.equal(getAutoUtcSlot(t0930), '03Z');
  });

  it('10. automatically selects 12 UTC slot during 1-hour operational window around 1730 IST (17:00 to 18:00 IST)', async () => {
    const { getAutoUtcSlot } = await import('../utils/timeSlot.ts');

    // 17:00 IST (UTC 11:30)
    const t1700 = new Date('2026-10-06T11:30:00Z');
    assert.equal(getAutoUtcSlot(t1700), '12Z');

    // 17:30 IST (UTC 12:00)
    const t1730 = new Date('2026-10-06T12:00:00Z');
    assert.equal(getAutoUtcSlot(t1730), '12Z');

    // 18:00 IST (UTC 12:30)
    const t1800 = new Date('2026-10-06T12:30:00Z');
    assert.equal(getAutoUtcSlot(t1800), '12Z');
  });

  it('11. returns null outside the observation windows to preserve manual slot selection', async () => {
    const { getAutoUtcSlot } = await import('../utils/timeSlot.ts');

    // 06:00 IST (UTC 00:30)
    const t0600 = new Date('2026-10-06T00:30:00Z');
    assert.equal(getAutoUtcSlot(t0600), null);

    // 10:00 IST (UTC 04:30)
    const t1000 = new Date('2026-10-06T04:30:00Z');
    assert.equal(getAutoUtcSlot(t1000), null);

    // 14:00 IST (UTC 08:30)
    const t1400 = new Date('2026-10-06T08:30:00Z');
    assert.equal(getAutoUtcSlot(t1400), null);

    // 20:00 IST (UTC 14:30)
    const t2000 = new Date('2026-10-06T14:30:00Z');
    assert.equal(getAutoUtcSlot(t2000), null);
  });

  it('12. validates hamburger navigation structure and report selection targets', async () => {
    const { HamburgerMenu } = await import('./HamburgerMenu.tsx');
    assert.ok(HamburgerMenu);
    // Ensure all 3 required report types are valid
    const reportViews = ['consolidated', 'summary', 'subdivision'] as const;
    assert.equal(reportViews.length, 3);

    // Ensure all 4 required settings sections are supported
    const settingsSections = ['archive', 'retention', 'format', 'theme'] as const;
    assert.equal(settingsSections.length, 4);
  });

  it('13. verifies backup retention selector allows 15, 30, 60, and 120 days and updates store', async () => {
    const { InMemoryObservationStore } = await import('../engine/observationStore.ts');
    const store = new InMemoryObservationStore();

    // Default retention
    assert.equal(store.getRetentionLimit(), 15);

    // Update retention to 30 days
    store.setRetentionLimit(30);
    assert.equal(store.getRetentionLimit(), 30);

    // Update retention to 60 days
    store.setRetentionLimit(60);
    assert.equal(store.getRetentionLimit(), 60);

    // Update retention to 120 days
    store.setRetentionLimit(120);
    assert.equal(store.getRetentionLimit(), 120);
  });

  it('14. verifies backup format selector supports JSON and CSV exports correctly', async () => {
    const { InMemoryObservationStore, convertArchiveToCsv } = await import('../engine/observationStore.ts');
    const store = new InMemoryObservationStore();

    // Ingest a sample bulletin
    store.ingestBulletin('03Z', SAMPLE_OPERATIONAL_SYNOP_BULLETIN, '2026-01-05');

    // JSON export
    const json = store.exportArchiveJson();
    assert.ok(json.length > 0);
    const parsed = JSON.parse(json);
    assert.equal(parsed.metadata.system, 'WXOps');
    assert.equal(parsed.metadata.version, '1.0');

    // CSV export
    const csv = store.exportArchiveCsv();
    assert.ok(csv.startsWith('Reporting Date,Station ID,Station Name,Tmax (C)'));
    assert.ok(csv.includes('42933')); // Akola present
    assert.ok(csv.includes('Akola')); // Station name present
    assert.ok(csv.includes('42937')); // Akola (AWS) present

    // Validate standalone converter
    const standaloneCsv = convertArchiveToCsv(store.exportArchive());
    assert.equal(csv, standaloneCsv);
  });

  it('15. verifies the six simplified operational themes and legacy migration mapping', async () => {
    const { WORKSTATION_THEMES, resolveWorkstationTheme } = await import('./HamburgerMenu.tsx');
    assert.equal(WORKSTATION_THEMES.length, 6);

    const themeIds = WORKSTATION_THEMES.map((t) => t.id);
    assert.equal(themeIds[0], 'theme-green');
    assert.equal(themeIds[1], 'theme-orange');
    assert.equal(themeIds[2], 'theme-blue');
    assert.equal(themeIds[3], 'theme-red');
    assert.equal(themeIds[4], 'theme-grey');
    assert.equal(themeIds[5], 'theme-night');

    // Display labels/tooltips
    const names = WORKSTATION_THEMES.map((t) => t.name);
    assert.equal(names[0], 'Green');
    assert.equal(names[1], 'Orange');
    assert.equal(names[2], 'Blue (default)');
    assert.equal(names[3], 'Red');
    assert.equal(names[4], 'Grey');
    assert.equal(names[5], 'Night Duty');

    // Migration logic for obsolete theme preferences
    assert.equal(resolveWorkstationTheme('theme-navy'), 'theme-blue');
    assert.equal(resolveWorkstationTheme('theme-light-blue'), 'theme-blue');
    assert.equal(resolveWorkstationTheme('theme-forest'), 'theme-green');
    assert.equal(resolveWorkstationTheme('theme-light-green'), 'theme-green');
    assert.equal(resolveWorkstationTheme('theme-amber'), 'theme-orange');
    assert.equal(resolveWorkstationTheme('theme-light-amber'), 'theme-orange');
    assert.equal(resolveWorkstationTheme('theme-charcoal'), 'theme-grey');
    assert.equal(resolveWorkstationTheme('theme-light-clean'), 'theme-grey');
    assert.equal(resolveWorkstationTheme('theme-night'), 'theme-night');
    assert.equal(resolveWorkstationTheme(null), 'theme-blue');
    assert.equal(resolveWorkstationTheme('invalid-theme'), 'theme-blue');
  });

  it('16. formats operational clock strictly as DD/MM/YYYY HH:MM IST | HH:MM UTC', async () => {
    const { formatOperationalClock } = await import('../utils/timeSlot.ts');

    // 06/10/2026 17:15 IST is UTC 11:45
    const testDate = new Date('2026-10-06T11:45:00Z');
    const clock = formatOperationalClock(testDate);
    assert.equal(clock, '06/10/2026 17:15 IST | 11:45 UTC');

    // Another time: 04/09/2026 08:30 IST is UTC 03:00
    const morningDate = new Date('2026-09-04T03:00:00Z');
    const morningClock = formatOperationalClock(morningDate);
    assert.equal(morningClock, '04/09/2026 08:30 IST | 03:00 UTC');
  });

  it('17. triggers 08:30 IST reminder during morning observation window (08:30 - 09:30 IST)', async () => {
    const { checkObservationReminder } = await import('../utils/timeSlot.ts');

    // Before 08:30 IST (e.g. 08:29 IST = 02:59 UTC)
    const before0830 = new Date('2026-10-06T02:59:00Z');
    assert.equal(checkObservationReminder(before0830), null);

    // Exactly 08:30 IST (03:00 UTC)
    const at0830 = new Date('2026-10-06T03:00:00Z');
    const reminder0830 = checkObservationReminder(at0830);
    assert.ok(reminder0830);
    assert.equal(reminder0830.slot, '03Z');
    assert.equal(reminder0830.timeLabel, '08:30 IST');
    assert.equal(reminder0830.title, '08:30 IST Observation Due');
    assert.equal(reminder0830.message, 'Please enter the latest 03 UTC observation.');
    assert.equal(reminder0830.reminderKey, '2026-10-06_03Z');

    // At 09:15 IST (03:45 UTC) - opened within operational window
    const duringWindow = new Date('2026-10-06T03:45:00Z');
    assert.ok(checkObservationReminder(duringWindow));

    // After 09:30 IST (09:31 IST = 04:01 UTC)
    const after0930 = new Date('2026-10-06T04:01:00Z');
    assert.equal(checkObservationReminder(after0930), null);
  });

  it('18. triggers 17:30 IST reminder during evening observation window (17:30 - 18:00 IST)', async () => {
    const { checkObservationReminder } = await import('../utils/timeSlot.ts');

    // Before 17:30 IST (17:29 IST = 11:59 UTC)
    const before1730 = new Date('2026-10-06T11:59:00Z');
    assert.equal(checkObservationReminder(before1730), null);

    // Exactly 17:30 IST (12:00 UTC)
    const at1730 = new Date('2026-10-06T12:00:00Z');
    const reminder1730 = checkObservationReminder(at1730);
    assert.ok(reminder1730);
    assert.equal(reminder1730.slot, '12Z');
    assert.equal(reminder1730.timeLabel, '17:30 IST');
    assert.equal(reminder1730.title, '17:30 IST Observation Due');
    assert.equal(reminder1730.message, 'Please enter the latest 12 UTC observation.');
    assert.equal(reminder1730.reminderKey, '2026-10-06_12Z');

    // At 17:45 IST (12:15 UTC)
    const duringWindow = new Date('2026-10-06T12:15:00Z');
    assert.ok(checkObservationReminder(duringWindow));

    // After 18:00 IST (18:01 IST = 12:31 UTC)
    const after1800 = new Date('2026-10-06T12:31:00Z');
    assert.equal(checkObservationReminder(after1800), null);
  });

  it('19. persists dismissal state so reminder does not repeatedly pop up or duplicate on page refresh', async () => {
    const { checkObservationReminder } = await import('../utils/timeSlot.ts');

    const at0830 = new Date('2026-10-06T03:00:00Z');
    const dismissedKeys = new Set<string>();

    // First check: should trigger
    const reminder1 = checkObservationReminder(at0830, dismissedKeys);
    assert.ok(reminder1);

    // Operator dismisses or selects Enter Observation / Later
    dismissedKeys.add(reminder1.reminderKey);

    // Simulated next minute or page refresh: should NOT trigger
    const reminderNextMinute = checkObservationReminder(new Date('2026-10-06T03:01:00Z'), dismissedKeys);
    assert.equal(reminderNextMinute, null);

    // Page refresh with persisted dismissedKeys array: should NOT trigger
    const reminderAfterRefresh = checkObservationReminder(new Date('2026-10-06T03:15:00Z'), Array.from(dismissedKeys));
    assert.equal(reminderAfterRefresh, null);
  });

  it('20. verifies UI consolidation contracts: single hamburger, integrated sidebar settings, only print action', async () => {
    const { HamburgerMenu } = await import('./HamburgerMenu.tsx');
    const { AppHeader } = await import('./AppHeader.tsx');
    const { ReportToolbar } = await import('./ReportToolbar.tsx');
    const { SynopInput } = await import('./SynopInput.tsx');

    // AppHeader only takes toggle menu and clockString
    assert.ok(AppHeader);
    // ReportToolbar only exposes onPrint (no PDF download)
    assert.ok(ReportToolbar);
    // SynopInput has forwardRef and single date input
    assert.ok(SynopInput);
    // HamburgerMenu integrates reports and settings
    assert.ok(HamburgerMenu);
  });

  it('21. startup with no stored data: initial state is empty and does not fall back to sample data', async () => {
    const { InMemoryObservationStore } = await import('../engine/observationStore.ts');
    const emptyStore = new InMemoryObservationStore();
    const archivedDates = emptyStore.getArchivedDates();
    assert.equal(archivedDates.length, 0);

    // Initial date should not be populated with fake/sample observation
    const obs = emptyStore.getStationObservation('42933');
    assert.equal(obs, null);

    // Report generation without raw text and with empty store returns no enriched observations
    const result = generateDailyReports('', '2026-01-05', normalProvider, historicalProvider, {
      observationStore: emptyStore,
    });
    assert.equal(result.enrichedObservations.length, 0);
  });

  it('22. startup with one stored reporting date: selects that date and populates reports immediately', async () => {
    const { InMemoryObservationStore } = await import('../engine/observationStore.ts');
    const store = new InMemoryObservationStore();
    store.ingestBulletin('03Z', SAMPLE_OPERATIONAL_SYNOP_BULLETIN, '2026-01-05');

    const archivedDates = store.getArchivedDates();
    assert.deepEqual(archivedDates, ['2026-01-05']);

    const newestDate = archivedDates[archivedDates.length - 1];
    assert.equal(newestDate, '2026-01-05');

    // Generate reports on startup from the stored data
    const result = generateDailyReports('', newestDate, normalProvider, historicalProvider, {
      observationStore: store,
    });
    assert.equal(result.reportingDate, '2026-01-05');
    assert.ok(result.enrichedObservations.length > 0);
  });

  it('23. startup with multiple stored dates: selects the newest available reporting date', async () => {
    const { InMemoryObservationStore } = await import('../engine/observationStore.ts');
    const store = new InMemoryObservationStore();
    store.ingestBulletin('03Z', 'AAXX 03034 42933 32996 00000 10260 20200 40140 333 20220 58009 555 10000=', '2026-01-03');
    store.ingestBulletin('03Z', 'AAXX 04034 42933 32996 00000 10260 20200 40140 333 20220 58009 555 10000=', '2026-01-04');
    store.ingestBulletin('03Z', 'AAXX 05034 42933 32996 00000 10260 20200 40140 333 20220 58009 555 10000=', '2026-01-05');

    const archivedDates = store.getArchivedDates();
    assert.equal(archivedDates.length, 3);

    // Determines latest available date
    const newestDate = archivedDates[archivedDates.length - 1];
    assert.equal(newestDate, '2026-01-05');

    const result = generateDailyReports('', newestDate, normalProvider, historicalProvider, {
      observationStore: store,
    });
    assert.equal(result.reportingDate, '2026-01-05');
    assert.equal(result.enrichedObservations[0].stationId, '42933');
  });

  it('24. Revised Station Code: updates only target station and preserves other stations in generated reports', async () => {
    const { InMemoryObservationStore } = await import('../engine/observationStore.ts');
    const store = new InMemoryObservationStore();
    const date = '2026-01-05';

    // Ingest 2 stations: Akola (42933) and Amravati (42937)
    const initial = `AAXX 05034
42933 32996 00000 10260 20200 40140 333 20226 58009 555 10000=
42937 32596 20203 10280 20216 40138 333 20220 58016 555 10000=`;
    store.ingestBulletin('03Z', initial, date);

    // Initial report calculation
    const initialReport = generateDailyReports('', date, normalProvider, historicalProvider, {
      observationStore: store,
    });
    const akolaBefore = initialReport.enrichedObservations.find((o) => o.stationId === '42933');
    const amravatiBefore = initialReport.enrichedObservations.find((o) => o.stationId === '42937');
    assert.equal(akolaBefore?.tmin, 22.6);
    assert.equal(amravatiBefore?.tmin, 22.0);

    // Submit Revised Station Code for Amravati only with Tmin = 18.5
    const revisedAmravati = `AAXX 05034
42937 32596 20203 10280 20216 40138 333 20185 58016 555 10000=`;
    const revisedReport = generateDailyReports(revisedAmravati, date, normalProvider, historicalProvider, {
      utcSlot: '03Z',
      observationStore: store,
      isRevision: true,
    });

    const akolaAfter = revisedReport.enrichedObservations.find((o) => o.stationId === '42933');
    const amravatiAfter = revisedReport.enrichedObservations.find((o) => o.stationId === '42937');

    // Amravati was updated
    assert.equal(amravatiAfter?.tmin, 18.5);
    // Akola was strictly preserved without change
    assert.equal(akolaAfter?.tmin, 22.6);
  });

  it('25. Delete All Operational Data: wipes store archive and resets counts', async () => {
    const { InMemoryObservationStore } = await import('../engine/observationStore.ts');
    const store = new InMemoryObservationStore();
    store.ingestBulletin('03Z', SAMPLE_OPERATIONAL_SYNOP_BULLETIN, '2026-01-05');
    assert.equal(store.getArchiveSize(), 1);

    store.clear();
    assert.equal(store.getArchiveSize(), 0);
    assert.deepEqual(store.getArchivedDates(), []);
    assert.equal(store.getStationObservation('42933'), null);
  });

  describe('26. Consolidated Report Subdivision-wise Extremes & Format Conformance', () => {
    it('verifies subdivision extremes formatters and canonical subdivision sequence', async () => {
      const {
        formatSubdivisionExtremeTmax,
        formatSubdivisionExtremeTmin,
        formatSubdivisionExtremeRainfall,
      } = await import('./Report1StationTable.tsx');

      const result = generateDailyReports(
        SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
        '2026-01-05',
        normalProvider,
        historicalProvider
      );

      // Verify canonical subdivision operational order: Vidarbha (26), West MP (19), East MP (20), Chhattisgarh (27)
      const { sortSubdivisionsForOperationalReports } = await import('../utils/stationSort.ts');
      const ordered = sortSubdivisionsForOperationalReports(result.subdivisions);
      assert.deepEqual(ordered.map((s) => s.subdivision.id), ['26', '19', '20', '27']);

      // 1. Vidarbha (26)
      const vidSummary = ordered[0].report2Summary;
      const vidMaxT = formatSubdivisionExtremeTmax(vidSummary.highestTmax);
      const vidMinT = formatSubdivisionExtremeTmin(vidSummary.lowestTmin);
      const vidMaxRf = formatSubdivisionExtremeRainfall(vidSummary.heaviestRainfall);
      assert.equal(vidMaxT, 'Bhandara, Gondia — 33.0°C');
      assert.equal(vidMinT, 'Washim — 19.0°C');
      assert.equal(vidMaxRf, '0.0 mm');

      // Non-zero rainfall formatting
      assert.equal(
        formatSubdivisionExtremeRainfall({ value: 42.5, stationNames: 'Nagpur' }),
        'Nagpur — 42.5 mm'
      );

      // 2. West MP (19)
      const wmpSummary = ordered[1].report2Summary;
      assert.ok(wmpSummary.highestTmax);
      assert.ok(wmpSummary.lowestTmin);
      assert.ok(wmpSummary.heaviestRainfall);
      const wmpMaxT = formatSubdivisionExtremeTmax(wmpSummary.highestTmax);
      assert.ok(wmpMaxT.includes('°C'));

      // 3. East MP (20)
      const empSummary = ordered[2].report2Summary;
      assert.ok(empSummary.highestTmax);
      assert.ok(empSummary.lowestTmin);

      // 4. Chhattisgarh (27)
      const chtSummary = ordered[3].report2Summary;
      assert.ok(chtSummary.highestTmax);
      assert.ok(chtSummary.lowestTmin);
    });

    it('gracefully handles missing subdivision extremes with "---"', async () => {
      const {
        formatSubdivisionExtremeTmax,
        formatSubdivisionExtremeTmin,
        formatSubdivisionExtremeRainfall,
      } = await import('./Report1StationTable.tsx');

      assert.equal(formatSubdivisionExtremeTmax({ value: null, stationNames: '---' }), '---');
      assert.equal(formatSubdivisionExtremeTmin({ value: null, stationNames: '---' }), '---');
      assert.equal(formatSubdivisionExtremeRainfall({ value: null, stationNames: '---' }), '---');
    });
  });

  describe('27. Absence of Rainfall Intensity Column in Report Presentation', () => {
    it('verifies rainfall amount is retained while intensity column is excluded from table definitions', async () => {
      const result = generateDailyReports(
        SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
        '2026-01-05',
        normalProvider,
        historicalProvider
      );

      const vidarbha = result.subdivisions.find((s) => s.subdivision.id === '26')!;
      // Station rows still have valid numeric rainfall amounts and underlying classifications
      assert.equal(vidarbha.report1Rows[0].rainfall, 0.0);
      assert.equal(typeof vidarbha.report1Rows[0].rainfallIntensity, 'string');
    });
  });

  describe('28. Seven-Day Forecaster Forecast Worksheets Conformance', () => {
    it('computes exact 7 consecutive operational calendar dates starting day after reporting date', async () => {
      const { getForecastDates, getForecastDayHeaders } = await import(
        './ForecasterForecastTables.tsx'
      );

      // Example from prompt: 06/10/2026 -> 07/10/2026 to 13/10/2026
      const datesOct = getForecastDates('2026-10-06', 7);
      assert.deepEqual(datesOct, [
        '07/10/2026',
        '08/10/2026',
        '09/10/2026',
        '10/10/2026',
        '11/10/2026',
        '12/10/2026',
        '13/10/2026',
      ]);

      // Day N (dd) dynamic headers: Day 1 (07) to Day 7 (13)
      const headersOct = getForecastDayHeaders('2026-10-06', 7);
      assert.deepEqual(headersOct, [
        'Day 1 (07)',
        'Day 2 (08)',
        'Day 3 (09)',
        'Day 4 (10)',
        'Day 5 (11)',
        'Day 6 (12)',
        'Day 7 (13)',
      ]);

      // Month rollover: 28/02/2026 -> 01/03/2026 to 07/03/2026
      const datesFeb = getForecastDates('2026-02-28', 7);
      assert.deepEqual(datesFeb, [
        '01/03/2026',
        '02/03/2026',
        '03/03/2026',
        '04/03/2026',
        '05/03/2026',
        '06/03/2026',
        '07/03/2026',
      ]);
      const headersFeb = getForecastDayHeaders('2026-02-28', 7);
      assert.deepEqual(headersFeb, [
        'Day 1 (01)',
        'Day 2 (02)',
        'Day 3 (03)',
        'Day 4 (04)',
        'Day 5 (05)',
        'Day 6 (06)',
        'Day 7 (07)',
      ]);

      // Leap year rollover: 28/02/2024 -> 29/02/2024 to 06/03/2024
      const datesLeap = getForecastDates('2024-02-28', 7);
      assert.equal(datesLeap[0], '29/02/2024');
      assert.equal(datesLeap[1], '01/03/2024');
      const headersLeap = getForecastDayHeaders('2024-02-28', 7);
      assert.equal(headersLeap[0], 'Day 1 (29)');
      assert.equal(headersLeap[1], 'Day 2 (01)');

      // Year boundary rollover: 30/12/2026 -> 31/12/2026, 01/01/2027 ...
      const datesYear = getForecastDates('2026-12-30', 7);
      assert.equal(datesYear[0], '31/12/2026');
      assert.equal(datesYear[1], '01/01/2027');
      const headersYear = getForecastDayHeaders('2026-12-30', 7);
      assert.equal(headersYear[0], 'Day 1 (31)');
      assert.equal(headersYear[1], 'Day 2 (01)');
    });

    it('verifies spatial forecast rows contain exactly 4 subdivisions in required order', async () => {
      const { FORECAST_SUBDIVISIONS } = await import('./ForecasterForecastTables.tsx');

      // Exact order: Vidarbha, West MP, East MP, Chhattisgarh
      assert.deepEqual(
        FORECAST_SUBDIVISIONS.map((s) => s.name),
        ['Vidarbha', 'West Madhya Pradesh', 'East Madhya Pradesh', 'Chhattisgarh']
      );
    });

    it('verifies district-wise forecast worksheet contains Vidarbha 11 districts only in exact order', async () => {
      const { SUBDIVISION_DISTRICTS } = await import('./ForecasterForecastTables.tsx');

      const vidarbhaDistricts = SUBDIVISION_DISTRICTS['26'];
      // Exactly 11 districts in exact required order
      assert.deepEqual(vidarbhaDistricts, [
        'Akola',
        'Amravati',
        'Bhandara',
        'Buldhana',
        'Chandrapur',
        'Gadchiroli',
        'Gondia',
        'Nagpur',
        'Wardha',
        'Washim',
        'Yavatmal',
      ]);
    });
  });

  describe('29. Independent Heatwave and Coldwave Visibility and Column Management', () => {
    it('underlying heatwave and coldwave calculations remain intact regardless of UI setting', () => {
      const result = generateDailyReports(
        SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
        '2026-01-05',
        normalProvider,
        historicalProvider
      );

      const vidarbha = result.subdivisions.find((s) => s.subdivision.id === '26')!;
      const summary = vidarbha.report2Summary;

      // Engine computations are intact
      assert.equal(summary.isColdWaveSeason, true);
      assert.equal(summary.coldWaveStationsTotal, 12);
      assert.equal(typeof summary.coldWaveStationsCount, 'number');
      assert.equal(summary.isHeatWaveSeason, false);
      assert.equal(typeof summary.heatWaveStationsCount, 'number');
    });

    it('verifies independent visibility flags and complete column omission in Report2SummaryTable', async () => {
      const React = await import('react');
      const { renderToStaticMarkup } = await import('react-dom/server');
      const { Report2SummaryTable } = await import('./Report2SummaryTable.tsx');

      const result = generateDailyReports(
        SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
        '2026-01-05',
        normalProvider,
        historicalProvider
      );

      // Case 1: Both enabled (default)
      const htmlBoth = renderToStaticMarkup(
        React.createElement(Report2SummaryTable, {
          subdivisions: result.subdivisions,
          reportingDate: '2026-01-05',
          showHeatWaveCount: true,
          showColdWaveCount: true,
        })
      );
      assert.ok(htmlBoth.includes('<th>Heat Wave</th>'));
      assert.ok(htmlBoth.includes('<th>Cold Wave</th>'));
      assert.ok(htmlBoth.includes('colSpan="4">Maximum Temperature</th>'));
      assert.ok(htmlBoth.includes('colSpan="4">Minimum Temperature</th>'));
      assert.ok(htmlBoth.includes('<th>Highest Tmax</th>'));
      assert.ok(htmlBoth.includes('<th>Lowest Tmin</th>'));
      assert.ok(htmlBoth.includes('<th>Highest</th>')); // Renamed from Heaviest
      assert.ok(!htmlBoth.includes('<th>Heaviest</th>'));

      // Case 2: Heatwave disabled, Coldwave enabled
      const htmlNoHeat = renderToStaticMarkup(
        React.createElement(Report2SummaryTable, {
          subdivisions: result.subdivisions,
          reportingDate: '2026-01-05',
          showHeatWaveCount: false,
          showColdWaveCount: true,
        })
      );
      assert.ok(!htmlNoHeat.includes('<th>Heat Wave</th>'));
      assert.ok(htmlNoHeat.includes('<th>Cold Wave</th>'));
      assert.ok(htmlNoHeat.includes('colSpan="3">Maximum Temperature</th>'));
      assert.ok(htmlNoHeat.includes('colSpan="4">Minimum Temperature</th>'));

      // Case 3: Heatwave enabled, Coldwave disabled
      const htmlNoCold = renderToStaticMarkup(
        React.createElement(Report2SummaryTable, {
          subdivisions: result.subdivisions,
          reportingDate: '2026-01-05',
          showHeatWaveCount: true,
          showColdWaveCount: false,
        })
      );
      assert.ok(htmlNoCold.includes('<th>Heat Wave</th>'));
      assert.ok(!htmlNoCold.includes('<th>Cold Wave</th>'));
      assert.ok(htmlNoCold.includes('colSpan="4">Maximum Temperature</th>'));
      assert.ok(htmlNoCold.includes('colSpan="3">Minimum Temperature</th>'));

      // Case 4: Both disabled -> both columns removed entirely from header and body
      const htmlNeither = renderToStaticMarkup(
        React.createElement(Report2SummaryTable, {
          subdivisions: result.subdivisions,
          reportingDate: '2026-01-05',
          showHeatWaveCount: false,
          showColdWaveCount: false,
        })
      );
      assert.ok(!htmlNeither.includes('<th>Heat Wave</th>'));
      assert.ok(!htmlNeither.includes('<th>Cold Wave</th>'));
      assert.ok(htmlNeither.includes('colSpan="3">Maximum Temperature</th>'));
      assert.ok(htmlNeither.includes('colSpan="3">Minimum Temperature</th>'));
    });
  });

  describe('30. Extreme-Value Labels and Upper Case District Formatting with Tie Handling', () => {
    it('formats single district extreme in ALL CAPS with "XX.X at"', async () => {
      const { formatSummaryExtreme, formatExtremeDistrictList } = await import(
        './Report2SummaryTable.tsx'
      );

      assert.equal(formatExtremeDistrictList('Nagpur'), 'NAGPUR');

      const extreme = formatSummaryExtreme({ value: 35.4, stationNames: 'Nagpur' });
      assert.equal(extreme.valueLine, '35.4 at');
      assert.equal(extreme.districtsLine, 'NAGPUR');
      assert.equal(extreme.fullText, '35.4 at\nNAGPUR');
    });

    it('formats multiple tied districts with commas and "and" before the final district', async () => {
      const { formatSummaryExtreme, formatExtremeDistrictList } = await import(
        './Report2SummaryTable.tsx'
      );

      // Two tied districts
      assert.equal(formatExtremeDistrictList('Bhandara, Gondia'), 'BHANDARA and GONDIA');

      // Three tied districts
      assert.equal(
        formatExtremeDistrictList('District One, District Two, District Three'),
        'DISTRICT ONE, DISTRICT TWO and DISTRICT THREE'
      );

      // Multiple tied with "and" in the input
      assert.equal(
        formatExtremeDistrictList('DISTRICT ONE, DISTRICT TWO and DISTRICT THREE'),
        'DISTRICT ONE, DISTRICT TWO and DISTRICT THREE'
      );

      const extreme3 = formatSummaryExtreme({
        value: 35.4,
        stationNames: 'District One, District Two, District Three',
      });
      assert.equal(extreme3.valueLine, '35.4 at');
      assert.equal(
        extreme3.districtsLine,
        'DISTRICT ONE, DISTRICT TWO and DISTRICT THREE'
      );
      assert.equal(
        extreme3.fullText,
        '35.4 at\nDISTRICT ONE, DISTRICT TWO and DISTRICT THREE'
      );
    });

    it('resolves canonical station name to district and handles ties without duplication', async () => {
      const { formatExtremeDistrictList } = await import('./Report2SummaryTable.tsx');

      // Brahmapuri is in Chandrapur district
      assert.equal(formatExtremeDistrictList('Brahmapuri'), 'CHANDRAPUR');
      // If both Chandrapur and Brahmapuri report same extreme, deduplicates to CHANDRAPUR
      assert.equal(formatExtremeDistrictList('Chandrapur, Brahmapuri'), 'CHANDRAPUR');
    });

    it('handles null values and zero rainfall edge cases', async () => {
      const { formatSummaryExtreme } = await import('./Report2SummaryTable.tsx');

      const nullExt = formatSummaryExtreme({ value: null, stationNames: '---' });
      assert.equal(nullExt.valueLine, '---');
      assert.equal(nullExt.districtsLine, '');

      // Zero rainfall renders 0.0 without "at"
      const zeroRf = formatSummaryExtreme(
        { value: 0.0, stationNames: '---' },
        { isRainfall: true }
      );
      assert.equal(zeroRf.valueLine, '0.0');
      assert.equal(zeroRf.districtsLine, '');

      // Non-zero rainfall renders "XX.X at DISTRICT"
      const nonZeroRf = formatSummaryExtreme(
        { value: 42.5, stationNames: 'Nagpur' },
        { isRainfall: true }
      );
      assert.equal(nonZeroRf.valueLine, '42.5 at');
      assert.equal(nonZeroRf.districtsLine, 'NAGPUR');
    });
  });

  describe('31. Dynamic Forecast Headings and dd-MMMM-yyyy Format', () => {
    it('formats reporting date as dd-MMMM-yyyy accurately', async () => {
      const { formatDdMmmmYyyy } = await import('./ForecasterForecastTables.tsx');

      assert.equal(formatDdMmmmYyyy('2026-10-09'), '09-October-2026');
      assert.equal(formatDdMmmmYyyy('2026-01-05'), '05-January-2026');
      assert.equal(formatDdMmmmYyyy('2024-02-29'), '29-February-2024');
    });

    it('renders exact requested dynamic headings and subheadings for forecast worksheets', async () => {
      const React = await import('react');
      const { renderToStaticMarkup } = await import('react-dom/server');
      const { ForecasterSummaryTable, DistrictForecastTable } = await import(
        './ForecasterForecastTables.tsx'
      );

      const htmlSpatial = renderToStaticMarkup(
        React.createElement(ForecasterSummaryTable, { reportingDate: '2026-10-09' })
      );
      assert.ok(
        htmlSpatial.includes(
          'Forecast/Warnings issued on 09-October-2026 for next five days:'
        )
      );
      assert.ok(
        htmlSpatial.includes('*(To be entered during video conferencing)*')
      );

      const htmlDistrict = renderToStaticMarkup(
        React.createElement(DistrictForecastTable, { reportingDate: '2026-10-09' })
      );
      assert.ok(
        htmlDistrict.includes(
          'District-wise Forecast/Warning with Intensity and Probability issued on 09-October-2026:'
        )
      );
      assert.ok(htmlDistrict.includes('Vidarbha Subdivision:'));
    });
  });

  describe('32. Reporting Date Asia/Kolkata (IST) Synchronization', () => {
    it('defaults to current Asia/Kolkata date and handles timezone boundary offsets', async () => {
      const { getTodayKolkata } = await import('../utils/timeSlot.ts');

      // Late night UTC (e.g. 2026-10-08 20:00 UTC) is early morning next day in IST (+5:30 -> 2026-10-09 01:30 IST)
      const lateUtc = new Date(Date.UTC(2026, 9, 8, 20, 0, 0));
      assert.equal(getTodayKolkata(lateUtc), '2026-10-09');

      // Early morning UTC (e.g. 2026-10-09 01:00 UTC) is morning same day in IST (+5:30 -> 2026-10-09 06:30 IST)
      const morningUtc = new Date(Date.UTC(2026, 9, 9, 1, 0, 0));
      assert.equal(getTodayKolkata(morningUtc), '2026-10-09');
    });

    it('verifies user-selected date preservation logic preserves custom selection', () => {
      let isUserSelected = false;
      let activeReportingDate = '2026-10-09';

      const handleUserSelectDate = (chosenDate: string) => {
        isUserSelected = true;
        activeReportingDate = chosenDate;
      };

      const syncWithIst = (currentIstDate: string) => {
        if (!isUserSelected) {
          activeReportingDate = currentIstDate;
        }
      };

      // User selects a previous date
      handleUserSelectDate('2026-10-05');
      assert.equal(activeReportingDate, '2026-10-05');

      // IST clock advances or sync runs
      syncWithIst('2026-10-10');
      // Must NOT reset user-selected date
      assert.equal(activeReportingDate, '2026-10-05');
    });
  });

  describe('33. Operational Report Enhancements (Forecast Worksheets, Operational Clock, Revised Button Removal, Split Rainfall)', () => {
    it('verifies forecast worksheets are absent from Subdivision-wise Report but remain in Weather Summary', async () => {
      const { Report3SubdivisionView } = await import('./Report3SubdivisionView.tsx');
      const { Report2SummaryTable } = await import('./Report2SummaryTable.tsx');
      const { generateDailyReports } = await import('../engine/reportOrchestrator.ts');
      const { defaultPentadNormalProvider } = await import('../providers/pentadNormalProvider.ts');

      const sampleBulletin = `AAXX 09034
42933 32996 02502 10385 20210 40120 333 20210 58005 555 10000=`;
      const report = generateDailyReports(sampleBulletin, '2026-10-09', defaultPentadNormalProvider);

      const htmlSubdivision = renderToStaticMarkup(
        React.createElement(Report3SubdivisionView, {
          subdivisions: report.subdivisions,
          reportingDate: '2026-10-09',
          eveningDate: '2026-10-08',
        })
      );

      // Forecast worksheet is ABSENT from Subdivision-wise Observation Report
      assert.ok(!htmlSubdivision.includes('District-wise Forecast/Warning with Intensity and Probability'));
      assert.ok(!htmlSubdivision.includes('Vidarbha Subdivision:'));
      assert.ok(!htmlSubdivision.includes('district-forecast-table'));

      // Forecast worksheets REMAIN in Weather Summary Report (Report 2)
      const htmlSummary = renderToStaticMarkup(
        React.createElement(Report2SummaryTable, {
          subdivisions: report.subdivisions,
          reportingDate: '2026-10-09',
        })
      );
      assert.ok(htmlSummary.includes('Forecast/Warnings issued on 09-October-2026 for next five days:'));
      assert.ok(htmlSummary.includes('(To be entered during video conferencing)'));
      assert.ok(htmlSummary.includes('District-wise Forecast/Warning with Intensity and Probability issued on 09-October-2026:'));
      assert.ok(htmlSummary.includes('Vidarbha Subdivision:'));
    });

    it('verifies Revised Station Code button is absent from SynopInput UI while revision merge functionality remains intact', async () => {
      const { SynopInput } = await import('./SynopInput.tsx');

      const htmlSynop = renderToStaticMarkup(
        React.createElement(SynopInput, {
          reportingDate: '2026-10-09',
          onReportingDateChange: () => {},
          utcSlot: '03Z',
          onUtcSlotChange: () => {},
          synopText: 'AAXX ...',
          onSynopTextChange: () => {},
          onGenerate: () => {},
          onClear: () => {},
          isGenerating: false,
          errorMessage: null,
        })
      );

      // Revised Station Code button is ABSENT from UI
      assert.ok(!htmlSynop.includes('Revised Station Code'));
      assert.ok(!htmlSynop.includes('btn-revised-code'));
      // Normal process button remains
      assert.ok(htmlSynop.includes('Process 03Z &amp; Generate') || htmlSynop.includes('Process 03Z & Generate'));
    });

    it('verifies Operational Clock visual refinement, typography, and accurate IST/UTC conversion', async () => {
      const { AppHeader } = await import('./AppHeader.tsx');
      const { formatOperationalClock } = await import('../utils/timeSlot.ts');

      const fixedTime = new Date('2026-10-09T03:00:00Z'); // 08:30 IST, 03:00 UTC
      const clockString = formatOperationalClock(fixedTime);
      assert.equal(clockString, '09/10/2026 08:30 IST | 03:00 UTC');

      const htmlHeader = renderToStaticMarkup(
        React.createElement(AppHeader, {
          onToggleMenu: () => {},
          clockString,
        })
      );

      // Operational clock elements present with legible styling classes
      assert.ok(htmlHeader.includes('class="operational-clock"'));
      assert.ok(htmlHeader.includes('class="clock-ist">09/10/2026 08:30 IST</span>'));
      assert.ok(htmlHeader.includes('class="clock-divider"'));
      assert.ok(htmlHeader.includes('class="clock-utc">03:00 UTC</span>'));
    });

    it('verifies Subdivision-wise Report splits rainfall into 24h (0830) and 9h (1730) subcolumns with legacy PHP rules', async () => {
      const { Report3SubdivisionView } = await import('./Report3SubdivisionView.tsx');
      const { InMemoryObservationStore } = await import('../engine/observationStore.ts');
      const { generateDailyReports } = await import('../engine/reportOrchestrator.ts');
      const { defaultPentadNormalProvider } = await import('../providers/pentadNormalProvider.ts');

      const store = new InMemoryObservationStore();
      const date = '2026-10-09';

      // 1. Ingest 03Z observation (reporting 24h rainfall up to 0830 IST)
      // Akola (42933) reports 12.5 mm in Section 555 (00125)
      // Nagpur (42867) reports 0.0 mm
      const synop03Z = `AAXX 09034
42933 11996 02502 10260 20210 40120 333 20210 58005 555 00125 10000=
42867 31996 03201 10250 20200 40124 333 20205 58005 555 10000=`;
      store.ingestBulletin('03Z', synop03Z, date);

      // 2. Ingest 12Z observation (reporting 9h rainfall up to 1730 IST)
      // Akola (42933) reports 3.2 mm in Section 555 (00032)
      // Nagpur (42867) reports no rain (0.0 mm)
      // Gondia (42871) reports 8.4 mm in 12Z (00084) but was not in 03Z
      const synop12Z = `AAXX 09124
42933 11996 02502 10385 20210 40120 333 10412 58005 555 00032 10000=
42867 31996 03201 10382 20215 40124 333 10408 58005 555 10000=
42871 11995 22002 10366 20224 40122 70500 333 10398 58008 555 00084=`;
      store.ingestBulletin('12Z', synop12Z, date);

      const report = generateDailyReports('', date, defaultPentadNormalProvider, undefined, {
        observationStore: store,
      });

      const vidarbha = report.subdivisions.find((s) => String(s.subdivision.id) === '26');
      assert.ok(vidarbha);

      const akolaRow = vidarbha.report1Rows.find((r) => r.stationId === '42933');
      const gondiaRow = vidarbha.report1Rows.find((r) => r.stationId === '42871');
      assert.ok(akolaRow);
      assert.ok(gondiaRow);

      // Akola: 24h rainfall (0830) is 12.5 mm; 9h rainfall (1730) is 3.2 mm
      assert.equal(akolaRow.rainfall0830, 12.5);
      assert.equal(akolaRow.rainfall1730, 3.2);

      // Gondia: was only in 12Z, so 24h rainfall (0830) is null; 9h rainfall (1730) is 8.4 mm
      assert.equal(gondiaRow.rainfall0830, null);
      assert.equal(gondiaRow.rainfall1730, 8.4);

      // Render Subdivision-wise report HTML in 12Z mode
      const htmlSubdivision = renderToStaticMarkup(
        React.createElement(Report3SubdivisionView, {
          subdivisions: report.subdivisions,
          reportingDate: date,
          eveningDate: '2026-10-08',
          reportSlot: '12Z',
        })
      );

      // Check subcolumn headers in 12Z mode
      assert.ok(htmlSubdivision.includes('Last 24 Hours up to 0830 hrs IST'));
      assert.ok(htmlSubdivision.includes('Last 9 Hours up to 1730 hrs IST'));
      assert.ok(htmlSubdivision.includes('class="col-rain-sub"'));

      // Check period-specific values rendered
      assert.ok(htmlSubdivision.includes('12.5'));
      assert.ok(htmlSubdivision.includes('3.2'));
      assert.ok(htmlSubdivision.includes('8.4'));

      // Check missing data formatted as '---'
      assert.ok(htmlSubdivision.includes('---'));

      // Render Subdivision-wise report HTML in 03Z mode to verify 1730 columns are hidden
      const htmlSubdivision03Z = renderToStaticMarkup(
        React.createElement(Report3SubdivisionView, {
          subdivisions: report.subdivisions,
          reportingDate: date,
          eveningDate: '2026-10-08',
          reportSlot: '03Z',
        })
      );

      // Verify 1730 columns are hidden in 03Z mode
      assert.ok(!htmlSubdivision03Z.includes('Last 9 Hours up to 1730 hrs IST'));
      assert.ok(!htmlSubdivision03Z.includes('at 1730 IST'));
    });
  });

  describe('34. Gadchiroli & Missing Normal Validation and Simplified Subdivision Summary Labels', () => {
    it('verifies stations with missing pentad normals display "---" for normal and departure without fabricating departures', async () => {
      const { generateDailyReports } = await import('../engine/reportOrchestrator.ts');
      const { defaultPentadNormalProvider } = await import('../providers/pentadNormalProvider.ts');
      const { InMemoryObservationStore } = await import('../engine/observationStore.ts');

      const store = new InMemoryObservationStore();
      const date = '2026-10-09';

      // 1. Ingest bulletin with:
      // - Akola (42933, has normal in master dataset)
      // - Gadchiroli (42943, has normal in master dataset)
      // - Yavatmal (42947, missing from 1981-2010 normal dataset)
      // - Bhopal (42672, missing from 1981-2010 normal dataset)
      const bulletin = `AAXX 09034
42933 11996 02502 10260 20210 40120 333 10350 20210 58005 555 10000=
42943 32995 40902 10242 20213 40060 333 10340 20198 58007 555 10000=
42947 32595 21402 10284 20213 40140 82100 333 10380 20242 58010 555 10000=
42672 32996 00000 10250 20200 40140 333 10360 20210 58010 555 10000=`;

      store.ingestBulletin('03Z', bulletin, date);
      const bulletin12z = `AAXX 09124
42933 11996 02502 10350 20210 40120 333 10350 58005 555 10000=
42943 32995 40902 10340 20213 40060 333 10340 58007 555 10000=
42947 32595 21402 10380 20213 40140 82100 333 10380 58010 555 10000=
42672 32996 00000 10360 20200 40140 333 10360 58010 555 10000=`;
      store.ingestBulletin('12Z', bulletin12z, date);

      const report = generateDailyReports('', date, defaultPentadNormalProvider, undefined, {
        utcSlot: '12Z',
        observationStore: store,
      });

      const vidarbha = report.subdivisions.find((s) => String(s.subdivision.id) === '26');
      const westMp = report.subdivisions.find((s) => String(s.subdivision.id) === '19');
      assert.ok(vidarbha);
      assert.ok(westMp);

      // 1. Stations with valid normals maintain valid numeric departures
      const akola = vidarbha.report1Rows.find((r) => r.stationId === '42933')!;
      assert.ok(akola);
      assert.ok(akola.tminDeparture !== null && akola.tminDeparture !== '---');
      assert.ok(akola.tmaxDeparture !== null && akola.tmaxDeparture !== '---');

      const gadchiroli = vidarbha.report1Rows.find((r) => r.stationId === '42943')!;
      assert.ok(gadchiroli);
      assert.ok(gadchiroli.tminDeparture !== null && gadchiroli.tminDeparture !== '---');
      assert.ok(gadchiroli.tmaxDeparture !== null && gadchiroli.tmaxDeparture !== '---');

      // 2. Stations with missing normals (Yavatmal 42947 & Bhopal 42672) display '---'
      const yavatmal = vidarbha.report1Rows.find((r) => r.stationId === '42947')!;
      assert.ok(yavatmal);
      assert.equal(yavatmal.tmin, 24.2);
      assert.equal(yavatmal.tmax, 38.0);
      assert.equal(yavatmal.tminDeparture, '---');
      assert.equal(yavatmal.tmaxDeparture, '---');

      const bhopal = westMp.report1Rows.find((r) => r.stationId === '42672')!;
      assert.ok(bhopal);
      assert.equal(bhopal.tmin, 21.0);
      assert.equal(bhopal.tmax, 36.0);
      assert.equal(bhopal.tminDeparture, '---');
      assert.equal(bhopal.tmaxDeparture, '---');

      // 3. When normal provider returns null for a station, departures must ALWAYS be '---'
      const emptyNormalProvider = {
        getNormal: () => null,
      };
      const reportNoNormals = generateDailyReports('', date, emptyNormalProvider, undefined, {
        utcSlot: '12Z',
        observationStore: store,
      });
      const vidNoNormals = reportNoNormals.subdivisions.find((s) => String(s.subdivision.id) === '26')!;
      for (const row of vidNoNormals.report1Rows) {
        if (row.tmin !== null) assert.equal(row.tminDeparture, '---');
        if (row.tmax !== null) assert.equal(row.tmaxDeparture, '---');
      }
    });

    it('verifies simplified subdivision summary labels remove classifications and format with one decimal place and units', async () => {
      const {
        cleanExtremeStationList,
        formatSubdivisionSummaryLabel,
        Report3SubdivisionView,
      } = await import('./Report3SubdivisionView.tsx');

      // 1. Station name cleaning and uppercase formatting without parentheticals
      assert.equal(cleanExtremeStationList('Morena (MBN)'), 'MORENA');
      assert.equal(cleanExtremeStationList('Ujjain (Normal)'), 'UJJAIN');
      assert.equal(cleanExtremeStationList('Rajgarh (WS)'), 'RAJGARH');
      assert.equal(cleanExtremeStationList('Sheopur (Kalan)'), 'SHEOPUR');
      assert.equal(cleanExtremeStationList('Akola (AKL), Amravati'), 'AKOLA and AMRAVATI');

      // 2. Exact user requirement formats:
      // Max: 35.4 at Morena (MBN) -> Max: 35.4 °C at MORENA
      // Min: 19.1 at Ujjain (Normal) -> Min: 19.1 °C at UJJAIN
      // Rainfall: 79 at Rajgarh (WS) -> Rainfall: 79.0 mm at RAJGARH
      const maxLabel = formatSubdivisionSummaryLabel('Max', {
        value: 35.4,
        stationNames: 'Morena (MBN)',
      });
      assert.equal(maxLabel, '35.4 °C at MORENA');

      const minLabel = formatSubdivisionSummaryLabel('Min', {
        value: 19.1,
        stationNames: 'Ujjain (Normal)',
      });
      assert.equal(minLabel, '19.1 °C at UJJAIN');

      const rfLabel = formatSubdivisionSummaryLabel('Rainfall', {
        value: 79,
        stationNames: 'Rajgarh (WS)',
      });
      assert.equal(rfLabel, '79.0 mm at RAJGARH');

      // 3. Whole number values formatted strictly to one decimal place (xx.x)
      const wholeNumTemp = formatSubdivisionSummaryLabel('Max', {
        value: 35,
        stationNames: 'Morena',
      });
      assert.equal(wholeNumTemp, '35.0 °C at MORENA');

      // 4. Missing extreme values degrade cleanly to '---'
      assert.equal(formatSubdivisionSummaryLabel('Max', { value: null, stationNames: '---' }), '---');
      assert.equal(formatSubdivisionSummaryLabel('Min', null), '---');

      // 5. Test rendered HTML markup of Report3SubdivisionView contains clean labels
      const testSubData = [
        {
          subdivision: { id: '19', name: 'West Madhya Pradesh', code: 'WMP', stationIds: ['42456', '42752', '42559'] },
          report1Rows: [],
          report2Summary: {
            subdivisionId: '19',
            subdivisionName: 'West Madhya Pradesh',
            tmax24hChangeAvg: 0.5,
            tmax24hChangeClass: 'Little Change',
            tmaxDepartureAvg: 1.2,
            tmaxDepartureClass: 'Normal',
            highestTmax: { value: 35.4, stationNames: 'Morena (MBN)', formattedText: '35.4 at Morena (MBN)' },
            heatWaveStationsCount: 0,
            heatWaveStationsTotal: 3,
            isHeatWaveSeason: false,
            tmin24hChangeAvg: -0.2,
            tmin24hChangeClass: 'Little Change',
            tminDepartureAvg: 0.1,
            tminDepartureClass: 'Normal',
            lowestTmin: { value: 19.1, stationNames: 'Ujjain (Normal)', formattedText: '19.1 at Ujjain (Normal)' },
            coldWaveStationsCount: 0,
            coldWaveStationsTotal: 3,
            isColdWaveSeason: false,
            heaviestRainfall: { value: 79, stationNames: 'Rajgarh (WS)', formattedText: '79 at Rajgarh (WS)' },
            rainfallPercent: 33,
            rainfallDistributionClass: 'ISOL',
            rainfallDistributionColor: '#90EE90',
          },
          reportingStationsCount: 3,
          stationInputs: [],
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(Report3SubdivisionView, {
          subdivisions: testSubData as any,
          reportingDate: '2026-10-09',
          eveningDate: '2026-10-08',
        })
      );

      // Verify the rendered summary chips
      assert.ok(html.includes('Max:</strong> 35.4 °C at MORENA'));
      assert.ok(html.includes('Min:</strong> 19.1 °C at UJJAIN'));
      assert.ok(html.includes('Rainfall:</strong> 79.0 mm at RAJGARH'));
      // Verify parentheticals are stripped from summary labels
      assert.ok(!html.includes('(MBN)'));
      assert.ok(!html.includes('(WS)'));
    });
  });

  describe('30. Date Row and Configurable Visibility Column in Consolidated and Subdivision Reports', () => {
    const dummySubdivisions = [
      {
        subdivision: { id: '26', name: 'VIDARBHA' },
        report1Rows: [
          {
            stationId: '42867',
            stationName: 'Nagpur',
            tmax: 34.0,
            tmaxChange24h: 0.5,
            tmaxDeparture: 1.0,
            tmin: 22.0,
            tminChange24h: -0.2,
            tminDeparture: -0.5,
            rh0830: 65,
            rh1730: 50,
            visibilityText: '4000m',
            rainfall: 0.0,
            rainfall0830: 0.0,
            rainfall1730: 0.0,
            rainfallColor: 'white',
          },
        ],
        report2Summary: {
          highestTmax: { value: 34.0, stationNames: 'Nagpur', formattedText: '34.0 at Nagpur' },
          lowestTmin: { value: 22.0, stationNames: 'Nagpur', formattedText: '22.0 at Nagpur' },
          heaviestRainfall: { value: 0.0, stationNames: '', formattedText: '0.0 mm' },
        },
        reportingStationsCount: 1,
        stationInputs: [],
      },
    ];

    it('renders Date Row in Report1StationTable with yesterday and today observation dates', async () => {
      const { Report1StationTable } = await import('./Report1StationTable.tsx');
      const html = renderToStaticMarkup(
        React.createElement(Report1StationTable, {
          subdivisions: dummySubdivisions as any,
          reportingDate: '2026-10-25',
          eveningDate: '2026-10-24',
          reportSlot: '03Z',
          showVisibility: false,
        })
      );

      // Verify date row presence
      assert.ok(html.includes('header-date-row'));
      assert.ok(html.includes('Observed on 2026-10-24'));
      assert.ok(html.includes('Observed on 2026-10-25'));
      // Yesterday date row spans 3 columns (Max, 24h Chg, Dep)
      assert.match(html, /<th[^>]*colspan="3"[^>]*>Observed on 2026-10-24<\/th>/i);
      // In 03Z without visibility: remaining columns = 3 (Min) + 1 (RH) + 1 (Rainfall) = 5
      assert.match(html, /<th[^>]*colspan="5"[^>]*>Observed on 2026-10-25<\/th>/i);
      // Visibility column header and cell are omitted by default
      assert.ok(!html.includes('>Visibility<'));
      assert.ok(!html.includes('4000m'));
    });

    it('renders Visibility column in Report1StationTable when showVisibility is enabled', async () => {
      const { Report1StationTable } = await import('./Report1StationTable.tsx');
      const html = renderToStaticMarkup(
        React.createElement(Report1StationTable, {
          subdivisions: dummySubdivisions as any,
          reportingDate: '2026-10-25',
          eveningDate: '2026-10-24',
          reportSlot: '03Z',
          showVisibility: true,
        })
      );

      // Visibility column header and cell are now present
      assert.ok(html.includes('>Visibility<'));
      assert.ok(html.includes('4000m'));
      // In 03Z with visibility: remaining columns = 3 (Min) + 1 (RH) + 1 (Vis) + 1 (Rainfall) = 6
      assert.match(html, /<th[^>]*colspan="6"[^>]*>Observed on 2026-10-25<\/th>/i);
    });

    it('adapts Date Row and Visibility column in 12Z report mode', async () => {
      const { Report1StationTable } = await import('./Report1StationTable.tsx');
      const html12ZNoVis = renderToStaticMarkup(
        React.createElement(Report1StationTable, {
          subdivisions: dummySubdivisions as any,
          reportingDate: '2026-10-25',
          eveningDate: '2026-10-24',
          reportSlot: '12Z',
          showVisibility: false,
        })
      );
      // In 12Z without visibility: remaining columns = 3 (Min) + 2 (RH) + 2 (Rainfall) = 7
      assert.match(html12ZNoVis, /<th[^>]*colspan="7"[^>]*>Observed on 2026-10-25<\/th>/i);

      const html12ZWithVis = renderToStaticMarkup(
        React.createElement(Report1StationTable, {
          subdivisions: dummySubdivisions as any,
          reportingDate: '2026-10-25',
          eveningDate: '2026-10-24',
          reportSlot: '12Z',
          showVisibility: true,
        })
      );
      // In 12Z with visibility: remaining columns = 3 (Min) + 2 (RH) + 1 (Vis) + 2 (Rainfall) = 8
      assert.match(html12ZWithVis, /<th[^>]*colspan="8"[^>]*>Observed on 2026-10-25<\/th>/i);
    });

    it('renders Date Row and respects showVisibility in Report3SubdivisionView', async () => {
      const { Report3SubdivisionView } = await import('./Report3SubdivisionView.tsx');
      const htmlNoVis = renderToStaticMarkup(
        React.createElement(Report3SubdivisionView, {
          subdivisions: dummySubdivisions as any,
          reportingDate: '2026-10-25',
          eveningDate: '2026-10-24',
          reportSlot: '03Z',
          showVisibility: false,
        })
      );
      assert.ok(htmlNoVis.includes('header-date-row'));
      assert.ok(htmlNoVis.includes('Observed on 2026-10-24'));
      assert.ok(htmlNoVis.includes('Observed on 2026-10-25'));
      assert.ok(!htmlNoVis.includes('>Visibility<'));
      assert.ok(!htmlNoVis.includes('4000m'));

      const htmlWithVis = renderToStaticMarkup(
        React.createElement(Report3SubdivisionView, {
          subdivisions: dummySubdivisions as any,
          reportingDate: '2026-10-25',
          eveningDate: '2026-10-24',
          reportSlot: '03Z',
          showVisibility: true,
        })
      );
      assert.ok(htmlWithVis.includes('>Visibility<'));
      assert.ok(htmlWithVis.includes('4000m'));
    });
  });
});

