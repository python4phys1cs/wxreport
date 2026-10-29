/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSynopBulletin,
  parseSingleTelegram,
  calculateLegacyRelativeHumidity,
  parseMslPressure,
  parseRainfall,
  parseSection333,
  decode6RGroup,
  parse12UtcRainfall,
  parse12UtcSingleTelegram,
  parse12UtcBulletin,
  type ParsedStationObservation,
} from './synopDecoder.ts';

describe('SYNOP 03 UTC Decoder Suite', () => {

  describe('1. Golden Test Case: 10 Operational Stations', () => {
    const rawBulletin = `AAXX 01034
42933 32996 01402 10334 20213 40072 333 20297 59002 555 10000=
42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555
10036=
42865 32596 50901 10300 20227 39789 40098 333 10390 20260 59001
10695=
42931 32997 03202 10300 20220 40081 333 20266 58012 555 10000=
42946 32996 20000 10350 20201 40064 80001 333 20275 58006 555
10000=
43029 21595 12702 10332 20196 40069 70500 81030 333 20260 58005
60001/ 81360 555 00010 10001=
42947 32996 02702 10324 20201 4//// 333 20264 58/// 555 10000=
42871 31996 23201 10330 20194 39737 40074 70500 82030 333 10396
20262 59001 82360 555 10021=
42867 21996 00701 10326 20214 40082 70500 333 20244 58002 6001/ 555
00010 10048=
42943 32995 40902 10300 20200 40102 333 20232 58015 6000/ 555 00000
10042=`;

    it('extracts and decodes all 10 stations in order', () => {
      const results = parseSynopBulletin(rawBulletin);
      assert.equal(results.length, 10);

      const ids = results.map((r) => r.stationId);
      assert.deepEqual(ids, [
        '42933', '42937', '42865', '42931', '42946',
        '43029', '42947', '42871', '42867', '42943'
      ]);
    });

    it('verifies station 42933 (No Tmax, iR=3 zero rainfall, valid pressure)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42933')!;
      assert.ok(stn);
      assert.equal(stn.visibilityCode, '96');
      assert.equal(stn.dryBulb, 33.4);
      assert.equal(stn.dewPoint, 21.3);
      assert.equal(stn.relativeHumidity, 49);
      assert.equal(stn.mslPressure, 1007.2);
      assert.equal(stn.tmaxPreviousDay, null);
      assert.equal(stn.tmin, 29.7);
      assert.equal(stn.rainfall, 0.0);
    });

    it('verifies station 42937 (Line wrap in telegram, iR=3, no Tmax)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42937')!;
      assert.ok(stn);
      assert.equal(stn.visibilityCode, '96');
      assert.equal(stn.dryBulb, 32.6);
      assert.equal(stn.dewPoint, 20.0);
      assert.equal(stn.relativeHumidity, 48);
      assert.equal(stn.mslPressure, 1005.9);
      assert.equal(stn.tmaxPreviousDay, null);
      assert.equal(stn.tmin, 25.7);
      assert.equal(stn.rainfall, 0.0);
    });

    it('verifies station 42865 (Has both previous-day Tmax and current Tmin)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42865')!;
      assert.ok(stn);
      assert.equal(stn.visibilityCode, '96');
      assert.equal(stn.dryBulb, 30.0);
      assert.equal(stn.dewPoint, 22.7);
      assert.equal(stn.relativeHumidity, 65);
      assert.equal(stn.mslPressure, 1009.8);
      assert.equal(stn.tmaxPreviousDay, 39.0);
      assert.equal(stn.tmin, 26.0);
      assert.equal(stn.rainfall, 0.0);
    });

    it('verifies station 42931 (Normal observations, visibility 97)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42931')!;
      assert.ok(stn);
      assert.equal(stn.visibilityCode, '97');
      assert.equal(stn.dryBulb, 30.0);
      assert.equal(stn.dewPoint, 22.0);
      assert.equal(stn.relativeHumidity, 62);
      assert.equal(stn.mslPressure, 1008.1);
      assert.equal(stn.tmin, 26.6);
      assert.equal(stn.rainfall, 0.0);
    });

    it('verifies station 42946 (Warm 35.0 C, lower RH)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42946')!;
      assert.ok(stn);
      assert.equal(stn.dryBulb, 35.0);
      assert.equal(stn.dewPoint, 20.1);
      assert.equal(stn.relativeHumidity, 42);
      assert.equal(stn.mslPressure, 1006.4);
      assert.equal(stn.tmin, 27.5);
    });

    it('verifies station 43029 (Active rainfall iR=2 with Section 555 00010 -> 1.0 mm)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '43029')!;
      assert.ok(stn);
      assert.equal(stn.visibilityCode, '95');
      assert.equal(stn.dryBulb, 33.2);
      assert.equal(stn.dewPoint, 19.6);
      assert.equal(stn.relativeHumidity, 45);
      assert.equal(stn.mslPressure, 1006.9);
      assert.equal(stn.tmin, 26.0);
      assert.equal(stn.rainfall, 1.0); // 10 / 10 = 1.0 mm
    });

    it('verifies station 42947 (Missing pressure 4//// -> null)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42947')!;
      assert.ok(stn);
      assert.equal(stn.dryBulb, 32.4);
      assert.equal(stn.dewPoint, 20.1);
      assert.equal(stn.relativeHumidity, 48);
      assert.equal(stn.mslPressure, null); // 4//// -> null
      assert.equal(stn.tmin, 26.4);
    });

    it('verifies station 42871 (Has Tmax 39.6, Tmin 26.2, Pressure 1007.4)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42871')!;
      assert.ok(stn);
      assert.equal(stn.dryBulb, 33.0);
      assert.equal(stn.dewPoint, 19.4);
      assert.equal(stn.relativeHumidity, 45);
      assert.equal(stn.mslPressure, 1007.4);
      assert.equal(stn.tmaxPreviousDay, 39.6);
      assert.equal(stn.tmin, 26.2);
      assert.equal(stn.rainfall, 0.0);
    });

    it('verifies station 42867 (Active rainfall iR=2 with Section 555 00010 -> 1.0 mm)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42867')!;
      assert.ok(stn);
      assert.equal(stn.dryBulb, 32.6);
      assert.equal(stn.dewPoint, 21.4);
      assert.equal(stn.relativeHumidity, 52);
      assert.equal(stn.mslPressure, 1008.2);
      assert.equal(stn.tmin, 24.4);
      assert.equal(stn.rainfall, 1.0);
    });

    it('verifies station 42943 (iR=3 forces 0.0 rainfall even with 00000 in Sec 555)', () => {
      const results = parseSynopBulletin(rawBulletin);
      const stn = results.find((r) => r.stationId === '42943')!;
      assert.ok(stn);
      assert.equal(stn.dryBulb, 30.0);
      assert.equal(stn.dewPoint, 20.0);
      assert.equal(stn.relativeHumidity, 55);
      assert.equal(stn.mslPressure, 1010.2);
      assert.equal(stn.tmin, 23.2);
      assert.equal(stn.rainfall, 0.0);
    });
  });

  describe('2. Legacy Relative Humidity Calculation', () => {
    it('preserves the explicit integer truncation (int)(7.5 * temp)', () => {
      // 33.4 * 7.5 = 250.5 -> truncated to 250
      // 21.3 * 7.5 = 159.75 -> truncated to 159
      const rh = calculateLegacyRelativeHumidity(33.4, 21.3);
      assert.equal(rh, 49);
    });

    it('handles high relative humidity near saturation', () => {
      const rh = calculateLegacyRelativeHumidity(24.0, 23.8);
      assert.ok(rh !== null && rh >= 98 && rh <= 100);
    });

    it('handles low relative humidity in arid conditions', () => {
      const rh = calculateLegacyRelativeHumidity(44.0, 5.0);
      assert.ok(rh !== null && rh >= 5 && rh <= 15);
    });

    it('clamps RH between 0 and 100', () => {
      // Dew point higher than dry bulb due to observational error or fog supersaturation
      const rhSuper = calculateLegacyRelativeHumidity(20.0, 22.0);
      assert.equal(rhSuper, 100);

      // Extreme spread
      const rhDry = calculateLegacyRelativeHumidity(50.0, -20.0);
      assert.ok(rhDry !== null && rhDry >= 0 && rhDry <= 10);
    });

    it('returns null when temperature or dew point is missing', () => {
      assert.equal(calculateLegacyRelativeHumidity(null, 20.0), null);
      assert.equal(calculateLegacyRelativeHumidity(30.0, null), null);
      assert.equal(calculateLegacyRelativeHumidity(undefined, 20.0), null);
      assert.equal(calculateLegacyRelativeHumidity(NaN, 20.0), null);
    });
  });

  describe('3. MSL Pressure Decoding (Group 4PPPP)', () => {
    it('decodes pressure >= 1000 hPa (first digit 0)', () => {
      const tokens = ['42933', '32996', '10334', '20213', '40072', '333', '20297'];
      const p = parseMslPressure(tokens);
      // (0072 + 10000) / 10 = 1007.2
      assert.equal(p, 1007.2);
    });

    it('decodes pressure >= 1000 hPa with higher offset (e.g. 1024.5 hPa)', () => {
      const tokens = ['42933', '32996', '10334', '20213', '40245', '333', '20297'];
      const p = parseMslPressure(tokens);
      // (0245 + 10000) / 10 = 1024.5
      assert.equal(p, 1024.5);
    });

    it('decodes low pressure < 1000 hPa (first digit 9)', () => {
      const tokens = ['42933', '32996', '10334', '20213', '49876', '333', '20297'];
      const p = parseMslPressure(tokens);
      // 9876 / 10 = 987.6
      assert.equal(p, 987.6);
    });

    it('decodes very low pressure < 1000 hPa (first digit 8, deep depression / cyclone)', () => {
      const tokens = ['42933', '32996', '10334', '20213', '48950', '333', '20297'];
      const p = parseMslPressure(tokens);
      // 8950 / 10 = 895.0
      assert.equal(p, 895.0);
    });

    it('returns null for missing / slash pressure (4////)', () => {
      const tokens = ['42933', '32996', '10334', '20213', '4////', '333', '20297'];
      const p = parseMslPressure(tokens);
      assert.equal(p, null);
    });

    it('returns null if pressure group is absent', () => {
      const tokens = ['42933', '32996', '10334', '20213', '333', '20297'];
      const p = parseMslPressure(tokens);
      assert.equal(p, null);
    });
  });

  describe('4. Section 333 Extremes (Tmax & Tmin)', () => {
    it('decodes both Tmax and Tmin when both present', () => {
      const tokens = ['42865', '32596', '10300', '20227', '40098', '333', '10390', '20260', '555'];
      const res = parseSection333(tokens);
      assert.equal(res.tmaxPreviousDay, 39.0);
      assert.equal(res.tmin, 26.0);
    });

    it('decodes only Tmin when Tmax group is omitted', () => {
      const tokens = ['42933', '32996', '10334', '20213', '40072', '333', '20297', '555'];
      const res = parseSection333(tokens);
      assert.equal(res.tmaxPreviousDay, null);
      assert.equal(res.tmin, 29.7);
    });

    it('handles missing Tmax with slashes (10///)', () => {
      const tokens = ['42865', '32596', '333', '10///', '20260'];
      const res = parseSection333(tokens);
      assert.equal(res.tmaxPreviousDay, null);
      assert.equal(res.tmin, 26.0);
    });

    it('handles missing Tmin with slashes (20///)', () => {
      const tokens = ['42865', '32596', '333', '10390', '20///'];
      const res = parseSection333(tokens);
      assert.equal(res.tmaxPreviousDay, 39.0);
      assert.equal(res.tmin, null);
    });

    it('returns null for both when Section 333 is absent', () => {
      const tokens = ['42865', '32596', '10300', '20227', '40098', '555', '10000'];
      const res = parseSection333(tokens);
      assert.equal(res.tmaxPreviousDay, null);
      assert.equal(res.tmin, null);
    });
  });

  describe('5. Rainfall Handling (Header iR & Section 555)', () => {
    it('forces 0.0 when i_R = 3 (precipitation omitted)', () => {
      const tokens = ['42933', '32996', '10334', '20213', '333', '20297'];
      const rf = parseRainfall(tokens, '3');
      assert.equal(rf, 0.0);
    });

    it('forces 0.0 when i_R = 4 (no precipitation)', () => {
      const tokens = ['42933', '42996', '10334', '20213', '333', '20297'];
      const rf = parseRainfall(tokens, '4');
      assert.equal(rf, 0.0);
    });

    it('parses Section 555 rainfall when i_R = 2 (e.g. 00152 -> 15.2 mm)', () => {
      const tokens = ['43029', '21595', '10332', '20196', '333', '20260', '555', '00152', '10001'];
      const rf = parseRainfall(tokens, '2');
      assert.equal(rf, 15.2);
    });

    it('parses trace / small rainfall in Section 555 (00002 -> 0.2 mm)', () => {
      const tokens = ['43029', '21595', '555', '00002'];
      const rf = parseRainfall(tokens, '2');
      assert.equal(rf, 0.2);
    });

    it('returns null when i_R = 1 or 2 but Section 555 has no rainfall group', () => {
      const tokens = ['43029', '21595', '10332', '20196', '333', '20260', '555', '10001'];
      const rf = parseRainfall(tokens, '2');
      assert.equal(rf, null);
    });

    it('returns null when i_R = 1 or 2 and Section 555 is absent', () => {
      const tokens = ['43029', '21595', '10332', '20196', '333', '20260'];
      const rf = parseRainfall(tokens, '2');
      assert.equal(rf, null);
    });
  });

  describe('6. Telegram Robustness & Error Handling', () => {
    it('fails gracefully on empty input', () => {
      const res = parseSynopBulletin('');
      assert.deepEqual(res, []);
    });

    it('fails gracefully on non-SYNOP random text', () => {
      const res = parseSynopBulletin('Hello, this is not a SYNOP telegram message.');
      assert.deepEqual(res, []);
    });

    it('skips truncated telegrams (< 20 chars)', () => {
      const res = parseSingleTelegram('42933 32996=');
      assert.equal(res, null);
    });

    it('parses a telegram without trailing = terminator if single telegram provided', () => {
      const raw = '42933 32996 01402 10334 20213 40072 333 20297 59002 555 10000';
      const parsed = parseSingleTelegram(raw);
      assert.ok(parsed);
      assert.equal(parsed.stationId, '42933');
      assert.equal(parsed.dryBulb, 33.4);
    });

    it('handles multiple newlines and carriage returns cleanly', () => {
      const raw = `AAXX 01034\r\n\r\n42933 32996\r\n01402 10334\r\n20213 40072 333\r\n20297 59002 555 10000=\r\n\r\n`;
      const res = parseSynopBulletin(raw);
      assert.equal(res.length, 1);
      assert.equal(res[0].stationId, '42933');
      assert.equal(res[0].relativeHumidity, 49);
    });
  });

  describe('7. Forensic Regression & Legacy Edge Case Suite', () => {
    it('preserves leading zeroes in 5-digit station IDs (e.g. 01034)', () => {
      const raw = '01034 32996 01402 10334 20213 40072 333 20297 59002 555 10000=';
      const parsed = parseSingleTelegram(raw);
      assert.ok(parsed);
      assert.equal(parsed.stationId, '01034');
      assert.equal(typeof parsed.stationId, 'string');
    });

    it('decodes negative dry-bulb temperature (11025 -> -2.5 C)', () => {
      const raw = '42933 32996 01402 11025 21050 40072 333 20200 555 10000=';
      const parsed = parseSingleTelegram(raw);
      assert.ok(parsed);
      assert.equal(parsed.dryBulb, -2.5);
      assert.equal(parsed.dewPoint, -5.0);
    });

    it('normalizes negative zero temperature to 0 (11000 -> 0, 21000 -> 0)', () => {
      const raw = '42933 32996 01402 11000 21000 40072 333 11000 21000 555 10000=';
      const parsed = parseSingleTelegram(raw);
      assert.ok(parsed);
      assert.equal(parsed.dryBulb, 0);
      assert.equal(Object.is(parsed.dryBulb, -0), false);
      assert.equal(parsed.dewPoint, 0);
      assert.equal(Object.is(parsed.dewPoint, -0), false);
      assert.equal(parsed.tmaxPreviousDay, 0);
      assert.equal(Object.is(parsed.tmaxPreviousDay, -0), false);
      assert.equal(parsed.tmin, 0);
      assert.equal(Object.is(parsed.tmin, -0), false);
    });

    it('reproduces exact legacy relative humidity with subzero temperatures (-5.0 C DBT, -10.0 C DPT -> 68%)', () => {
      const rh = calculateLegacyRelativeHumidity(-5.0, -10.0);
      assert.equal(rh, 68);
    });

    it('decodes MSL pressure with arbitrary first digits < 1000 hPa (e.g. 47950 -> 795.0 hPa)', () => {
      const tokens = ['42933', '32996', '10334', '20213', '47950', '333', '20297'];
      const p = parseMslPressure(tokens);
      assert.equal(p, 795.0);
    });

    it('decodes subzero extremes in Section 333 (11035 -> -3.5 C Tmax, 21085 -> -8.5 C Tmin)', () => {
      const tokens = ['42865', '32596', '10300', '20227', '40098', '333', '11035', '21085', '555'];
      const res = parseSection333(tokens);
      assert.equal(res.tmaxPreviousDay, -3.5);
      assert.equal(res.tmin, -8.5);
    });

    it('handles NIL telegram gracefully', () => {
      const raw = '42933 NIL=';
      const parsed = parseSingleTelegram(raw);
      assert.equal(parsed, null);
    });
  });

  describe('8. Operational Bulletin Multi-Station Forensics Suite', () => {
    it('isolates multi-station telegrams without cross-station token leakage', () => {
      // Concatenate 3 distinct stations
      const bulletin = `
        42933 32996 01402 10334 20213 40072 333 20297 59002 555 10000=
        42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=
        43029 21595 12702 10332 20196 40069 70500 81030 333 20260 58005 60001/ 81360 555 00010 10001=
      `;
      const results = parseSynopBulletin(bulletin);
      assert.equal(results.length, 3);

      // Station 1: Akola
      assert.equal(results[0].stationId, '42933');
      assert.equal(results[0].dryBulb, 33.4);
      assert.equal(results[0].rainfall, 0.0);

      // Station 2: Nagpur
      assert.equal(results[1].stationId, '42937');
      assert.equal(results[1].dryBulb, 32.6);
      assert.equal(results[1].rainfall, 0.0);

      // Station 3: Brahmapuri (has rainfall 1.0 mm)
      assert.equal(results[2].stationId, '43029');
      assert.equal(results[2].dryBulb, 33.2);
      assert.equal(results[2].rainfall, 1.0);
    });

    it('isolates embedded NIL telegrams between active stations without consuming adjacent data', () => {
      const bulletin = `
        42933 32996 01402 10334 20213 40072 333 20297 59002 555 10000=
        42935 NIL=
        42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=
      `;
      const results = parseSynopBulletin(bulletin);
      assert.equal(results.length, 2);
      assert.equal(results[0].stationId, '42933');
      assert.equal(results[1].stationId, '42937');
    });

    it('handles bulletin header with COR and AMD flags', () => {
      const corBulletin = `AAXX 01034 COR\n42933 32996 01402 10334 20213 40072 333 20297 59002 555 10000=`;
      const corResults = parseSynopBulletin(corBulletin);
      assert.equal(corResults.length, 1);
      assert.equal(corResults[0].stationId, '42933');

      const amdBulletin = `AAXX 01034 AMD\n42937 32596 22503 10326 20200 40059 82500 333 20257 59010 555 10036=`;
      const amdResults = parseSynopBulletin(amdBulletin);
      assert.equal(amdResults.length, 1);
      assert.equal(amdResults[0].stationId, '42937');
    });

    it('parses Section 333 when Tmin appears before Tmax', () => {
      // 20260 (Tmin 26.0) precedes 10390 (Tmax 39.0)
      const tokens = ['42865', '32596', '10300', '20227', '40098', '333', '20260', '10390', '555'];
      const res = parseSection333(tokens);
      assert.equal(res.tmin, 26.0);
      assert.equal(res.tmaxPreviousDay, 39.0);
    });

    it('decodes pressure at and around 1000 hPa threshold', () => {
      // 40000 -> 1000.0 hPa
      assert.equal(parseMslPressure(['42933', '32996', '10334', '20213', '40000', '333']), 1000.0);

      // 40001 -> 1000.1 hPa
      assert.equal(parseMslPressure(['42933', '32996', '10334', '20213', '40001', '333']), 1000.1);

      // 49999 -> 999.9 hPa
      assert.equal(parseMslPressure(['42933', '32996', '10334', '20213', '49999', '333']), 999.9);

      // 40350 -> 1035.0 hPa
      assert.equal(parseMslPressure(['42933', '32996', '10334', '20213', '40350', '333']), 1035.0);
    });

    it('performs table-driven verification of legacy Relative Humidity arithmetic', () => {
      const cases = [
        { dbt: 33.4, dpt: 21.3, expected: 49 },
        { dbt: 20.0, dpt: 20.0, expected: 100 },
        { dbt: 0.0, dpt: 0.0, expected: 100 },
        { dbt: 0.0, dpt: -2.0, expected: 86 },
        { dbt: -5.0, dpt: -5.0, expected: 100 },
        { dbt: -5.0, dpt: -10.0, expected: 68 },
        { dbt: 45.0, dpt: 2.0, expected: 7 },
        { dbt: 33.33, dpt: 20.0, expected: 46 },
        { dbt: 33.34, dpt: 20.0, expected: 46 },
      ];

      for (const c of cases) {
        assert.equal(
          calculateLegacyRelativeHumidity(c.dbt, c.dpt),
          c.expected,
          `Failed for DBT=${c.dbt}, DPT=${c.dpt}`
        );
      }
    });

    it('safely handles missing optional groups without throwing', () => {
      // Telegram with temperature but without pressure, Section 333, or Section 555
      const minimalTelegram = '42933 22996 01402 10334 20213=';
      const parsed = parseSingleTelegram(minimalTelegram);
      assert.ok(parsed);
      assert.equal(parsed.stationId, '42933');
      assert.equal(parsed.dryBulb, 33.4);
      assert.equal(parsed.dewPoint, 21.3);
      assert.equal(parsed.relativeHumidity, 49);
      assert.equal(parsed.mslPressure, null);
      assert.equal(parsed.tmaxPreviousDay, null);
      assert.equal(parsed.tmin, null);
      assert.equal(parsed.rainfall, null); // iR=2 but no Section 555 -> null
    });

    it('recovers and decodes both stations when "=" terminator is omitted between telegrams', () => {
      // User's exact test case with missing '=' between 43041 and 42782
      const userBulletin = `43041 21494 83206 10235 20231 39363 49968 76366 8672/ 333 20230 59053 6034/ 84610 86618 88458 555 00344 11243
42782 22596 73603 10272 20243 40013 83530 333 20255 59029 6005/ 83620 87360 555 00046 11234=`;

      const parsed = parseSynopBulletin(userBulletin);
      assert.equal(parsed.length, 2, 'Must decode both stations even when "=" is omitted');

      const stn43041 = parsed.find((p) => p.stationId === '43041')!;
      const stn42782 = parsed.find((p) => p.stationId === '42782')!;

      assert.ok(stn43041, 'Station 43041 (Jagdalpur) must be parsed');
      assert.ok(stn42782, 'Station 42782 (Bilaspur) must be parsed');

      // Check values for 43041: dryBulb=23.5, dewPoint=23.1, tmin=23.0, rainfall=34.4
      assert.equal(stn43041.dryBulb, 23.5);
      assert.equal(stn43041.dewPoint, 23.1);
      assert.equal(stn43041.tmin, 23.0);
      assert.equal(stn43041.rainfall, 34.4);

      // Check values for 42782: dryBulb=27.2, dewPoint=24.3, tmin=25.5, rainfall=4.6
      assert.equal(stn42782.dryBulb, 27.2);
      assert.equal(stn42782.dewPoint, 24.3);
      assert.equal(stn42782.tmin, 25.5);
      assert.equal(stn42782.rainfall, 4.6);
    });
  });

  describe('7. 12 UTC Cumulative Rainfall (Group 6RRR/) & 12Z Bulletin Suite', () => {
    it('decodes standard 6RRR/ groups into millimeters per WMO Code Table 3590', () => {
      // 6000/ -> 0.0 mm
      assert.equal(decode6RGroup('6000/'), 0.0);
      // 6001/ -> 1.0 mm
      assert.equal(decode6RGroup('6001/'), 1.0);
      // 6005/ -> 5.0 mm
      assert.equal(decode6RGroup('6005/'), 5.0);
      // 6012/ -> 12.0 mm
      assert.equal(decode6RGroup('6012/'), 12.0);
      // 6034/ -> 34.0 mm
      assert.equal(decode6RGroup('6034/'), 34.0);
      // 6150/ -> 150.0 mm
      assert.equal(decode6RGroup('6150/'), 150.0);
      // 6989/ -> 989.0 mm
      assert.equal(decode6RGroup('6989/'), 989.0);
    });

    it('decodes trace (990) and fractional millimeter increments (991-999)', () => {
      // 990 = Trace (< 0.1 mm)
      assert.equal(decode6RGroup('6990/'), 0.0);
      // 991 = 0.1 mm
      assert.equal(decode6RGroup('6991/'), 0.1);
      // 992 = 0.2 mm
      assert.equal(decode6RGroup('6992/'), 0.2);
      // 995 = 0.5 mm
      assert.equal(decode6RGroup('6995/'), 0.5);
      // 999 = 0.9 mm
      assert.equal(decode6RGroup('6999/'), 0.9);
    });

    it('returns null for unmeasurable slashes (6//// or 6///)', () => {
      assert.equal(decode6RGroup('6///'), null);
      assert.equal(decode6RGroup('6////'), null);
      assert.equal(decode6RGroup('612/'), null);
    });

    it('extracts cumulative rainfall since 03Z from Section 333 group 6RRR/', () => {
      const tokens = ['42867', '12996', '01402', '10360', '20180', '40050', '333', '10385', '6015/'];
      const rf = parse12UtcRainfall(tokens, '1');
      assert.equal(rf, 15.0);
    });

    it('extracts cumulative rainfall from Section 1 group 6RRR/ if reported in Section 1', () => {
      const tokens = ['42867', '12996', '01402', '10360', '20180', '40050', '6008/', '333', '10385'];
      const rf = parse12UtcRainfall(tokens, '1');
      assert.equal(rf, 8.0);
    });

    it('forces 0.0 mm rainfall when group 6 is omitted and i_R = 3 or 4', () => {
      const tokens3 = ['42867', '32996', '01402', '10360', '20180', '40050', '333', '10385'];
      assert.equal(parse12UtcRainfall(tokens3, '3'), 0.0);

      const tokens4 = ['42867', '42996', '01402', '10360', '20180', '40050', '333', '10385'];
      assert.equal(parse12UtcRainfall(tokens4, '4'), 0.0);
    });

    it('decodes complete 12 UTC telegram extracting today Tmax and cumulative rainfall from 6RRR/', () => {
      const telegram = '42867 12996 01402 10360 20180 40050 333 10412 6025/=';
      const parsed = parse12UtcSingleTelegram(telegram);
      assert.ok(parsed);
      assert.equal(parsed.stationId, '42867');
      assert.equal(parsed.dryBulb, 36.0);
      assert.equal(parsed.dewPoint, 18.0);
      assert.equal(parsed.relativeHumidity, 35);
      assert.equal(parsed.mslPressure, 1005.0);
      assert.equal(parsed.tmax, 41.2); // Section 333 10412
      assert.equal(parsed.rainfall, 25.0); // Section 333 6025/ -> 25 mm cumulative since 03Z
    });

    it('decodes 12 UTC bulletin containing multiple stations with varying rainfall from 6RRR/', () => {
      const rawBulletin = `AAXX 15124
42867 12996 01402 10360 20180 40050 333 10412 6025/=
42865 32596 50901 10370 20160 40060 333 10420=
42933 12996 01402 10350 20190 40070 333 10395 6992/=`;

      const list = parse12UtcBulletin(rawBulletin);
      assert.equal(list.length, 3);

      const nagpur = list.find((s) => s.stationId === '42867')!;
      assert.equal(nagpur.tmax, 41.2);
      assert.equal(nagpur.rainfall, 25.0);

      const wardha = list.find((s) => s.stationId === '42865')!;
      assert.equal(wardha.tmax, 42.0);
      assert.equal(wardha.rainfall, 0.0); // i_R=3 -> 0.0 mm

      const gondia = list.find((s) => s.stationId === '42933')!;
      assert.equal(gondia.tmax, 39.5);
      assert.equal(gondia.rainfall, 0.2); // 6992/ -> 0.2 mm
    });
  });

});
