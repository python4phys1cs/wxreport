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
});
