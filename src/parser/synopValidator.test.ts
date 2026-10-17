/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSingleTelegram,
  validateSynopBulletin,
  DEFAULT_CENTRAL_INDIA_LIMITS,
} from './synopValidator.ts';

describe('SYNOP Validator: Central India Plausibility & Syntax Checks', () => {
  // Representative valid 03 UTC telegram for Nagpur (42867)
  const validNagpur03Z = '42867 11560 70000 10324 20215 40092 333 10425 20240 555 00000=';

  it('1. passes clean operational observations with zero errors and zero warnings', () => {
    const res = validateSingleTelegram(validNagpur03Z, '03Z');
    assert.equal(res.stationId, '42867');
    assert.equal(res.errorCount, 0);
    assert.equal(res.warningCount, 0);
    assert.equal(res.issues.length, 0);
  });

  it('2. validates temperature limits for Central India', () => {
    // Tmax warning: 49.0°C (extreme heatwave, warning)
    const heatwaveTelegram = '42867 11560 70000 10324 20215 40092 333 10490 20240 555 00000=';
    const heatRes = validateSingleTelegram(heatwaveTelegram, '03Z');
    assert.equal(heatRes.errorCount, 0);
    assert.equal(heatRes.warningCount, 1);
    assert.ok(heatRes.issues[0].message.includes('Severe high maximum temperature'));
    assert.equal(heatRes.issues[0].decodedValue, '49°C');

    // Tmax error: 57.5°C (physically impossible in central India, error)
    const impossibleHeatTelegram = '42867 11560 70000 10324 20215 40092 333 10575 20240 555 00000=';
    const impHeatRes = validateSingleTelegram(impossibleHeatTelegram, '03Z');
    assert.equal(impHeatRes.errorCount, 1);
    assert.ok(impHeatRes.issues.some((i) => i.severity === 'error' && i.field === 'tmax'));

    // Tmin warning: 2.0°C (severe cold wave in central India, warning)
    const coldwaveTelegram = '42867 11560 70000 10180 20080 40150 333 10240 20020 555 00000=';
    const coldRes = validateSingleTelegram(coldwaveTelegram, '03Z');
    assert.equal(coldRes.errorCount, 0);
    assert.ok(coldRes.issues.some((i) => i.severity === 'warning' && i.field === 'tmin'));

    // Tmin error: -8.0°C (negative extreme impossible on plains of central India)
    const impossibleColdTelegram = '42867 11560 70000 10180 20080 40150 333 10240 21080 555 00000=';
    const impColdRes = validateSingleTelegram(impossibleColdTelegram, '03Z');
    assert.ok(impColdRes.issues.some((i) => i.severity === 'error' && i.field === 'tmin'));
  });

  it('3. flags invalid temperature relationship: Tmin > Tmax', () => {
    // Tmin = 32.0°C (20320), Tmax = 28.0°C (10280) -> physically inverted relationship
    const invertedTelegram = '42867 11560 70000 10300 20200 40092 333 10280 20320 555 00000=';
    const res = validateSingleTelegram(invertedTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    const issue = res.issues.find((i) => i.field === 'temperature_relationship');
    assert.ok(issue);
    assert.equal(issue.severity, 'error');
    assert.ok(issue.message.includes('Minimum temperature (32°C) is greater than Maximum temperature (28°C)'));
  });

  it('4. flags physical conflict when Dew Point > Dry Bulb', () => {
    // Dry bulb = 22.0°C (10220), Dew point = 25.0°C (20250) -> impossible super-saturation in surface screen
    const wetTelegram = '42867 11560 70000 10220 20250 40092 333 10320 20180 555 00000=';
    const res = validateSingleTelegram(wetTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    const dewIssue = res.issues.find((i) => i.field === 'dewPoint');
    assert.ok(dewIssue);
    assert.equal(dewIssue.severity, 'error');
    assert.ok(dewIssue.message.includes('Dew point (25°C) exceeds dry-bulb temperature (22°C)'));
  });

  it('5. validates rainfall boundaries and extreme events', () => {
    // Extremely heavy rainfall: 280.0 mm (02800) -> Warning (valid extreme event, should not be rejected)
    const heavyRainTelegram = '42867 11560 70000 10280 20260 40092 333 10330 20240 555 02800=';
    const heavyRes = validateSingleTelegram(heavyRainTelegram, '03Z');
    assert.equal(heavyRes.errorCount, 0);
    assert.equal(heavyRes.warningCount, 1);
    assert.ok(heavyRes.issues[0].message.includes('Extremely heavy rainfall reported (280 mm)'));

    // Implausible rainfall: 780.0 mm (07800) -> Error (exceeds central India regional plausibility limit)
    const impRainTelegram = '42867 11560 70000 10280 20260 40092 333 10330 20240 555 07800=';
    const impRainRes = validateSingleTelegram(impRainTelegram, '03Z');
    assert.ok(impRainRes.issues.some((i) => i.severity === 'error' && i.field === 'rainfall'));
  });

  it('6. detects malformed groups and invalid sign digits', () => {
    // Group 18324 has invalid sign digit '8' (must be 0 or 1)
    const badSignTelegram = '42867 11560 70000 18324 20215 40092 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(badSignTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    assert.ok(res.issues.some((i) => i.rawGroup === '18324' && i.message.includes("Invalid temperature sign digit '8'")));

    // Truncated group '103'
    const truncatedTelegram = '42867 11560 70000 103 20215 40092 333 10425 20240 555 00000=';
    const truncRes = validateSingleTelegram(truncatedTelegram, '03Z');
    assert.ok(truncRes.issues.some((i) => i.rawGroup === '103' && i.message.includes('Malformed SYNOP group')));
  });

  it('7. detects duplicate station telegrams in the same bulletin', () => {
    const bulletinWithDuplicate = `
      AAXX 01034
      42867 11560 70000 10324 20215 40092 333 10425 20240 555 00000=
      42410 11560 70000 10310 20200 40092 333 10410 20230 555 00000=
      42867 11560 70000 10328 20216 40092 333 10428 20242 555 00000=
    `;
    const report = validateSynopBulletin(bulletinWithDuplicate, '03Z');
    assert.equal(report.totalTelegrams, 3);
    assert.ok(report.hasWarnings);
    const dupIssue = report.allIssues.find((i) => i.message.includes('Duplicate station report'));
    assert.ok(dupIssue);
    assert.equal(dupIssue?.stationId, '42867');
  });

  it('8. flags unrecognized station code not in regional registry', () => {
    // 99999 is not in regional registry
    const unknownStnTelegram = '99999 11560 70000 10324 20215 40092 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(unknownStnTelegram, '03Z');
    assert.equal(res.errorCount, 0);
    assert.equal(res.warningCount, 1);
    assert.ok(res.issues[0].message.includes('not in the regional master station registry'));
  });

  it('9. supports customizable limits', () => {
    // Custom limit: flag Tmax warning above 40.0°C instead of default 48.0°C
    const res = validateSingleTelegram(validNagpur03Z, '03Z', {
      tmaxWarningHigh: 40.0,
    });
    // Tmax in validNagpur03Z is 42.5°C -> now triggers warning
    assert.ok(res.issues.some((i) => i.field === 'tmax' && i.severity === 'warning'));
  });
});
