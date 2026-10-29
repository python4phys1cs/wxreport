/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDailyReports,
  ALL_SUBDIVISION_IDS,
  type HistoricalObservation,
  type HistoricalObservationProvider,
  type OperationalReportsResult,
} from './reportOrchestrator.ts';
import { InMemoryObservationStore } from './observationStore.ts';
import type { PentadNormal, PentadNormalProvider } from './climatology.ts';
import {
  SUBDIVISIONS,
  CANONICAL_STATIONS,
  getStationsBySubdivision,
} from '../constants/stationRegistry.ts';

/**
 * Synthetic In-Memory Pentad Normal Provider for testing.
 */
class TestPentadNormalProvider implements PentadNormalProvider {
  private data = new Map<string, PentadNormal>();

  constructor(normals: PentadNormal[] = []) {
    for (const n of normals) {
      this.data.set(`${n.station}_${n.pentad}`, n);
    }
  }

  getNormal(stationId: string, pentad: string): PentadNormal | null {
    return this.data.get(`${stationId}_${pentad}`) ?? null;
  }
}

/**
 * Synthetic In-Memory Historical Observation Provider for testing.
 */
class TestHistoricalProvider implements HistoricalObservationProvider {
  private data = new Map<string, HistoricalObservation>();

  constructor(observations: HistoricalObservation[] = []) {
    for (const obs of observations) {
      this.data.set(`${obs.stationId}_${obs.date}`, obs);
    }
  }

  getObservation(stationId: string, date: string): HistoricalObservation | null {
    return this.data.get(`${stationId}_${date}`) ?? null;
  }
}

