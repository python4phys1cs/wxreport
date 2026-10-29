/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMinimalDateParts,
  getSlotObservationStatus,
} from './observationStatus.ts';
import { shiftDateString } from '../components/SynopInput.tsx';
import { InMemoryObservationStore } from '../engine/observationStore.ts';
import { getDefaultReportSlot } from './timeSlot.ts';

describe('Minimal Observation View & Status Utilities', () => {
  describe('formatMinimalDateParts', () => {
    it('1. correctly extracts day number and month name in UTC-safe format', () => {
      const parts = formatMinimalDateParts('2026-10-24');
      assert.equal(parts.day, '24');
      assert.equal(parts.monthName, 'October');
      assert.equal(parts.year, '2026');
      assert.equal(parts.formattedIso, '2026-10-24');
    });

    it('2. handles single-digit days without leading zero for clean typography', () => {
      const parts = formatMinimalDateParts('2026-05-04');
      assert.equal(parts.day, '4');
      assert.equal(parts.monthName, 'May');
      assert.equal(parts.year, '2026');
    });

    it('3. handles leap year day (Feb 29) deterministically', () => {
      const parts = formatMinimalDateParts('2024-02-29');
      assert.equal(parts.day, '29');
      assert.equal(parts.monthName, 'February');
      assert.equal(parts.year, '2024');
    });

    it('4. handles month-end boundaries (Dec 31 and Jan 1)', () => {
      const dec = formatMinimalDateParts('2026-12-31');
      assert.equal(dec.day, '31');
      assert.equal(dec.monthName, 'December');

      const jan = formatMinimalDateParts('2027-01-01');
      assert.equal(jan.day, '1');
      assert.equal(jan.monthName, 'January');
    });

    it('5. returns safe fallbacks for missing or invalid dates', () => {
      const invalid = formatMinimalDateParts('');
      assert.equal(invalid.day, '--');
      assert.equal(invalid.monthName, '---');
    });
  });

  describe('shiftDateString navigation', () => {
    it('6. steps backward and forward across month boundaries', () => {
      assert.equal(shiftDateString('2026-10-24', -1), '2026-10-23');
      assert.equal(shiftDateString('2026-10-24', 1), '2026-10-25');
      // Month boundary: Nov 1 - 1 day = Oct 31
      assert.equal(shiftDateString('2026-11-01', -1), '2026-10-31');
      // Year boundary: Jan 1 - 1 day = Dec 31
      assert.equal(shiftDateString('2027-01-01', -1), '2026-12-31');
    });
  });

  describe('getSlotObservationStatus', () => {
    it('7. returns pending status when store contains no records for the date', () => {
      const store = new InMemoryObservationStore();
      const status03Z = getSlotObservationStatus('2026-10-24', '03Z', store);
      assert.equal(status03Z.isRecorded, false);
      assert.equal(status03Z.stationCount, 0);
      assert.equal(status03Z.statusLabel, 'Pending');

      const status12Z = getSlotObservationStatus('2026-10-24', '12Z', store);
      assert.equal(status12Z.isRecorded, false);
      assert.equal(status12Z.stationCount, 0);
      assert.equal(status12Z.statusLabel, 'Pending');
    });

    it('8. detects 03Z observations when morning data is ingested', () => {
      const store = new InMemoryObservationStore();
      store.setStationObservationFromServer('2026-10-24', '42867', {
        stationId: '42867',
        stationName: 'Nagpur',
        reportingDate: '2026-10-24',
        tmin: 19.4,
        dryBulb0830: 23.0,
        rainfall0830: 0,
      });

      const status03Z = getSlotObservationStatus('2026-10-24', '03Z', store);
      assert.equal(status03Z.isRecorded, true);
      assert.equal(status03Z.stationCount, 1);
      assert.equal(status03Z.statusLabel, 'Recorded (1 station)');

      // 12Z on the same date should still be pending
      const status12Z = getSlotObservationStatus('2026-10-24', '12Z', store);
      assert.equal(status12Z.isRecorded, false);
      assert.equal(status12Z.stationCount, 0);
      assert.equal(status12Z.statusLabel, 'Pending');
    });

    it('9. detects 12Z observations when evening data is ingested', () => {
      const store = new InMemoryObservationStore();
      store.setStationObservationFromServer('2026-10-24', '42867', {
        stationId: '42867',
        stationName: 'Nagpur',
        reportingDate: '2026-10-24',
        tmax: 33.2,
        dryBulb1730: 28.5,
      });

      const status12Z = getSlotObservationStatus('2026-10-24', '12Z', store);
      assert.equal(status12Z.isRecorded, true);
      assert.equal(status12Z.stationCount, 1);
      assert.equal(status12Z.statusLabel, 'Recorded (1 station)');
    });

    it('10. pluralizes station count correctly for multiple stations', () => {
      const store = new InMemoryObservationStore();
      store.setStationObservationFromServer('2026-10-24', '42867', {
        stationId: '42867',
        stationName: 'Nagpur',
        reportingDate: '2026-10-24',
        tmin: 19.4,
      });
      store.setStationObservationFromServer('2026-10-24', '42809', {
        stationId: '42809',
        stationName: 'Gondia',
        reportingDate: '2026-10-24',
        tmin: 18.0,
      });

      const status03Z = getSlotObservationStatus('2026-10-24', '03Z', store);
      assert.equal(status03Z.isRecorded, true);
      assert.equal(status03Z.stationCount, 2);
      assert.equal(status03Z.statusLabel, 'Recorded (2 stations)');
    });

    it('11. returns pending for an unrecorded date even if another date has observations', () => {
      const store = new InMemoryObservationStore();
      store.setStationObservationFromServer('2026-10-24', '42867', {
        stationId: '42867',
        stationName: 'Nagpur',
        reportingDate: '2026-10-24',
        tmin: 19.4,
      });

      // Checking 2026-10-25 (different date)
      const statusNextDay = getSlotObservationStatus('2026-10-25', '03Z', store);
      assert.equal(statusNextDay.isRecorded, false);
      assert.equal(statusNextDay.stationCount, 0);
      assert.equal(statusNextDay.statusLabel, 'Pending');
    });
  });

  describe('Subdivision-wise default selection', () => {
    it('12. prioritizes Vidarbha (id "26") as default subdivision when present', () => {
      const mockSubdivisions = [
        { subdivision: { id: '25', name: 'Marathwada' } },
        { subdivision: { id: '26', name: 'Vidarbha' } },
        { subdivision: { id: '24', name: 'Madhya Maharashtra' } },
      ];

      const defaultId = mockSubdivisions.some((s) => s.subdivision.id === '26')
        ? '26'
        : (mockSubdivisions[0]?.subdivision.id ?? 'all');

      assert.equal(defaultId, '26');
    });

    it('13. falls back to first subdivision when Vidarbha is not in the list', () => {
      const mockSubdivisions = [
        { subdivision: { id: '18', name: 'East MP' } },
        { subdivision: { id: '19', name: 'West MP' } },
      ];

      const defaultId = mockSubdivisions.some((s) => s.subdivision.id === '26')
        ? '26'
        : (mockSubdivisions[0]?.subdivision.id ?? 'all');

      assert.equal(defaultId, '18');
    });

    it('14. falls back to "all" when subdivision array is empty', () => {
      const mockSubdivisions: Array<{ subdivision: { id: string; name: string } }> = [];

      const defaultId = mockSubdivisions.some((s) => s.subdivision.id === '26')
        ? '26'
        : (mockSubdivisions[0]?.subdivision.id ?? 'all');

      assert.equal(defaultId, 'all');
    });
  });

  describe('03Z / 12Z Report Slot Auto-Default (14:00 IST cutoff)', () => {
    it('15. returns 03Z before 14:00 IST (e.g. 08:30 IST / 03:00 UTC)', () => {
      // 03:00 UTC = 08:30 IST
      const dateMorning = new Date('2026-10-27T03:00:00Z');
      assert.equal(getDefaultReportSlot(dateMorning), '03Z');
    });

    it('16. returns 03Z at 13:59 IST (08:29 UTC)', () => {
      // 08:29 UTC = 13:59 IST
      const dateJustBeforeCutoff = new Date('2026-10-27T08:29:00Z');
      assert.equal(getDefaultReportSlot(dateJustBeforeCutoff), '03Z');
    });

    it('17. returns 12Z at exactly 14:00 IST (08:30 UTC)', () => {
      // 08:30 UTC = 14:00 IST
      const dateAtCutoff = new Date('2026-10-27T08:30:00Z');
      assert.equal(getDefaultReportSlot(dateAtCutoff), '12Z');
    });

    it('18. returns 12Z during evening (e.g. 17:30 IST / 12:00 UTC)', () => {
      // 12:00 UTC = 17:30 IST
      const dateEvening = new Date('2026-10-27T12:00:00Z');
      assert.equal(getDefaultReportSlot(dateEvening), '12Z');
    });

    it('19. returns 12Z late evening (23:59 IST / 18:29 UTC)', () => {
      // 18:29 UTC = 23:59 IST
      const dateLate = new Date('2026-10-27T18:29:00Z');
      assert.equal(getDefaultReportSlot(dateLate), '12Z');
    });
  });

  describe('03Z vs 12Z Status Isolation and Siloing', () => {
    it('20. 03Z Section 333 Tmax does NOT trigger 12Z Recorded status', () => {
      const store = new InMemoryObservationStore();
      // Record only 03Z observation which includes previous-day Section 333 Tmax
      store.setStationObservationFromServer('2026-10-24', '42867', {
        stationId: '42867',
        stationName: 'Nagpur',
        reportingDate: '2026-10-24',
        has03Z: true,
        tmin: 19.4,
        dryBulb0830: 23.0,
        rainfall0830: 0,
        tmax: 34.0, // Stored from Section 333
        tmax03Z: 34.0,
        tmaxSlot: '03Z',
      });

      const status03Z = getSlotObservationStatus('2026-10-24', '03Z', store);
      assert.equal(status03Z.isRecorded, true);
      assert.equal(status03Z.statusLabel, 'Recorded (1 station)');

      // 12Z must remain Pending even though obs.tmax is set from 03Z
      const status12Z = getSlotObservationStatus('2026-10-24', '12Z', store);
      assert.equal(status12Z.isRecorded, false);
      assert.equal(status12Z.stationCount, 0);
      assert.equal(status12Z.statusLabel, 'Pending');
    });

    it('21. 12Z 1730 rainfall does NOT trigger 03Z Recorded status', () => {
      const store = new InMemoryObservationStore();
      // Record only 12Z observation which includes 1730 IST rainfall
      store.setStationObservationFromServer('2026-10-24', '42867', {
        stationId: '42867',
        stationName: 'Nagpur',
        reportingDate: '2026-10-24',
        has12Z: true,
        tmax: 33.5,
        tmax12Z: 33.5,
        tmaxSlot: '12Z',
        rh1730: 45,
        dryBulb1730: 28.0,
        rainfall: 5.0, // Generic display rainfall set by 12Z
        rainfall1730: 5.0,
      });

      const status12Z = getSlotObservationStatus('2026-10-24', '12Z', store);
      assert.equal(status12Z.isRecorded, true);
      assert.equal(status12Z.statusLabel, 'Recorded (1 station)');

      // 03Z must remain Pending even though obs.rainfall is set from 12Z
      const status03Z = getSlotObservationStatus('2026-10-24', '03Z', store);
      assert.equal(status03Z.isRecorded, false);
      assert.equal(status03Z.stationCount, 0);
      assert.equal(status03Z.statusLabel, 'Pending');
    });

    it('22. Ingesting raw 03Z bulletin marks 03Z Recorded and leaves 12Z Pending', () => {
      const store = new InMemoryObservationStore();
      const raw03Z = 'AAXX 24034\n42867 11560 82701 10230 20170 39850 40120 52015 60002 85670 333 10340 20194=';
      store.ingestBulletin('03Z', raw03Z, '2026-10-24');

      const status03Z = getSlotObservationStatus('2026-10-24', '03Z', store);
      assert.equal(status03Z.isRecorded, true);
      assert.equal(status03Z.stationCount, 1);
      assert.equal(status03Z.statusLabel, 'Recorded (1 station)');

      const status12Z = getSlotObservationStatus('2026-10-24', '12Z', store);
      assert.equal(status12Z.isRecorded, false);
      assert.equal(status12Z.stationCount, 0);
      assert.equal(status12Z.statusLabel, 'Pending');
    });

    it('23. Ingesting raw 12Z bulletin marks 12Z Recorded and leaves 03Z Pending', () => {
      const store = new InMemoryObservationStore();
      const raw12Z = 'AAXX 24124\n42867 11560 82701 10290 20180 39850 40120 52015 333 10335=';
      store.ingestBulletin('12Z', raw12Z, '2026-10-24');

      const status12Z = getSlotObservationStatus('2026-10-24', '12Z', store);
      assert.equal(status12Z.isRecorded, true);
      assert.equal(status12Z.stationCount, 1);
      assert.equal(status12Z.statusLabel, 'Recorded (1 station)');

      const status03Z = getSlotObservationStatus('2026-10-24', '03Z', store);
      assert.equal(status03Z.isRecorded, false);
      assert.equal(status03Z.stationCount, 0);
      assert.equal(status03Z.statusLabel, 'Pending');
    });
  });
});
