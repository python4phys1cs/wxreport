/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ObservationStore, UtcSlot, PersistedStationObservation } from '../engine/observationStore.ts';

export interface SlotStatusResult {
  isRecorded: boolean;
  stationCount: number;
  statusLabel: string;
}

/**
 * Evaluates whether valid meteorological observations exist in the store
 * for the specified reporting date and observation slot.
 */
export function getSlotObservationStatus(
  reportingDate: string,
  slot: UtcSlot,
  store: ObservationStore
): SlotStatusResult {
  if (!reportingDate || !store) {
    return { isRecorded: false, stationCount: 0, statusLabel: 'Pending' };
  }

  const obsMap = store.getAllObservations(reportingDate);
  let count = 0;

  for (const obs of obsMap.values()) {
    if (!obs) continue;

    if (slot === '03Z') {
      const has03Z =
        obs.has03Z ||
        (obs.tmin !== null && obs.tmin !== undefined) ||
        (obs.dryBulb0830 !== null && obs.dryBulb0830 !== undefined) ||
        (obs.rainfall0830 !== null && obs.rainfall0830 !== undefined) ||
        (obs.rainfall !== null && obs.rainfall !== undefined) ||
        (obs.mslPressure0830 !== null && obs.mslPressure0830 !== undefined);
      if (has03Z) count++;
    } else {
      // 12Z observation slot
      const has12Z =
        obs.has12Z ||
        (obs.tmax !== null && obs.tmax !== undefined) ||
        (obs.dryBulb1730 !== null && obs.dryBulb1730 !== undefined) ||
        (obs.rainfall1730 !== null && obs.rainfall1730 !== undefined) ||
        (obs.mslPressure1730 !== null && obs.mslPressure1730 !== undefined);
      if (has12Z) count++;
    }
  }

  const isRecorded = count > 0;
  const statusLabel = isRecorded
    ? `Recorded (${count} ${count === 1 ? 'station' : 'stations'})`
    : 'Pending';

  return {
    isRecorded,
    stationCount: count,
    statusLabel,
  };
}

export interface MinimalDateParts {
  day: string;
  monthName: string;
  year: string;
  formattedIso: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Extracts the day of the month (e.g. "24") and month name (e.g. "October")
 * in a UTC-safe, timezone-independent manner.
 */
export function formatMinimalDateParts(dateStr: string): MinimalDateParts {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { day: '--', monthName: '---', year: '----', formattedIso: dateStr };
  }

  const parts = dateStr.split('-').map(Number);
  const [year, monthNum, dayNum] = parts;
  const monthIdx = Math.max(0, Math.min(11, monthNum - 1));

  return {
    day: String(dayNum),
    monthName: MONTH_NAMES[monthIdx] || '',
    year: String(year),
    formattedIso: dateStr,
  };
}
