/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePentad,
  calculateDeparture,
  formatDeparture,
  getKolkataCalendarDetails,
  getPreviousDayDateString,
  enrichObservation,
  enrichBulletin,
  type PentadNormal,
  type PentadNormalProvider,
} from './climatology.ts';
import { parseSingleTelegram, type ParsedStationObservation } from '../parser/synopDecoder.ts';

/**
 * Synthetic Test Normal Provider.
 * TEST FIXTURE ONLY - Used strictly to test arithmetic and lookup logic.
 */
class MockPentadNormalProvider implements PentadNormalProvider {
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

describe('Climatological Enrichment Suite', () => {

  describe('1. Legacy Pentad Calculation & Calendar Boundaries', () => {
    // January 1
    it('calculates pentad for Jan 1 (Tmin="01", Tmax="00")', () => {
      assert.equal(resolvePentad('2023-01-01', 'tmin'), '01');
      assert.equal(resolvePentad('2023-01-01', 'tmax'), '00');
    });

    // January 5
    it('calculates pentad for Jan 5 (Tmin="01", Tmax="01")', () => {
      assert.equal(resolvePentad('2023-01-05', 'tmin'), '01');
      assert.equal(resolvePentad('2023-01-05', 'tmax'), '01');
    });

    // January 6 (Pentad 2 boundary for Tmin)
    it('calculates pentad for Jan 6 (Tmin="02", Tmax="01")', () => {
      assert.equal(resolvePentad('2023-01-06', 'tmin'), '02');
      assert.equal(resolvePentad('2023-01-06', 'tmax'), '01');
    });

    // January 7 (Tmax advances to Pentad 2 because yesterday was Jan 6)
    it('calculates pentad for Jan 7 (Tmin="02", Tmax="02")', () => {
      assert.equal(resolvePentad('2023-01-07', 'tmin'), '02');
      assert.equal(resolvePentad('2023-01-07', 'tmax'), '02');
    });

    // February 28 (Non-leap year 2023)
    it('calculates pentad for Feb 28 in non-leap year (Tmin="12", Tmax="12")', () => {
      assert.equal(resolvePentad('2023-02-28', 'tmin'), '12');
      assert.equal(resolvePentad('2023-02-28', 'tmax'), '12');
    });

    // February 29 (Leap year 2024)
    it('calculates pentad for Feb 29 in leap year (Tmin="12", Tmax="12")', () => {
      assert.equal(resolvePentad('2024-02-29', 'tmin'), '12');
      assert.equal(resolvePentad('2024-02-29', 'tmax'), '12');
    });

    // March 1 (Non-leap year 2023)
    it('calculates pentad for Mar 1 in non-leap year (Tmin="12", Tmax="12")', () => {
      assert.equal(resolvePentad('2023-03-01', 'tmin'), '12');
      assert.equal(resolvePentad('2023-03-01', 'tmax'), '12');
    });

    // March 1 (Leap year 2024)
    it('calculates pentad for Mar 1 in leap year (Tmin="13", Tmax="13")', () => {
      assert.equal(resolvePentad('2024-03-01', 'tmin'), '13');
      assert.equal(resolvePentad('2024-03-01', 'tmax'), '13');
    });

    // March 5 (Non-leap year 2023)
    it('calculates pentad for Mar 5 in non-leap year (Tmin="13", Tmax="13")', () => {
      assert.equal(resolvePentad('2023-03-05', 'tmin'), '13');
      assert.equal(resolvePentad('2023-03-05', 'tmax'), '13');
    });

    // March 6 (Non-leap year 2023)
    it('calculates pentad for Mar 6 in non-leap year (Tmin="13", Tmax="13")', () => {
      assert.equal(resolvePentad('2023-03-06', 'tmin'), '13');
      assert.equal(resolvePentad('2023-03-06', 'tmax'), '13');
    });

    // December 31 (Non-leap year 2023)
    it('calculates pentad for Dec 31 in non-leap year (Tmin="73", Tmax="73")', () => {
      assert.equal(resolvePentad('2023-12-31', 'tmin'), '73');
      assert.equal(resolvePentad('2023-12-31', 'tmax'), '73');
    });

    // December 31 (Leap year 2024)
    it('calculates pentad for Dec 31 in leap year (clamped to "73")', () => {
      assert.equal(resolvePentad('2024-12-31', 'tmin'), '73');
      assert.equal(resolvePentad('2024-12-31', 'tmax'), '73');
    });
  });

  describe('2. Date Association & Timezone Helpers', () => {
    it('extracts date details in Asia/Kolkata timezone', () => {
      const details = getKolkataCalendarDetails('2026-10-02');
      assert.equal(details.year, 2026);
      assert.equal(details.month, 10);
      assert.equal(details.day, 2);
      assert.equal(details.dateStr, '2026-10-02');
      // Oct 2 in 2026 (non-leap): days before Oct = 273, day 2 = 273 + 1 = 274
      assert.equal(details.dayOfYear0, 274);
    });

    it('calculates previous day date string accurately across month/year boundaries', () => {
      assert.equal(getPreviousDayDateString('2026-10-02'), '2026-10-01');
      assert.equal(getPreviousDayDateString('2026-03-01'), '2026-02-28');
      assert.equal(getPreviousDayDateString('2024-03-01'), '2024-02-29'); // Leap year
      assert.equal(getPreviousDayDateString('2026-01-01'), '2025-12-31');
    });
  });

  describe('3. Departure Arithmetic & Formatting', () => {
    it('calculates positive departure with explicit "+" prefix', () => {
      const val = calculateDeparture(21.3, 18.9);
      assert.equal(val, 2.4);
      assert.equal(formatDeparture(val), '+2.4');
    });

    it('calculates negative departure with minus sign', () => {
      const val = calculateDeparture(18.9, 21.3);
      assert.equal(val, -2.4);
      assert.equal(formatDeparture(val), '-2.4');
    });

    it('calculates exact zero departure without sign and not as 0.0', () => {
      const val = calculateDeparture(20.0, 20.0);
      assert.equal(val, 0);
      assert.equal(formatDeparture(val), '0');
    });

    it('handles rounding boundaries cleanly (round to 1 decimal place)', () => {
      const val1 = calculateDeparture(20.04, 20.0);
      assert.equal(val1, 0);
      assert.equal(formatDeparture(val1), '0');

      const val2 = calculateDeparture(20.05, 20.0);
      assert.equal(val2, 0.1);
      assert.equal(formatDeparture(val2), '+0.1');
    });

    it('returns null when observed or normal is missing or invalid', () => {
      assert.equal(calculateDeparture(null, 20.0), null);
      assert.equal(calculateDeparture(20.0, null), null);
      assert.equal(calculateDeparture(undefined, 20.0), null);
      assert.equal(calculateDeparture(NaN, 20.0), null);
      assert.equal(formatDeparture(null), null);
    });
  });

  describe('4. Normal Provider & Enrichment Logic', () => {
    const mockProvider = new MockPentadNormalProvider([
      { station: '42937', pentad: '01', tmin: 15.0, tmax: 28.0 },
      { station: '42937', pentad: '02', tmin: 15.5, tmax: 28.5 },
      { station: '42865', pentad: '01', tmin: 14.0, tmax: 27.0 },
    ]);

    it('enriches observation when station and pentad normal exist', () => {
      const parsed: ParsedStationObservation = {
        stationId: '42937',
        tmin: 17.4,
        tmaxPreviousDay: 30.5,
        dryBulb: 25.0,
        dewPoint: 15.0,
        relativeHumidity: 54,
        visibilityCode: '96',
        rainfall: 0.0,
        mslPressure: 1012.0,
      };

      // Jan 5, 2023: Tmin uses Pentad 01, Tmax uses Pentad 01
      const enriched = enrichObservation(parsed, '2023-01-05', mockProvider);

      assert.equal(enriched.stationId, '42937');
      assert.equal(enriched.dateMorning, '2023-01-05');
      assert.equal(enriched.dateEvening, '2023-01-04');
      assert.equal(enriched.tmin, 17.4);
      // 17.4 - 15.0 = +2.4
      assert.equal(enriched.tminDeparture, '+2.4');
      assert.equal(enriched.tmax, 30.5);
      // 30.5 - 28.0 = +2.5
      assert.equal(enriched.tmaxDeparture, '+2.5');
    });

    it('falls back to "---" when normal is missing for a station', () => {
      const parsed: ParsedStationObservation = {
        stationId: '99999', // Unknown station
        tmin: 20.0,
        tmaxPreviousDay: 35.0,
      };

      const enriched = enrichObservation(parsed, '2023-01-05', mockProvider);
      assert.equal(enriched.tmin, 20.0);
      assert.equal(enriched.tminDeparture, '---');
      assert.equal(enriched.tmax, 35.0);
      assert.equal(enriched.tmaxDeparture, '---');
    });

    it('retains null departure when temperature observation itself is missing', () => {
      const parsed: ParsedStationObservation = {
        stationId: '42937',
        tmin: null,
        tmaxPreviousDay: null,
      };

      const enriched = enrichObservation(parsed, '2023-01-05', mockProvider);
      assert.equal(enriched.tmin, null);
      assert.equal(enriched.tminDeparture, null);
      assert.equal(enriched.tmax, null);
      assert.equal(enriched.tmaxDeparture, null);
    });

    it('ensures each station in a bulletin receives its own normals', () => {
      const parsedList: ParsedStationObservation[] = [
        { stationId: '42937', tmin: 16.0 },
        { stationId: '42865', tmin: 16.0 },
      ];

      const enriched = enrichBulletin(parsedList, '2023-01-05', mockProvider);
      // 42937 pentad 01 tmin normal = 15.0 -> 16.0 - 15.0 = +1.0
      assert.equal(enriched[0].tminDeparture, '+1.0');
      // 42865 pentad 01 tmin normal = 14.0 -> 16.0 - 14.0 = +2.0
      assert.equal(enriched[1].tminDeparture, '+2.0');
    });
  });

  describe('5. Golden Integration Test: Parsed 42937 Telegram to Enriched Record', () => {
    it('decodes raw telegram and enriches it end-to-end', () => {
      const rawTelegram = '42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=';
      const parsed = parseSingleTelegram(rawTelegram);
      assert.ok(parsed);
      assert.equal(parsed.stationId, '42937');
      assert.equal(parsed.tmin, 25.7);
      assert.equal(parsed.dryBulb, 32.6);
      assert.equal(parsed.dewPoint, 20.0);
      assert.equal(parsed.relativeHumidity, 48);
      assert.equal(parsed.rainfall, 0.0);

      // Synthetic normal fixture for test
      const testProvider = new MockPentadNormalProvider([
        { station: '42937', pentad: '01', tmin: 21.3, tmax: 33.0 },
      ]);

      const enriched = enrichObservation(parsed, '2023-01-05', testProvider);
      assert.equal(enriched.stationId, '42937');
      assert.equal(enriched.dateMorning, '2023-01-05');
      assert.equal(enriched.dateEvening, '2023-01-04');
      assert.equal(enriched.tmin, 25.7);
      // 25.7 - 21.3 = +4.4
      assert.equal(enriched.tminDeparture, '+4.4');
      assert.equal(enriched.dryBulb, 32.6);
      assert.equal(enriched.dewPoint, 20.0);
      assert.equal(enriched.relativeHumidity, 48);
      assert.equal(enriched.rainfall, 0.0);
      assert.equal(enriched.mslPressure, 1005.9);
      assert.equal(enriched.visibilityCode, '96');
    });
  });

});
