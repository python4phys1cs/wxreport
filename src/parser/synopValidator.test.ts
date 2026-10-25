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
  SYNOP_VALIDATION_RULES,
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
    assert.equal(issue.ruleId, 'TEM-001');
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
    assert.equal(dewIssue.ruleId, 'TEM-001');
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

  it('6. detects malformed groups and invalid sign digits (STR-001 & TEM-001)', () => {
    // Group 18324 has invalid sign digit '8' (must be 0 or 1)
    const badSignTelegram = '42867 11560 70000 18324 20215 40092 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(badSignTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    assert.ok(res.issues.some((i) => i.rawGroup === '18324' && i.ruleId === 'TEM-001'));

    // Truncated group '103'
    const truncatedTelegram = '42867 11560 70000 103 20215 40092 333 10425 20240 555 00000=';
    const truncRes = validateSingleTelegram(truncatedTelegram, '03Z');
    assert.ok(truncRes.issues.some((i) => i.rawGroup === '103' && i.ruleId === 'STR-001'));
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

  // --- Comprehensive IMD Inland Station Rules (STR, RNG, CLD, WND, TEM, RAI, PRE, WX, SQU) ---

  it('10. enforces STR-002: strictly forbids Section 2 marine data (222//) for inland stations', () => {
    const marineTelegram = '42867 11560 70000 10324 20215 40092 222// 00120 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(marineTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    const marineIssue = res.issues.find((i) => i.ruleId === 'STR-002');
    assert.ok(marineIssue, 'STR-002 error must be generated for Section 2 marine data');
    assert.equal(marineIssue.severity, 'error');
    assert.ok(marineIssue.message.includes('Section 2 (Marine data: 222//) is forbidden'));
  });

  it('11. enforces RNG-001: validates cloud amount character values (0-9 or /)', () => {
    // Invalid total cloud amount 'A' in group 'A0000'
    const badCloudTelegram = '42867 11560 A0000 10324 20215 40092 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(badCloudTelegram, '03Z');
    const rngIssue = res.issues.find((i) => i.ruleId === 'RNG-001' && i.field === 'N');
    assert.ok(rngIssue, 'RNG-001 must flag invalid cloud character');
    assert.equal(rngIssue.severity, 'error');
  });

  it('12. enforces CLD-001: low/mid cloud amount Nh cannot exceed total cloud amount N', () => {
    // Total cloud N=2 (20000), but Section 1 8NhCLCMCH reports Nh=6 (86121)
    const invalidCloudHierarchy = '42867 11560 20000 10324 20215 40092 86121 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(invalidCloudHierarchy, '03Z');
    assert.ok(res.errorCount >= 1);
    const cldIssue = res.issues.find((i) => i.ruleId === 'CLD-001');
    assert.ok(cldIssue, 'CLD-001 must flag Nh > N violation');
    assert.equal(cldIssue.severity, 'error');
    assert.ok(cldIssue.message.includes('Low/mid cloud amount (6 oktas) exceeds total cloud cover (2 oktas)'));
  });

  it('13. enforces WND-001: Calm Wind Zero Rule (dd=00 <=> ff=00)', () => {
    // Violation 1: dd=00 but speed ff=12 (00012)
    const calmDirWithSpeed = '42867 11560 70012 10324 20215 40092 333 10425 20240 555 00000=';
    const res1 = validateSingleTelegram(calmDirWithSpeed, '03Z');
    const wndIssue1 = res1.issues.find((i) => i.ruleId === 'WND-001');
    assert.ok(wndIssue1, 'WND-001 must flag calm direction dd=00 with non-zero speed');
    assert.equal(wndIssue1.severity, 'error');

    // Violation 2: direction dd=18 but speed ff=00 (18000)
    const dirWithZeroSpeed = '42867 11560 71800 10324 20215 40092 333 10425 20240 555 00000=';
    const res2 = validateSingleTelegram(dirWithZeroSpeed, '03Z');
    const wndIssue2 = res2.issues.find((i) => i.ruleId === 'WND-001');
    assert.ok(wndIssue2, 'WND-001 must flag zero speed ff=00 with non-zero direction');
    assert.equal(wndIssue2.severity, 'error');

    // Permitted: Variable wind dd=99 with speed ff=08 (99008)
    const variableWind = '42867 11560 79908 10324 20215 40092 333 10425 20240 555 00000=';
    const res3 = validateSingleTelegram(variableWind, '03Z');
    const wndIssue3 = res3.issues.find((i) => i.ruleId === 'WND-001');
    assert.equal(wndIssue3, undefined, 'dd=99 (variable wind) must not trigger WND-001');
  });

  it('14. enforces TEM-001 in 12Z: maximum temperature cannot be lower than current dry bulb', () => {
    // In 12Z: current dry-bulb T = 35.0°C (10350), but Tx reported in Section 3 is 31.0°C (10310)
    const invalidTx12Z = '42867 11560 70000 10350 20200 40092 333 10310 555 00000=';
    const res = validateSingleTelegram(invalidTx12Z, '12Z');
    assert.ok(res.errorCount >= 1);
    const txIssue = res.issues.find((i) => i.ruleId === 'TEM-001' && i.field === 'tmax');
    assert.ok(txIssue, 'TEM-001 must reject 12Z maximum temperature lower than current temperature');
    assert.equal(txIssue.severity, 'error');
    assert.ok(txIssue.message.includes('Maximum temperature (31°C) cannot be lower than current dry-bulb temperature (35°C)'));

    // In 12Z: reporting minimum temperature (2snTnTnTn) should trigger a warning
    const minTempIn12Z = '42867 11560 70000 10320 20200 40092 333 10360 20210 555 00000=';
    const resWarn = validateSingleTelegram(minTempIn12Z, '12Z');
    const tnWarn = resWarn.issues.find((i) => i.ruleId === 'TEM-001' && i.field === 'tmin');
    assert.ok(tnWarn, 'TEM-001 should warn when minimum temperature group is reported in 12Z');
    assert.equal(tnWarn.severity, 'warning');
  });

  it('15. enforces RAI-001: precipitation group omission and inclusion logic', () => {
    // iR=3 (no precipitation) but Group 6 (6012/) is included in Section 1 or 3
    const conflictTelegram = '42867 31560 70000 10324 20215 40092 6012/ 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(conflictTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    const raiIssue = res.issues.find((i) => i.ruleId === 'RAI-001');
    assert.ok(raiIssue, 'RAI-001 must reject group 6 when iR=3/4');
    assert.equal(raiIssue.severity, 'error');
    assert.ok(raiIssue.message.includes('Group 6 must be omitted when iR=3 or 4'));
  });

  it('16. enforces RAI-002: precipitation period indicator tR must be solidus (/) for Indian stations', () => {
    // Group 60121 has numeric tR='1' instead of '/'
    const invalidTrTelegram = '42867 11560 70000 10324 20215 40092 60121 333 10425 20240 555 00000=';
    const res = validateSingleTelegram(invalidTrTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    const raiIssue = res.issues.find((i) => i.ruleId === 'RAI-002');
    assert.ok(raiIssue, 'RAI-002 must reject non-solidus tR');
    assert.equal(raiIssue.severity, 'error');
    assert.ok(raiIssue.message.includes("tR must be coded as solidus '/'"));
  });

  it('17. enforces PRE-001: 58 and 59 groups are mutually exclusive in Section 3', () => {
    // Telegram with both 58012 (pressure rise) and 59008 (pressure fall) in Section 3
    const dualPressureTelegram = '42867 11560 70000 10324 20215 40092 333 10425 20240 58012 59008 555 00000=';
    const res = validateSingleTelegram(dualPressureTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    const preIssue = res.issues.find((i) => i.ruleId === 'PRE-001');
    assert.ok(preIssue, 'PRE-001 must reject concurrent 58 and 59 groups');
    assert.equal(preIssue.severity, 'error');
    assert.ok(preIssue.message.includes('mutually exclusive'));
  });

  it('18. enforces WX-001: group 7 omission logic and past weather sequence', () => {
    // Insignificant weather in Group 7 (ww=02, W1=1, W2=1) must be omitted
    const insignificantWx = '42867 11560 70000 10324 20215 40092 70211 333 10425 20240 555 00000=';
    const res1 = validateSingleTelegram(insignificantWx, '03Z');
    assert.ok(res1.errorCount >= 1);
    const wxIssue1 = res1.issues.find((i) => i.ruleId === 'WX-001');
    assert.ok(wxIssue1, 'WX-001 must reject group 7 when weather is insignificant');
    assert.equal(wxIssue1.severity, 'error');
    assert.ok(wxIssue1.message.includes('must be omitted when ww in [00-03]'));

    // Past weather sequence violation: W1 < W2 (e.g. 76149 -> ww=61, W1=4, W2=9)
    const badPastWx = '42867 11560 70000 10324 20215 40092 76149 333 10425 20240 555 00000=';
    const res2 = validateSingleTelegram(badPastWx, '03Z');
    assert.ok(res2.errorCount >= 1);
    const wxIssue2 = res2.issues.find((i) => i.ruleId === 'WX-001' && i.message.includes('W1 >= W2'));
    assert.ok(wxIssue2, 'WX-001 must enforce W1 >= W2');
    assert.equal(wxIssue2.severity, 'error');

    // Valid significant thunderstorm weather passes WX-001
    const validThunderstorm = '42867 11560 70000 10324 20215 40092 71792 333 10425 20240 555 00000=';
    const res3 = validateSingleTelegram(validThunderstorm, '03Z');
    const wxIssue3 = res3.issues.find((i) => i.ruleId === 'WX-001');
    assert.equal(wxIssue3, undefined, 'Valid thunderstorm Group 7 must not trigger WX-001 error');
  });

  it('19. enforces WX-002: fog weather with visibility >= 1.0 km triggers warning', () => {
    // Fog ww=45 reported, but visibility VV in Nddff is 20 (2.0 km >= 1.0 km)
    const fogHighVis = '42867 11520 70000 10180 20170 40150 74582 333 10240 20150 555 00000=';
    const res = validateSingleTelegram(fogHighVis, '03Z');
    const fogIssue = res.issues.find((i) => i.ruleId === 'WX-002');
    assert.ok(fogIssue, 'WX-002 warning must be generated when fog is reported with VV >= 1.0 km');
    assert.equal(fogIssue.severity, 'warning');
    assert.ok(fogIssue.message.includes('Fog (ww=45) is reported but surface visibility is 2 km'));

    // Fog ww=45 with visibility VV=05 (0.5 km < 1.0 km) -> no warning
    const fogLowVis = '42867 11505 70000 10180 20170 40150 74582 333 10240 20150 555 00000=';
    const resGood = validateSingleTelegram(fogLowVis, '03Z');
    const fogIssueGood = resGood.issues.find((i) => i.ruleId === 'WX-002');
    assert.equal(fogIssueGood, undefined, 'Fog with VV < 1.0 km must not trigger WX-002 warning');
  });

  it('20. enforces SQU-001: Section 5 squall group (2DqFqqqt) is forbidden for full-time inland stations', () => {
    // Section 5 with squall group 23891
    const squallTelegram = '42867 11560 70000 10324 20215 40092 333 10425 20240 555 00000 23891=';
    const res = validateSingleTelegram(squallTelegram, '03Z');
    assert.ok(res.errorCount >= 1);
    const squallIssue = res.issues.find((i) => i.ruleId === 'SQU-001');
    assert.ok(squallIssue, 'SQU-001 must reject squall group in Section 5');
    assert.equal(squallIssue.severity, 'error');
    assert.ok(squallIssue.message.includes('Squall group 2DqFqqqt in Section 555 is not used'));
  });

  it('21. validates official worked example from IMD Weather Codebook Page 43', () => {
    // Page 43 Worked Example: AAXX 16034 42867 11560 70000 10324 20215 40092 333 10425 20240 555 00000=
    const report = validateSynopBulletin(
      'AAXX 16034\n42867 11560 70000 10324 20215 40092 333 10425 20240 555 00000=',
      '03Z'
    );
    assert.equal(report.totalTelegrams, 1);
    assert.equal(report.validTelegramsCount, 1);
    assert.equal(report.errorCount, 0);
    assert.equal(report.hasErrors, false);
    assert.equal(report.hasWarnings, false);
    assert.equal(report.allIssues.length, 0);
  });

  it('22. exports complete and immutable SYNOP_VALIDATION_RULES catalogue', () => {
    assert.ok(Array.isArray(SYNOP_VALIDATION_RULES));
    assert.ok(SYNOP_VALIDATION_RULES.length >= 13);
    const ruleIds = SYNOP_VALIDATION_RULES.map((r) => r.ruleId);
    assert.ok(ruleIds.includes('STR-001'));
    assert.ok(ruleIds.includes('STR-002'));
    assert.ok(ruleIds.includes('RNG-001'));
    assert.ok(ruleIds.includes('CLD-001'));
    assert.ok(ruleIds.includes('WND-001'));
    assert.ok(ruleIds.includes('TEM-001'));
    assert.ok(ruleIds.includes('RAI-001'));
    assert.ok(ruleIds.includes('RAI-002'));
    assert.ok(ruleIds.includes('PRE-001'));
    assert.ok(ruleIds.includes('WX-001'));
    assert.ok(ruleIds.includes('WX-002'));
    assert.ok(ruleIds.includes('SQU-001'));
    assert.ok(ruleIds.includes('PLU-001'));

    // Check immutability
    assert.throws(() => {
      // @ts-expect-error mutating readonly array
      SYNOP_VALIDATION_RULES.push({});
    });
  });
});
