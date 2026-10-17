/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MasterPentadNormalProvider,
  defaultPentadNormalProvider,
  getPentadFromDate,
  getNormalsForDate,
} from './pentadNormalProvider.ts';
import { getDefaultIndexedDataset, indexPentadDatasets } from '../data/pentadDataset.ts';
import { enrichObservation } from '../engine/climatology.ts';
import { generateDailyReports } from '../engine/reportOrchestrator.ts';
import {
  InMemoryHistoricalProvider,
  SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
  SAMPLE_HISTORICAL_OBSERVATIONS,
} from './fixtureProvider.ts';
import type { ParsedStationObservation } from '../parser/synopDecoder.ts';

describe('Production Pentad Normal Provider Suite', () => {
  const provider = defaultPentadNormalProvider;
  const dataset = getDefaultIndexedDataset();

  describe('1. Dataset Loading, Schemas & Integrity Checks', () => {
    it('loads exactly 48 stations from master pentad dataset', () => {
      assert.equal(provider.getStationCount(), 48);
      assert.equal(dataset.stats.stationsLoaded, 48);
      assert.equal(dataset.metadata.station_count, 48);
    });

    it('indexes exactly 3504 records (48 stations * 73 pentads)', () => {
      assert.equal(dataset.stats.totalRecordsIndexed, 3504);
      assert.equal(dataset.metadata.total_records, 3504);
      assert.equal(dataset.metadata.period, '1981-2010');
    });

    it('verifies zero duplicates and zero malformed records in the master dataset', () => {
      assert.equal(dataset.stats.duplicatesDetected, 0);
      assert.equal(dataset.stats.malformedRecordsDetected, 0);
    });

    it('loads all 73 pentad intervals (1 to 73)', () => {
      assert.equal(dataset.pentadIntervals.size, 73);
      for (let p = 1; p <= 73; p++) {
        const interval = provider.getPentadInterval(p);
        assert.ok(interval, `Pentad interval ${p} must exist`);
        assert.equal(interval.pentad_id, p);
      }
    });

    it('loads all 366 calendar entries from pentad_calendar_366.json', () => {
      assert.equal(dataset.calendarMap.size, 366);
      const leapDay = provider.getCalendarEntry('02-29');
      assert.ok(leapDay);
      assert.equal(leapDay.pentad_id, 12);
      assert.equal(leapDay.doy_standard, null);
      assert.equal(leapDay.date_range, 'Feb 25 - Mar 01');
    });

    it('documents the 5 known missing stations from the 1981-2010 normal dataset', () => {
      const missing = provider.getMissingStations();
      assert.deepEqual([...missing].sort(), ['13301', '42672', '42782', '42947', '42948']);
      for (const stn of missing) {
        assert.equal(provider.hasStation(stn), false, `Station ${stn} should not be in active stations`);
      }
    });
  });

  describe('2. Representative Station & Pentad Normals Lookup', () => {
    it('retrieves correct normals for Akola (42933) across diverse pentads', () => {
      // Pentad 01 (Jan 01 - Jan 05)
      const p1 = provider.getNormal('42933', '01');
      assert.ok(p1);
      assert.equal(p1.station, '42933');
      assert.equal(p1.tmin, 13.4);
      assert.equal(p1.tmax, 28.5);

      // Pentad 02 (Jan 06 - Jan 10)
      const p2 = provider.getNormal('42933', '02');
      assert.ok(p2);
      assert.equal(p2.tmin, 13.0);
      assert.equal(p2.tmax, 29.4);

      // Pentad 12 (Feb 25 - Mar 01)
      const p12 = provider.getNormal('42933', '12');
      assert.ok(p12);
      assert.equal(p12.tmin, 17.7);
      assert.equal(p12.tmax, 35.0);

      // Pentad 30 (May 26 - May 30)
      const p30 = provider.getNormal('42933', '30');
      assert.ok(p30);
      assert.equal(p30.tmin, 28.4);
      assert.equal(p30.tmax, 42.2);

      // Pentad 73 (Dec 27 - Dec 31)
      const p73 = provider.getNormal('42933', '73');
      assert.ok(p73);
      assert.equal(p73.tmin, 12.9);
      assert.equal(p73.tmax, 30.0);
    });

    it('retrieves correct normals for Nagpur (42937)', () => {
      const p1 = provider.getNormal('42937', '01');
      assert.ok(p1);
      assert.equal(p1.station, '42937');
      assert.equal(p1.tmin, 13.9);
      assert.equal(p1.tmax, 27.8);
    });

    it('retrieves correct normals for Gwalior (42361)', () => {
      const p1 = provider.getNormal('42361', '01');
      assert.ok(p1);
      assert.equal(p1.station, '42361');
      assert.equal(p1.tmin, 7.3);
      assert.equal(p1.tmax, 21.2);
    });

    it('retrieves correct normals for Gondia (42871)', () => {
      const p1 = provider.getNormal('42871', '01');
      assert.ok(p1);
      assert.equal(p1.station, '42871');
      assert.equal(p1.tmin, 12.3);
      assert.equal(p1.tmax, 27.5);
    });

    it('supports both zero-padded ("01") and unpadded ("1") pentad string lookups', () => {
      const padded = provider.getNormal('42933', '01');
      const unpadded = provider.getNormal('42933', '1');
      assert.ok(padded);
      assert.ok(unpadded);
      assert.equal(padded.tmin, unpadded.tmin);
      assert.equal(padded.tmax, unpadded.tmax);
    });
  });

  describe('3. Extended Normals (Pressure & Relative Humidity)', () => {
    it('retrieves MSLP and RH normals for Akola (42933)', () => {
      const ext = provider.getExtendedNormal('42933', '01');
      assert.ok(ext);
      assert.equal(ext.station, '42933');
      assert.equal(ext.tmin, 13.4);
      assert.equal(ext.tmax, 28.5);
      assert.equal(ext.pres1, 1017.4);
      assert.equal(ext.pres2, 1012.4);
      assert.equal(ext.rh1, 70);
      assert.equal(ext.rh2, 43);
    });

    it('retrieves MSLP and RH normals for Gwalior (42361)', () => {
      const ext = provider.getExtendedNormal('42361', '01');
      assert.ok(ext);
      assert.equal(ext.pres1, 1019.7);
      assert.equal(ext.pres2, 1016.4);
      assert.equal(ext.rh1, 88);
      assert.equal(ext.rh2, 64);
    });
  });

  describe('4. Missing & Invalid Station Handling', () => {
    it('returns null for known missing station Bhopal (42672)', () => {
      assert.equal(provider.getNormal('42672', '01'), null);
      assert.equal(provider.getExtendedNormal('42672', '01'), null);
    });

    it('returns null for known missing station Yeotmal (42947)', () => {
      assert.equal(provider.getNormal('42947', '01'), null);
    });

    it('returns null for known missing station Durg (42948)', () => {
      assert.equal(provider.getNormal('42948', '01'), null);
    });

    it('returns null for arbitrary unknown station ID (99999)', () => {
      assert.equal(provider.getNormal('99999', '01'), null);
    });

    it('returns null for empty station string', () => {
      assert.equal(provider.getNormal('', '01'), null);
    });
  });

  describe('5. Missing & Invalid Pentad Handling', () => {
    it('returns null for pentad "00" (legacy PHP Jan 1 Tmax behavior)', () => {
      assert.equal(provider.getNormal('42933', '00'), null);
    });

    it('returns null for pentad "0"', () => {
      assert.equal(provider.getNormal('42933', '0'), null);
    });

    it('returns null for pentad "74" (out of 1..73 range)', () => {
      assert.equal(provider.getNormal('42933', '74'), null);
    });

    it('returns null for negative pentad string "-1"', () => {
      assert.equal(provider.getNormal('42933', '-1'), null);
    });

    it('returns null for non-numeric pentad string "abc"', () => {
      assert.equal(provider.getNormal('42933', 'abc'), null);
    });

    it('returns null for empty pentad string', () => {
      assert.equal(provider.getNormal('42933', ''), null);
    });
  });

  describe('6. Date-to-Pentad Resolution & Adapted Query Logic', () => {
    it('computes pentads accurately from Date objects and date strings', () => {
      // Jan 1 to Jan 5 -> Pentad 1
      assert.equal(getPentadFromDate('2026-01-01'), 1);
      assert.equal(getPentadFromDate('2026-01-05'), 1);
      assert.equal(getPentadFromDate(new Date(2026, 0, 5)), 1);

      // Jan 6 -> Pentad 2
      assert.equal(getPentadFromDate('2026-01-06'), 2);

      // Feb 25 - Mar 01 -> Pentad 12
      assert.equal(getPentadFromDate('2026-02-28'), 12);
      assert.equal(getPentadFromDate('2024-02-29'), 12); // Leap day
      assert.equal(getPentadFromDate('2026-03-01'), 12);

      // Mar 2 -> Pentad 13
      assert.equal(getPentadFromDate('2026-03-02'), 13);

      // Dec 31 -> Pentad 73
      assert.equal(getPentadFromDate('2026-12-31'), 73);
    });

    it('supports MM-DD string inputs', () => {
      assert.equal(getPentadFromDate('01-01'), 1);
      assert.equal(getPentadFromDate('05-18'), 28);
      assert.equal(getPentadFromDate('12-31'), 73);
    });

    it('cross-verifies all 366 days in pentad_calendar_366.json against getPentadFromDate', () => {
      for (const [mmdd, entry] of dataset.calendarMap.entries()) {
        const calculated = getPentadFromDate(`2024-${mmdd}`);
        assert.equal(calculated, entry.pentad_id, `Day ${mmdd} must match calendar pentad_id`);
      }
    });

    it('queries complete normal record directly by date using getNormalsForDate', () => {
      const res = getNormalsForDate('42933', '2026-01-03');
      assert.ok(res);
      assert.equal(res.station, '42933');
      assert.equal(res.pentad_id, 1);
      assert.equal(res.date_range, 'Jan 01 - Jan 05');
      assert.equal(res.start_mmdd, '01-01');
      assert.equal(res.end_mmdd, '01-05');
      assert.equal(res.normals.tmin, 13.4);
      assert.equal(res.normals.tmax, 28.5);
      assert.equal(res.normals.pres1, 1017.4);
      assert.equal(res.normals.rh1, 70);
    });

    it('returns null from getNormalsForDate when station is missing', () => {
      const res = getNormalsForDate('99999', '2026-01-03');
      assert.equal(res, null);
    });
  });

  describe('7. Compatibility with Climatological Enrichment Pipeline', () => {
    it('correctly enriches observations with real 1981-2010 departures', () => {
      const obs: ParsedStationObservation = {
        stationId: '42933', // Akola
        tmin: 22.6,
        tmaxPreviousDay: 32.5,
        dryBulb: 26.2,
        dewPoint: 20.1,
        relativeHumidity: 69,
      };

      // On Jan 5:
      // Tmin uses pentad 01 -> Akola Tmin normal = 13.4. Departure = 22.6 - 13.4 = +9.2
      // Tmax uses pentad 01 -> Akola Tmax normal = 28.5. Departure = 32.5 - 28.5 = +4.0
      const enriched = enrichObservation(obs, '2026-01-05', provider);

      assert.equal(enriched.stationId, '42933');
      assert.equal(enriched.tmin, 22.6);
      assert.equal(enriched.tminDeparture, '+9.2');
      assert.equal(enriched.tmax, 32.5);
      assert.equal(enriched.tmaxDeparture, '+4.0');
    });

    it('preserves legacy "---" behavior when station normal is missing in master dataset', () => {
      const obs: ParsedStationObservation = {
        stationId: '42947', // Yeotmal (missing from master dataset)
        tmin: 24.2,
        tmaxPreviousDay: 35.0,
      };

      const enriched = enrichObservation(obs, '2026-01-05', provider);
      assert.equal(enriched.tmin, 24.2);
      assert.equal(enriched.tminDeparture, '---');
      assert.equal(enriched.tmax, 35.0);
      assert.equal(enriched.tmaxDeparture, '---');
    });

    it('preserves legacy "---" behavior on Jan 1 Tmax when pentad evaluates to "00"', () => {
      const obs: ParsedStationObservation = {
        stationId: '42933',
        tmin: 15.0,
        tmaxPreviousDay: 30.0,
      };

      // Jan 1: Tmin uses pentad 01, Tmax uses pentad 00
      const enriched = enrichObservation(obs, '2026-01-01', provider);
      assert.equal(enriched.tmin, 15.0);
      assert.equal(enriched.tminDeparture, '+1.6'); // 15.0 - 13.4
      assert.equal(enriched.tmax, 30.0);
      assert.equal(enriched.tmaxDeparture, '---'); // Pentad 00 has no normal -> '---'
    });
  });

  describe('8. Compatibility with Daily Report Orchestrator Pipeline', () => {
    it('executes generateDailyReports end-to-end with the production normal provider', () => {
      const histProvider = new InMemoryHistoricalProvider(SAMPLE_HISTORICAL_OBSERVATIONS);

      const result = generateDailyReports(
        SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
        '2026-01-05',
        provider,
        histProvider
      );

      assert.equal(result.reportingDate, '2026-01-05');
      assert.equal(result.subdivisions.length, 4);
      assert.equal(result.enrichedObservations.length, 103);

      const vidarbha = result.subdivisions.find((s) => s.subdivision.id === '26');
      assert.ok(vidarbha);

      // Station 42933 (Akola): Tmin 22.6, normal 13.4 -> departure +9.2
      const akola = vidarbha.report1Rows.find((r) => r.stationId === '42933');
      assert.ok(akola);
      assert.equal(akola.tmin, 22.6);
      assert.equal(akola.tminDeparture, '+9.2');

      // Station 42947 (Yeotmal): missing in master dataset -> departure is '---'
      const yeotmal = vidarbha.report1Rows.find((r) => r.stationId === '42947');
      assert.ok(yeotmal);
      assert.equal(yeotmal.tmin, 24.2);
      assert.equal(yeotmal.tminDeparture, '---');

      // Station 42937 (Nagpur): Tmin 22.0, normal 13.9 -> departure +8.1
      const nagpur = vidarbha.report1Rows.find((r) => r.stationId === '42937');
      assert.ok(nagpur);
      assert.equal(nagpur.tmin, 22.0);
      assert.equal(nagpur.tminDeparture, '+8.1');

      // Report 2 summary exists and has calculated values
      const summary = vidarbha.report2Summary;
      assert.ok(summary);
      assert.equal(summary.subdivisionName, 'Vidarbha');
      assert.ok(summary.lowestTmin.value !== null);
      assert.ok(summary.highestTmax.value !== null);
    });
  });
});