describe('Report Data Orchestrator Suite', () => {

  const sampleBulletin10Stations = `AAXX 01034
42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=
42937 32596 20203 10280 20216 40138 82500 333 20220 58016 555 10000=
42865 32596 53601 10260 20246 39940 40050 333 10330 20210 59002 555 11431=
42931 32996 22302 10252 20189 40149 82010 333 20225 58007 555 10738=
42946 32996 00000 10288 20239 40132 333 20246 58004 555 10000=
43029 31595 13202 10298 20231 40137 70500 81500 333 20242 58006 81620 555 10924= 
42947 32595 21402 10284 20213 4//// 82100 333 20242 58/// 555 10000=
42871 31995 22002 10266 20234 39801 40146 70500 82030 333 10330 20210 58008 82360 555 11298=
42867 31996 03201 20284 20220 40149 70500 333 20221 58006 555 10000=
42939 32995 00000 10280 20237 40155 70522 333 20228 58011 555 10000=
42935 32996 03202 10240 20178 39423 40056 333 20190 59000 555 10605=
42943 32995 40902 10242 20213 40060 333 20198 58007 555 1////=
42874 32996 00000 10268 20239 40142 333 20249 58007 555 11382=
42872 31996 00000 10276 20244 40140 70500 333 20234 58014 555 11360=
42782 32996 00000 10272 20234 40139 333 20236 58011 555 10000=
42693 31995 30000 10242 20225 39479 40157 70510 83030 333 20194 58010 83360 555 10000=
42779 32996 00000 10248 20213 39447 40138 333 20182 58008 555 10000=
43041 31995 00000 10268 20228 39533 40143 71040 333 20221 58008 555 10000=
42876 32995 03202 10268 20232 4//// 333 20220 58/// 555 11300=
42763 32996 0//// 10250 20226 39802 40144 333 20236 58005 555 10000=
42767 32996 00501 10180 20177 38943 48542 333 20170 58004 555 10000=
42675 31996 02701 10266 20212 40136 70500 333 20225 58010 555 10000=
42574 31996 02308 10266 20228 40123 70500 333 20220 58005 555 11269=
42768 32996 00000 10230 20200 40155 333 20190 58007 555 10000=
42567 31596 42506 10280 20243 40124 70500 84100 333 20230 58005 84825 555 00000 10000=
42571 32996 02701 10272 20228 40126 333 20232 58004 555 10000=
42577 32996 00000 10250 20217 40116 333 20222 58020 555 10000=
42460 32996 02302 10266 20215 40122 333 20233 58007 555 10000=
42776 32996 00000 10248 20224 40140 333 20224 58013 555 10000=
42559 32996 00000 10242 20202 40133 333 20212 58011 555 10000=
42557 32996 00000 10240 20203 40143 333 20210 58011 555 10000=
42661 32996 00000 10222 20172 39586 40135 333 20202 58000 555 10000=
42662 32996 00000 10246 20206 40148 333 20193 58011 555 10000=
42671 31996 00000 10250 20206 39525 40138 70500 333 20212 58011 555 10000=
42672 32996 00000 10234 20219 40120 333 20205 58008 555 10000=
42467 32996 40000 10270 20223 40118 82230 333 20230 58003 555 10000=
42674 32597 22701 10258 20219 40124 333 20222 58009 555 10000=
42860 32997 03601 10218 20197 39404 40133 333 20197 58009 555 10000=
42715 32995 00000 10244 20225 39502 40147 333 10300 20205 58006 555 10000=
42679 32997 21403 10250 20221 40139 80001 333 10320 20213 58010 555 10000=
42361 31996 00000 10262 20223 40129 70500 333 20233 58009 555 10000=
42754 32996 03204 10250 20190 39522 40153 333 20177 58009 555 10000=
42752 32996 00000 10230 20199 39513 40165 333 20175 58010 555 10000=
42849 32996 03201 10228 20160 40082 333 20192 59006 555 10000=
42855 32996 0//// 10254 20163 4//// 333 20204 5//// 555 10000=
42770 22596 00000 10254 20208 40/// 82200 333 10302 20222 58/// 6002/ 555 00020 10002=
42771 32996 22701 10254 20224 40143 80002 333 10308 20224 58007 555 10000=
42667 31996 02904 10258 20214 39567 40149 70500 333 20196 58011 555 10000=
42562 32996 00000 10264 20213 4//// 333 10335 20248 58/// 555 10000=
42456 32996 03201 10260 20218 40141 8//// 333 10334 20220 58016 555 10000=
42459 32996 02301 10260 20232 40079 333 10312 20230 58000 555 10000=
42933 32996 00000 10262 20201 40147 333 20226 58009 555 10000=
42937 32596 20203 10280 20216 40138 82500 333 20220 58016 555 10000=
42865 32596 53601 10260 20246 39940 40050 333 10330 20210 59002 555 1////=
42931 32996 22302 10252 20189 40149 82010 333 20225 58007 555 10000=
42946 32996 00000 10288 20239 40132 333 20246 58004 555 10000=
43029 31595 13202 10298 20231 40137 70500 81500 333 20242 58006 81620 555 10000= 
42947 32595 21402 10284 20213 4//// 82100 333 20242 58/// 555 10000=
42871 31995 22002 10266 20234 39801 40146 70500 82030 333 10330 20210 58008 82360 555 10000=
42867 31996 03201 20284 20220 40149 70500 333 20221 58006 555 10000=
42939 32995 00000 10280 20237 40155 70522 333 20228 58011 555 10000=
42935 32996 03202 10240 20178 39423 40056 333 20190 59000 555 10000=
42943 32995 40902 10242 20213 40060 333 20198 58007 555 1////=
42874 32996 00000 10268 20239 40142 333 20249 58007 555 10000=
42872 31996 00000 10276 20244 40140 70500 333 20234 58014 555 10000=
42782 32996 00000 10272 20234 40139 333 20236 58011 555 10000=
42693 31995 30000 10242 20225 39479 40157 70510 83030 333 20194 58010 83360 555 10000=
42779 32996 00000 10248 20213 39447 40138 333 20182 58008 555 10000=
43041 31995 00000 10268 20228 39533 40143 71040 333 20221 58008 555 10000=
42876 32995 03202 10268 20232 4//// 333 20220 58/// 555 10000=
42948 32996 ///// 10275 20230 40131 333 20245 58015 555 10000=
42763 32996 0//// 10250 20226 39802 40144 333 20236 58005 555 10000=
42767 32996 00501 10180 20177 38943 48542 333 20170 58004 555 10000=
42675 31996 02701 10266 20212 40136 70500 333 20225 58010 555 10000=
42574 31996 02308 10266 20228 40123 70500 333 20220 58005 555 10000=
42768 32996 00000 10230 20200 40155 333 20190 58007 555 10000=
42567 31596 42506 10280 20243 40124 70500 84100 333 20230 58005 84825 555 00000 10000=
42571 32996 02701 10272 20228 40126 333 20232 58004 555 10000=
42577 32996 00000 10250 20217 40116 333 20222 58020 555 10000=
42460 32996 02302 10266 20215 40122 333 20233 58007 555 10000=
42776 32996 00000 10248 20224 40140 333 20224 58013 555 10000=
42559 32996 00000 10242 20202 40133 333 20212 58011 555 10000=
42557 32996 00000 10240 20203 40143 333 20210 58011 555 10000=
42661 32996 00000 10222 20172 39586 40135 333 20202 58000 555 10000=
42662 32996 00000 10246 20206 40148 333 20193 58011 555 10000=
42671 31996 00000 10250 20206 39525 40138 70500 333 20212 58011 555 10000=
42672 32996 00000 10234 20219 40120 333 20205 58008 555 10000=
42467 32996 40000 10270 20223 40118 82230 333 20230 58003 555 10000=
42674 32597 22701 10258 20219 40124 333 20222 58009 555 10000=
42860 32997 03601 10218 20197 39404 40133 333 20197 58009 555 10000=
42715 32995 00000 10244 20225 39502 40147 333 10300 20205 58006 555 10000=
42679 32997 21403 10250 20221 40139 80001 333 10320 20213 58010 555 10000=
42361 31996 00000 10262 20223 40129 70500 333 20233 58009 555 10000=
42754 32996 03204 10250 20190 39522 40153 333 20177 58009 555 10000=
42752 32996 00000 10230 20199 39513 40165 333 20175 58010 555 10000=
42849 32996 03201 10228 20160 40082 333 20192 59006 555 10000=
42855 32996 0//// 10254 20163 4//// 333 20204 5//// 555 10000=
42770 22596 00000 10254 20208 40/// 82200 333 10302 20222 58/// 6002/ 555 00020 10002=
42771 32996 22701 10254 20224 40143 80002 333 10308 20224 58007 555 10000=
42667 31996 02904 10258 20214 39567 40149 70500 333 20196 58011 555 10000=
42562 32996 00000 10264 20213 4//// 333 10335 20248 58/// 555 10000=
42456 32996 03201 10260 20218 40141 8//// 333 10334 20220 58016 555 10000=
42459 32996 02301 10260 20232 40079 333 10312 20230 58000 555 10000=`;

  it('1. decodes single station telegram and constructs Report 1 row and Report 2 summary', () => {
    const singleRaw = '42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=';
    const normalProvider = new TestPentadNormalProvider([
      { station: '42937', pentad: '01', tmin: 21.0, tmax: 33.0 },
    ]);

    const result = generateDailyReports(singleRaw, '2026-01-05', normalProvider, undefined, {
      subdivisionIds: ['26'], // Vidarbha
    });

    assert.equal(result.reportingDate, '2026-01-05');
    assert.equal(result.eveningDate, '2026-01-04');
    assert.equal(result.subdivisions.length, 1);

    const vidarbha = result.subdivisions[0];
    assert.equal(vidarbha.subdivision.name, 'Vidarbha');
    assert.equal(vidarbha.report1Rows.length, 12); // All 12 Vidarbha stations

    // Station 42937 (Amravati) row check
    const amravatiRow = vidarbha.report1Rows.find((r) => r.stationId === '42937')!;
    assert.ok(amravatiRow);
    assert.equal(amravatiRow.stationName, 'Amravati');
    assert.equal(amravatiRow.tmin, 25.7);
    assert.equal(amravatiRow.tminDeparture, '+4.7'); // 25.7 - 21.0
    assert.equal(amravatiRow.rainfall, 0.0);
    assert.equal(amravatiRow.visibilityText, '04-10 km'); // code 96
  });

  it('2. correctly associates previous-day Tmax from Section 333 with D - 1', () => {
    // 42871 reports Tmax 39.6 and Tmin 26.2
    const raw = '42871 31996 23201 10330 20194 39737 40074 70500 82030 333 10396 20262 59001 82360 555 10021=';
    const normalProvider = new TestPentadNormalProvider([
      // Jan 5: Tmin uses Pentad 01, Tmax uses Pentad 01
      { station: '42871', pentad: '01', tmin: 20.0, tmax: 36.0 },
    ]);

    const result = generateDailyReports(raw, '2026-01-05', normalProvider, undefined, {
      subdivisionIds: ['26'],
    });

    const gondiaRow = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42871')!;
    assert.equal(gondiaRow.tmax, 39.6);
    assert.equal(gondiaRow.tmaxDeparture, '+3.6'); // 39.6 - 36.0
    assert.equal(gondiaRow.tmin, 26.2);
    assert.equal(gondiaRow.tminDeparture, '+6.2'); // 26.2 - 20.0
  });

  it('3. performs 24-hour comparisons when historical baseline is provided', () => {
    const raw = '42937 32596 22503 10326 20200 40059 82500 333 10380 20250 59010 555 10000=';
    const normalProvider = new TestPentadNormalProvider();

    // Reporting date: 2026-05-10
    // Evening date (De1): 2026-05-09
    // Prior Tmin date (Dm2): 2026-05-09
    // Prior Tmax date (De2): 2026-05-08
    const histProvider = new TestHistoricalProvider([
      { stationId: '42937', date: '2026-05-09', tmin: 23.0 }, // Prior morning Tmin
      { stationId: '42937', date: '2026-05-08', tmax: 36.0 }, // Prior evening Tmax
    ]);

    const result = generateDailyReports(raw, '2026-05-10', normalProvider, histProvider, {
      subdivisionIds: ['26'],
    });

    const nagpurRow = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
    assert.equal(nagpurRow.tmin, 25.0);
    assert.equal(nagpurRow.tmin24hChange, 2.0); // 25.0 - 23.0 = +2.0

    assert.equal(nagpurRow.tmax, 38.0);
    assert.equal(nagpurRow.tmax24hChange, 2.0); // 38.0 - 36.0 = +2.0
  });

  it('4. leaves 24-hour changes null when historical baseline is missing', () => {
    const raw = '42937 32596 22503 10326 20200 40059 82500 333 10380 20250 59010 555 10000=';
    const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider(), undefined, {
      subdivisionIds: ['26'],
    });

    const nagpurRow = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
    assert.equal(nagpurRow.tmin24hChange, null);
    assert.equal(nagpurRow.tmax24hChange, null);
  });

  it('5. degrades cleanly to "---" when pentad normals are unavailable', () => {
    const raw = '42937 32596 22503 10326 20200 40059 82500 333 10380 20250 59010 555 10000=';
    const emptyNormalProvider = new TestPentadNormalProvider(); // No normals in DB

    const result = generateDailyReports(raw, '2026-05-10', emptyNormalProvider, undefined, {
      subdivisionIds: ['26'],
    });

    const nagpurRow = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
    assert.equal(nagpurRow.tminDeparture, '---');
    assert.equal(nagpurRow.tmaxDeparture, '---');
  });

  it('6. handles unknown/unrecognized station IDs without crashing', () => {
    // 99999 is not in the canonical registry
    const raw = '99999 32596 22503 10326 20200 40059 82500 333 20250 555 10000=';
    const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider());

    assert.ok(result.unrecognizedStationIds.includes('99999'));
    assert.equal(result.enrichedObservations.length, 1);
  });

  it('7. preserves raw SYNOP string on enriched observation for auditability', () => {
    const raw = '42937 32596 22503 10326 20200 40059 82500 333 20250 555 10000=';
    const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider());
    assert.equal(result.enrichedObservations[0].rawSynop, '42937 32596 22503 10326 20200 40059 82500 333 20250 555 10000');
  });

  it('8. groups stations across multiple subdivisions preserving canonical report order', () => {
    // Contains Vidarbha (42937) and Chattisgarh (42874)
    const multiRaw = `42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=
42874 32596 22503 10310 20210 40060 82500 333 20240 59010 555 10000=`;

    const result = generateDailyReports(multiRaw, '2026-05-10', new TestPentadNormalProvider(), undefined, {
      subdivisionIds: ['26', '27'],
    });

    assert.equal(result.subdivisions.length, 2);
    assert.equal(result.subdivisions[0].subdivision.id, '26'); // Vidarbha
    assert.equal(result.subdivisions[1].subdivision.id, '27'); // Chattisgarh

    const vidarbha = result.subdivisions[0];
    assert.equal(vidarbha.report1Rows[0].stationId, '42933'); // Canonical 1st: Akola
    assert.equal(vidarbha.report1Rows[1].stationId, '42937'); // Canonical 2nd: Nagpur

    const cht = result.subdivisions[1];
    assert.equal(cht.report1Rows[0].stationId, '42693'); // Ambikapur
  });

  it('9. end-to-end integration test with real 10-station operational bulletin', () => {
    const normalProvider = new TestPentadNormalProvider([
      { station: '42937', pentad: '01', tmin: 21.0, tmax: 33.0 },
      { station: '42865', pentad: '01', tmin: 20.0, tmax: 35.0 },
      { station: '42871', pentad: '01', tmin: 19.5, tmax: 36.0 },
      { station: '43029', pentad: '01', tmin: 22.0, tmax: 34.0 },
    ]);

    const result = generateDailyReports(
      sampleBulletin10Stations,
      '2026-01-05',
      normalProvider,
      undefined,
      { subdivisionIds: ['26'] }
    );

    assert.equal(result.reportingDate, '2026-01-05');
    assert.equal(result.eveningDate, '2026-01-04');
    assert.equal(result.subdivisions.length, 1);

    const vidSummary = result.subdivisions[0].report2Summary;
    assert.equal(vidSummary.subdivisionName, 'Vidarbha');

    // Lowest Tmin: 19 at Washim (42935)
    assert.equal(vidSummary.lowestTmin.value, 19);
    assert.equal(vidSummary.lowestTmin.stationNames, 'Washim');

    // Highest Tmax: 33 at Bhandara and Gondia (42865 & 42871)
    assert.equal(vidSummary.highestTmax.value, 33);
    assert.equal(vidSummary.highestTmax.stationNames, 'Bhandara, Gondia');

    // Heaviest Rainfall: 0 mm across reporting stations
    assert.equal(vidSummary.heaviestRainfall.value, 0);

    // Cold Wave season active in January
    assert.equal(vidSummary.isColdWaveSeason, true);
    assert.equal(vidSummary.isHeatWaveSeason, false);
  });

  describe('10. Calendar Date Boundary Audits (Year & Month Transitions)', () => {
    it('handles Year Boundary (Dec 31 -> Jan 1 transition)', () => {
      // 03 UTC observation on Jan 1, 2026:
      // Tmin is for 2026-01-01 (Pentad 01)
      // Tmax is for 2025-12-31 (Pentad 00 in legacy PHP)
      // Prior Tmin comparison is for 2025-12-31
      // Prior Tmax comparison is for 2025-12-30
      const raw = '42937 32596 22503 10300 20180 40059 82500 333 10320 20180 555 10000=';
      const normalProvider = new TestPentadNormalProvider([
        { station: '42937', pentad: '01', tmin: 15.0, tmax: 28.0 },
      ]);
      const histProvider = new TestHistoricalProvider([
        { stationId: '42937', date: '2025-12-31', tmin: 16.0 }, // Prior morning Tmin
        { stationId: '42937', date: '2025-12-30', tmax: 30.0 }, // Prior evening Tmax
      ]);

      const result = generateDailyReports(raw, '2026-01-01', normalProvider, histProvider, {
        subdivisionIds: ['26'],
      });

      assert.equal(result.reportingDate, '2026-01-01');
      assert.equal(result.eveningDate, '2025-12-31');

      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tmin, 18.0);
      assert.equal(nagpur.tminDeparture, '+3.0'); // 18.0 - 15.0
      assert.equal(nagpur.tmin24hChange, 2.0); // 18.0 - 16.0 = +2.0

      assert.equal(nagpur.tmax, 32.0);
      // Jan 1 resolves Tmax to Pentad 00 which has no normal in DB -> degrades to "---"
      assert.equal(nagpur.tmaxDeparture, '---');
      assert.equal(nagpur.tmax24hChange, 2.0); // 32.0 - 30.0 = +2.0
    });

    it('handles February 28 -> March 1 transition in non-leap year (2023)', () => {
      // On March 1, 2023:
      // Morning date D = 2023-03-01
      // Evening date De1 = 2023-02-28
      // Prior evening date De2 = 2023-02-27
      const raw = '42937 32596 22503 10320 20200 40059 82500 333 10340 20200 555 10000=';
      const normalProvider = new TestPentadNormalProvider([
        // March 1 in non-leap year: Tmin uses Pentad 12, Tmax uses Pentad 12
        { station: '42937', pentad: '12', tmin: 18.0, tmax: 33.0 },
      ]);
      const histProvider = new TestHistoricalProvider([
        { stationId: '42937', date: '2023-02-28', tmin: 19.0 },
        { stationId: '42937', date: '2023-02-27', tmax: 35.0 },
      ]);

      const result = generateDailyReports(raw, '2023-03-01', normalProvider, histProvider, {
        subdivisionIds: ['26'],
      });

      assert.equal(result.reportingDate, '2023-03-01');
      assert.equal(result.eveningDate, '2023-02-28');

      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tmin, 20.0);
      assert.equal(nagpur.tminDeparture, '+2.0'); // 20.0 - 18.0
      assert.equal(nagpur.tmin24hChange, 1.0); // 20.0 - 19.0

      assert.equal(nagpur.tmax, 34.0);
      assert.equal(nagpur.tmaxDeparture, '+1.0'); // 34.0 - 33.0
      assert.equal(nagpur.tmax24hChange, -1.0); // 34.0 - 35.0
    });

    it('handles February 28 -> February 29 transition in leap year (2024)', () => {
      // On Feb 29, 2024:
      // Morning date D = 2024-02-29
      // Evening date De1 = 2024-02-28
      const raw = '42937 32596 22503 10320 20200 40059 82500 333 10340 20200 555 10000=';
      const normalProvider = new TestPentadNormalProvider([
        { station: '42937', pentad: '12', tmin: 18.0, tmax: 33.0 },
      ]);
      const histProvider = new TestHistoricalProvider([
        { stationId: '42937', date: '2024-02-28', tmin: 19.5 },
        { stationId: '42937', date: '2024-02-27', tmax: 33.5 },
      ]);

      const result = generateDailyReports(raw, '2024-02-29', normalProvider, histProvider, {
        subdivisionIds: ['26'],
      });

      assert.equal(result.reportingDate, '2024-02-29');
      assert.equal(result.eveningDate, '2024-02-28');

      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tmin24hChange, 0.5); // 20.0 - 19.5
      assert.equal(nagpur.tmax24hChange, 0.5); // 34.0 - 33.5
    });

    it('handles February 29 -> March 1 transition in leap year (2024)', () => {
      // On March 1, 2024 (Leap year):
      // Morning date D = 2024-03-01
      // Evening date De1 = 2024-02-29
      const raw = '42937 32596 22503 10320 20200 40059 82500 333 10340 20200 555 10000=';
      const normalProvider = new TestPentadNormalProvider([
        // March 1 in leap year advances to Pentad 13
        { station: '42937', pentad: '13', tmin: 19.0, tmax: 34.0 },
      ]);
      const histProvider = new TestHistoricalProvider([
        { stationId: '42937', date: '2024-02-29', tmin: 18.0 },
        { stationId: '42937', date: '2024-02-28', tmax: 32.0 },
      ]);

      const result = generateDailyReports(raw, '2024-03-01', normalProvider, histProvider, {
        subdivisionIds: ['26'],
      });

      assert.equal(result.reportingDate, '2024-03-01');
      assert.equal(result.eveningDate, '2024-02-29');

      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tminDeparture, '+1.0'); // 20.0 - 19.0 (pentad 13)
      assert.equal(nagpur.tmin24hChange, 2.0); // 20.0 - 18.0

      assert.equal(nagpur.tmaxDeparture, '0'); // 34.0 - 34.0 (pentad 13)
      assert.equal(nagpur.tmax24hChange, 2.0); // 34.0 - 32.0
    });
  });

  describe('11. Provider Isolation & Determinism', () => {
    it('operates purely in-memory without DOM, localStorage, or network dependencies', () => {
      const raw = '42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10000=';
      const normalProvider = new TestPentadNormalProvider();

      const result1 = generateDailyReports(raw, '2026-05-10', normalProvider);
      const result2 = generateDailyReports(raw, '2026-05-10', normalProvider);

      // Verify complete determinism
      assert.deepEqual(result1, result2);
    });
  });

  describe('12. Historical Baseline Dual-Indexing & Evening RH Audit', () => {
    it('correctly extracts prior Tmax, prior Tmin, and evening RH from a single D-1 daily record', () => {
      // In legacy SQL, observations table stores 1 row per day with ob_dt_m = $dm2 (2026-05-09)
      // containing min = 24.2, tmax = 38.5, and rh12 = 45
      const raw = '42937 32596 22503 10330 20200 40059 82500 333 10395 20252 59010 555 10000=';
      const normalProvider = new TestPentadNormalProvider();
      const histProvider = new TestHistoricalProvider([
        {
          stationId: '42937',
          date: '2026-05-09', // Morning date D - 1
          tmin: 24.2,
          tmax: 38.5,
          rh1730: 45,
        },
      ]);

      const result = generateDailyReports(raw, '2026-05-10', normalProvider, histProvider, {
        subdivisionIds: ['26'],
      });

      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tmin, 25.2);
      assert.equal(nagpur.tmin24hChange, 1.0); // 25.2 - 24.2
      assert.equal(nagpur.tmax, 39.5);
      // Under Rule 3.A, 1730 IST RH must be null (---) when D1's 12Z observation is unavailable (Never substitute D0's evening RH)
      assert.equal(nagpur.rh1730, null);
    });

    it('correctly handles split-date baseline (Dm2 for Tmin, De2 for Tmax)', () => {
      const raw = '42937 32596 22503 10330 20200 40059 82500 333 10395 20252 59010 555 10000=';
      const histProvider = new TestHistoricalProvider([
        { stationId: '42937', date: '2026-05-09', tmin: 24.0 }, // Prior morning
        { stationId: '42937', date: '2026-05-08', tmax: 37.0 }, // Prior evening
      ]);

      const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider(), histProvider, {
        subdivisionIds: ['26'],
      });

      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tmin24hChange, 1.2); // 25.2 - 24.0
      assert.equal(nagpur.tmax24hChange, 2.5); // 39.5 - 37.0
    });
  });

  describe('13. Vidarbha Print Report Ordering Conformance', () => {
    it('orders Vidarbha stations by canonical print order when orderVariant is "print"', () => {
      const raw = '42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=';
      const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider(), undefined, {
        subdivisionIds: ['26'],
        orderVariant: 'print',
      });

      const rows = result.subdivisions[0].report1Rows;
      const stationIds = rows.map((r) => r.stationId);

      // Legacy print report order from orpfast_stations_for:
      // 42867 (Nagpur), 42939 (Wardha), 42946 (Brahmpuri), 42871 (Gondia), 43029 (Chandrapur),
      // 42947 (Gadchiroli), 42937 (Amravati), 42933 (Akola), 42943 (Yavatmal), 42931 (Buldana), 42935 (Washim)
      assert.deepEqual(stationIds, [
        '42867', '42939', '42946', '42871', '43029',
        '42947', '42937', '42933', '42943', '42931', '42935'
      ]);
      assert.equal(rows[0].stationName, 'Nagpur');
      assert.equal(rows[stationIds.indexOf('42937')].stationName, 'Amravati');
    });

    it('orders Vidarbha stations by default web order when orderVariant is "web"', () => {
      const raw = '42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=';
      const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider(), undefined, {
        subdivisionIds: ['26'],
        orderVariant: 'web',
      });

      const rows = result.subdivisions[0].report1Rows;
      assert.equal(rows[0].stationId, '42933'); // Akola
      assert.equal(rows[1].stationId, '42937'); // Amravati
      assert.equal(rows.length, 12); // Includes 42865 (Bhandara) in web view
    });
  });

  describe('14. Subdivision ID Flexibility & Filtering', () => {
    it('accepts numeric subdivision IDs [19, 26] and converts them to string matches', () => {
      const raw = '42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=';
      const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider(), undefined, {
        subdivisionIds: [19, 26],
      });

      assert.equal(result.subdivisions.length, 2);
      assert.equal(result.subdivisions[0].subdivision.id, '19');
      assert.equal(result.subdivisions[1].subdivision.id, '26');
    });
  });

  describe('15. Sparse / Missing Station Data Propagation & Subdivision Aggregation', () => {
    it('handles a subdivision where only 1 station reports without arithmetic errors', () => {
      // Only Amravati (42937) reports in Vidarbha (all other 11 stations missing)
      const raw = '42937 32596 22503 10326 20200 40059 82500 333 10380 20250 59010 555 10000=';
      const normalProvider = new TestPentadNormalProvider([
        { station: '42937', pentad: '01', tmin: 20.0, tmax: 35.0 },
      ]);
      const histProvider = new TestHistoricalProvider([
        { stationId: '42937', date: '2026-01-04', tmin: 24.0, tmax: 37.0 },
      ]);

      const result = generateDailyReports(raw, '2026-01-05', normalProvider, histProvider, {
        subdivisionIds: ['26'],
      });

      const vidarbha = result.subdivisions[0];
      assert.equal(vidarbha.report1Rows.length, 12);
      assert.equal(vidarbha.reportingStationsCount, 1);

      // Non-reporting station (e.g. Akola 42933) has null values
      const akola = vidarbha.report1Rows.find((r) => r.stationId === '42933')!;
      assert.equal(akola.tmin, null);
      assert.equal(akola.tmax, null);
      assert.equal(akola.tminDeparture, null);
      assert.equal(akola.tmaxDeparture, null);
      assert.equal(akola.rainfall, null);

      // Report 2 summary averages match the single reporting station exactly
      const summary = vidarbha.report2Summary;
      assert.equal(summary.tmin24hChangeAvg, 1.0); // 25.0 - 24.0
      assert.equal(summary.tminDepartureAvg, 5.0); // 25.0 - 20.0 = +5.0
      assert.equal(summary.tmax24hChangeAvg, 1.0); // 38.0 - 37.0
      assert.equal(summary.tmaxDepartureAvg, 3.0); // 38.0 - 35.0 = +3.0
      assert.equal(summary.lowestTmin.value, 25.0);
      assert.equal(summary.lowestTmin.stationNames, 'Amravati');
      assert.equal(summary.highestTmax.value, 38.0);
      assert.equal(summary.highestTmax.stationNames, 'Amravati');
      assert.equal(summary.heaviestRainfall.value, 0.0);
      assert.equal(summary.rainfallPercent, 0);
      assert.equal(summary.rainfallDistributionClass, 'DRY');
    });

    it('handles a subdivision where 0 stations report (all null)', () => {
      // Empty bulletin
      const result = generateDailyReports('', '2026-01-05', new TestPentadNormalProvider(), undefined, {
        subdivisionIds: ['26'],
      });

      const vidarbha = result.subdivisions[0];
      assert.equal(vidarbha.reportingStationsCount, 0);

      const summary = vidarbha.report2Summary;
      assert.equal(summary.tmin24hChangeAvg, null);
      assert.equal(summary.tmin24hChangeClass, 'N/A');
      assert.equal(summary.tmax24hChangeAvg, null);
      assert.equal(summary.tmax24hChangeClass, 'N/A');
      assert.equal(summary.lowestTmin.value, null);
      assert.equal(summary.lowestTmin.formattedText, '---');
      assert.equal(summary.highestTmax.value, null);
      assert.equal(summary.highestTmax.formattedText, '---');
      assert.equal(summary.heaviestRainfall.value, null);
      assert.equal(summary.heaviestRainfall.formattedText, '---');
      assert.equal(summary.rainfallPercent, 0);
      assert.equal(summary.rainfallDistributionClass, 'DRY');
    });
  });

  describe('16. Duplicate / Amended Telegrams & Unrecognized Station ID Deduplication', () => {
    it('takes latest telegram for duplicate station and deduplicates unrecognized station IDs', () => {
      // Station 42937 sent twice (first with Tmin=20.0, second amended with Tmin=22.5)
      // Unrecognized station 99999 sent twice
      const raw = `AAXX 01034
42937 32596 22503 10326 20200 40059 82500 333 20200 555 10000=
99999 32596 22503 10300 20180 40059 82500 333 20200 555 10000=
42937 32596 22503 10326 20200 40059 82500 333 20225 555 10000=
99999 32596 22503 10300 20180 40059 82500 333 20210 555 10000=`;

      const result = generateDailyReports(raw, '2026-05-10', new TestPentadNormalProvider(), undefined, {
        subdivisionIds: ['26'],
      });

      // Nagpur should reflect the amended Tmin of 22.5
      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tmin, 22.5);

      // 99999 appears only ONCE in unrecognizedStationIds
      assert.deepEqual(result.unrecognizedStationIds, ['99999']);
    });
  });

  describe('17. Full 4-Subdivision Operational Report Verification', () => {
    it('processes all 4 operational subdivisions and constructs complete report package', () => {
      const normalProvider = new TestPentadNormalProvider([
        { station: '42937', pentad: '01', tmin: 21.0, tmax: 33.0 },
        { station: '42865', pentad: '01', tmin: 20.0, tmax: 35.0 },
        { station: '42871', pentad: '01', tmin: 19.5, tmax: 36.0 },
        { station: '43029', pentad: '01', tmin: 22.0, tmax: 34.0 },
      ]);

      const result = generateDailyReports(
        sampleBulletin10Stations,
        '2026-01-05',
        normalProvider
      );

      // Verifies 4 default subdivisions
      assert.equal(result.subdivisions.length, 4);
      const subNames = result.subdivisions.map((s) => s.subdivision.name);
      assert.deepEqual(subNames, [
        'West Madhya Pradesh',
        'East Madhya Pradesh',
        'Vidarbha',
        'Chattisgarh',
      ]);

      // West MP (19): 20 stations registered (18 active + 2 disabled: Bhind, Ashoknagar)
      assert.equal(result.subdivisions[0].report1Rows.length, 20);
      // East MP (20): 15 stations
      assert.equal(result.subdivisions[1].report1Rows.length, 15);
      // Vidarbha (26): 12 stations
      assert.equal(result.subdivisions[2].report1Rows.length, 12);
      // Chattisgarh (27): 8 stations
      assert.equal(result.subdivisions[3].report1Rows.length, 8);
    });
  });

  describe('18. Complete 7-Subdivision Operational Report Coverage & Canonical Audit', () => {
    it('audits all 7 subdivisions and all 79 canonical stations in the registry', () => {
      assert.equal(SUBDIVISIONS.length, 7);
      assert.equal(CANONICAL_STATIONS.length, 79);

      const expectedCounts: Record<string, number> = {
        '19': 20, // West Madhya Pradesh (18 active + 2 disabled)
        '20': 15, // East Madhya Pradesh
        '26': 12, // Vidarbha (web view)
        '27': 8,  // Chattisgarh
        '25': 6,  // Marathwada
        '24': 11, // Madhya Maharashtra
        '23': 7,  // Konkan & Goa
      };

      for (const [subId, expected] of Object.entries(expectedCounts)) {
        const stations = getStationsBySubdivision(subId, 'web');
        assert.equal(stations.length, expected, `Subdivision ${subId} station count mismatch`);
      }
    });

    it('processes all 7 meteorological subdivisions in a single operational run', () => {
      // Create a multi-station bulletin containing 1 station from each of the 7 subdivisions:
      // Sub 19 (West MP): 42667 Bhopal
      // Sub 20 (East MP): 42675 Jabalpur
      // Sub 26 (Vidarbha): 42867 Nagpur
      // Sub 27 (Chattisgarh): 42874 Raipur
      // Sub 25 (Marathwada): 43014 Aurangabad
      // Sub 24 (Madhya Maharashtra): 43009 Pune
      // Sub 23 (Konkan & Goa): 43057 Mumbai (Santacruz)
      const bulletin7Subs = `
        42667 32596 22503 10320 20190 40060 333 10380 20240 555 10000=
        42675 32596 22503 10330 20180 40065 333 10390 20230 555 10000=
        42867 32596 22503 10326 20200 40059 333 10396 20257 555 10036=
        42874 22596 22503 10340 20210 40055 333 10400 20260 555 00050 10000=
        43014 32596 22503 10310 20170 40070 333 10370 20220 555 10000=
        43009 32596 22503 10300 20160 40080 333 10360 20210 555 10000=
        43057 22596 22503 10335 20240 40050 333 10350 20270 555 00120 10000=
      `;

      const normalProvider = new TestPentadNormalProvider([
        { station: '42667', pentad: '01', tmin: 20.0, tmax: 34.0 },
        { station: '42675', pentad: '01', tmin: 19.0, tmax: 35.0 },
        { station: '42867', pentad: '01', tmin: 21.0, tmax: 33.0 },
        { station: '42874', pentad: '01', tmin: 22.0, tmax: 36.0 },
        { station: '43014', pentad: '01', tmin: 18.0, tmax: 33.0 },
        { station: '43009', pentad: '01', tmin: 17.0, tmax: 32.0 },
        { station: '43057', pentad: '01', tmin: 23.0, tmax: 31.0 },
      ]);

      const histProvider = new TestHistoricalProvider([
        // Evening RH values from D - 1 baseline
        { stationId: '42667', date: '2026-01-04', rh1730: 42, tmin: 23.0, tmax: 37.0 },
        { stationId: '42675', date: '2026-01-04', rh1730: 38, tmin: 22.0, tmax: 38.0 },
        { stationId: '42867', date: '2026-01-04', rh1730: 45, tmin: 24.5, tmax: 38.0 },
        { stationId: '42874', date: '2026-01-04', rh1730: 50, tmin: 25.0, tmax: 39.0 },
        { stationId: '43014', date: '2026-01-04', rh1730: 35, tmin: 21.0, tmax: 36.0 },
        { stationId: '43009', date: '2026-01-04', rh1730: 40, tmin: 20.0, tmax: 35.0 },
        { stationId: '43057', date: '2026-01-04', rh1730: 65, tmin: 26.0, tmax: 34.0 },
      ]);

      const result = generateDailyReports(
        bulletin7Subs,
        '2026-01-05',
        normalProvider,
        histProvider,
        { subdivisionIds: ALL_SUBDIVISION_IDS }
      );

      assert.equal(result.subdivisions.length, 7);

      const subIds = result.subdivisions.map((s) => s.subdivision.id);
      assert.deepEqual(subIds, ['19', '20', '26', '27', '25', '24', '23']);

      // 1. West MP (19): Bhopal
      const wmp = result.subdivisions[0];
      assert.equal(wmp.subdivision.name, 'West Madhya Pradesh');
      assert.equal(wmp.report2Summary.highestTmax.value, 38.0);
      assert.equal(wmp.report2Summary.highestTmax.stationNames, 'Bhopal');

      // 2. East MP (20): Jabalpur
      const emp = result.subdivisions[1];
      assert.equal(emp.subdivision.name, 'East Madhya Pradesh');
      assert.equal(emp.report2Summary.lowestTmin.value, 23.0);
      assert.equal(emp.report2Summary.lowestTmin.stationNames, 'Jabalpur');

      // 3. Vidarbha (26): Nagpur
      const vid = result.subdivisions[2];
      assert.equal(vid.subdivision.name, 'Vidarbha');
      assert.equal(vid.report2Summary.highestTmax.value, 39.6);
      assert.equal(vid.report2Summary.highestTmax.stationNames, 'Nagpur');

      // 4. Chattisgarh (27): Raipur (5.0 mm rain)
      const cht = result.subdivisions[3];
      assert.equal(cht.subdivision.name, 'Chattisgarh');
      assert.equal(cht.report2Summary.heaviestRainfall.value, 5.0);
      assert.equal(cht.report2Summary.heaviestRainfall.stationNames, 'Raipur');
      assert.equal(cht.report2Summary.rainfallDistributionClass, 'WS'); // 1/1 reporting stations has rain = 100%

      // 5. Marathwada (25): Aurangabad
      const mar = result.subdivisions[4];
      assert.equal(mar.subdivision.name, 'Marathwada');
      assert.equal(mar.report2Summary.lowestTmin.value, 22.0);

      // 6. Madhya Maharashtra (24): Pune
      const mmh = result.subdivisions[5];
      assert.equal(mmh.subdivision.name, 'Madhya Maharashtra');
      assert.equal(mmh.report2Summary.lowestTmin.value, 21.0);

      // 7. Konkan & Goa (23): Mumbai (Santacruz) (12.0 mm rain)
      const kng = result.subdivisions[6];
      assert.equal(kng.subdivision.name, 'Konkan & Goa');
      assert.equal(kng.report2Summary.highestTmax.value, 35.0);
      assert.equal(kng.report2Summary.heaviestRainfall.value, 12.0);
      assert.equal(kng.report2Summary.heaviestRainfall.stationNames, 'Mumbai (Santacruz)');
    });

    it('verifies exact negative half-boundary 24h change classification in orchestrator pipeline', () => {
      // Station with current Tmin = 20.0, prior Tmin = 22.05 -> diff = -2.05
      // With PHP round(-2.05, 1) = -2.1, change is -2.1 and class is 'AF' (Appreciable Fall)
      const raw = '42937 32596 22503 10326 20200 40059 82500 333 20200 555 10000=';
      const histProvider = new TestHistoricalProvider([
        { stationId: '42937', date: '2026-01-04', tmin: 22.05 },
      ]);

      const result = generateDailyReports(raw, '2026-01-05', new TestPentadNormalProvider(), histProvider, {
        subdivisionIds: ['26'],
      });

      const nagpur = result.subdivisions[0].report1Rows.find((r) => r.stationId === '42937')!;
      assert.equal(nagpur.tmin24hChange, -2.1);

      const summary = result.subdivisions[0].report2Summary;
      assert.equal(summary.tmin24hChangeAvg, -2.1);
      assert.equal(summary.tmin24hChangeClass, 'AF'); // Appreciable Fall (-4.0 to -2.1)
    });
  });

  describe('12Z Cumulative Rainfall (6RRR/) in Consolidated & Subdivision Reports', () => {
    it('populates 1730 IST rainfall in Consolidated & Subdivision reports from group 6RRR/ since 03Z', () => {
      const store = new InMemoryObservationStore();
      const reportingDate = '2026-07-15';

      // 1. Ingest 03Z observation (morning): Nagpur (42867) has 12.0 mm 24h rainfall up to 0830 IST
      const raw03Z = 'AAXX 15034\n42867 21996 00701 10326 20214 40082 333 20244 555 00120 10048=';
      store.ingestBulletin('03Z', raw03Z, reportingDate);

      // Verify 03Z report
      const res03Z = generateDailyReports('', reportingDate, new TestPentadNormalProvider(), new TestHistoricalProvider(), {
        utcSlot: '03Z',
        observationStore: store,
        subdivisionIds: ['26'],
      });
      const vidarbha03Z = res03Z.subdivisions[0];
      const nagpur03Z = vidarbha03Z.report1Rows.find((r) => r.stationId === '42867')!;
      assert.equal(nagpur03Z.rainfall0830, 12.0);
      assert.equal(nagpur03Z.rainfall1730, null);
      assert.equal(nagpur03Z.rainfall, 12.0);

      // 2. Ingest 12Z observation (evening): Nagpur has group 6035/ (35.0 mm cumulative since 03Z)
      // Wardha (42865) has i_R=3 (no precipitation, 0.0 mm)
      // Akola (42933) has group 6005/ (5.0 mm cumulative since 03Z)
      const raw12Z = `AAXX 15124
42867 12996 00701 10360 20214 40082 333 10395 6035/=
42865 32596 50901 10370 20160 40060 333 10410=
42933 12996 01402 10350 20190 40070 333 10390 6005/=`;
      store.ingestBulletin('12Z', raw12Z, reportingDate);

      // 3. Generate 12Z operational reports
      const res12Z = generateDailyReports('', reportingDate, new TestPentadNormalProvider(), new TestHistoricalProvider(), {
        utcSlot: '12Z',
        observationStore: store,
        subdivisionIds: ['26'],
      });

      const vidarbha12Z = res12Z.subdivisions[0];
      const nagpur12Z = vidarbha12Z.report1Rows.find((r) => r.stationId === '42867')!;
      const wardha12Z = vidarbha12Z.report1Rows.find((r) => r.stationId === '42865')!;
      const akola12Z = vidarbha12Z.report1Rows.find((r) => r.stationId === '42933')!;

      // Nagpur: 0830 IST rainfall preserved from morning (12.0 mm), 1730 IST rainfall is 35.0 mm from 6035/
      assert.equal(nagpur12Z.rainfall0830, 12.0, 'Must preserve morning 0830 rainfall');
      assert.equal(nagpur12Z.rainfall1730, 35.0, 'Must obtain 1730 IST rainfall from group 6035/');
      assert.equal(nagpur12Z.rainfall, 35.0, 'Active 12Z rainfall must be 35.0 mm');

      // Wardha: i_R=3, no group 6 -> 0.0 mm
      assert.equal(wardha12Z.rainfall1730, 0.0, 'Omitted group 6 with i_R=3 must decode to 0.0 mm');
      assert.equal(wardha12Z.rainfall, 0.0);

      // Akola: group 6005/ -> 5.0 mm
      assert.equal(akola12Z.rainfall1730, 5.0, 'Must obtain 1730 IST rainfall from group 6005/');
      assert.equal(akola12Z.rainfall, 5.0);

      // 4. Verify Subdivision Summary at 12Z
      assert.equal(vidarbha12Z.report2Summary.heaviestRainfall.value, 35.0);
      assert.equal(vidarbha12Z.report2Summary.heaviestRainfall.stationNames, 'Nagpur');
    });
  });

});

