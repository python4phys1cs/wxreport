/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UtcSlot } from '../engine/observationStore.ts';
export type { UtcSlot };
import { getKolkataCalendarDetails } from '../engine/climatology.ts';

/**
 * Returns the current time components in Asia/Kolkata (IST).
 */
export function getKolkataTimeComponents(dateInput: Date = new Date()): {
  hour: number;
  minute: number;
  second: number;
  timeStr: string;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(dateInput);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const second = parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10);

  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} IST`;
  return { hour, minute, second, timeStr };
}

/**
 * Formats the unified operational clock strictly as:
 * DD/MM/YYYY HH:MM IST | HH:MM UTC
 * Example: 06/10/2026 17:15 IST | 11:45 UTC
 */
export function formatOperationalClock(dateInput: Date = new Date()): string {
  // Asia/Kolkata components
  const istFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const istParts = istFormatter.formatToParts(dateInput);
  const day = istParts.find((p) => p.type === 'day')?.value ?? '01';
  const month = istParts.find((p) => p.type === 'month')?.value ?? '01';
  const year = istParts.find((p) => p.type === 'year')?.value ?? '2026';
  const istHour = istParts.find((p) => p.type === 'hour')?.value ?? '00';
  const istMin = istParts.find((p) => p.type === 'minute')?.value ?? '00';

  // UTC components
  const utcFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const utcParts = utcFormatter.formatToParts(dateInput);
  const utcHour = utcParts.find((p) => p.type === 'hour')?.value ?? '00';
  const utcMin = utcParts.find((p) => p.type === 'minute')?.value ?? '00';

  return `${day}/${month}/${year} ${istHour}:${istMin} IST | ${utcHour}:${utcMin} UTC`;
}

/**
 * Information payload for an observation reminder popup.
 */
export interface ObservationReminderInfo {
  slot: UtcSlot;
  timeLabel: string;
  title: string;
  message: string;
  reminderKey: string;
}

/**
 * Checks whether an observation reminder popup should trigger for the given timestamp.
 * - 08:30 IST Observation: 08:30 – 09:30 IST window for 03 UTC.
 * - 17:30 IST Observation: 17:30 – 18:00 IST window for 12 UTC.
 * Respects already dismissed reminder keys (e.g. ['2026-10-06_03Z']).
 */
export function checkObservationReminder(
  dateInput: Date = new Date(),
  dismissedKeys: Set<string> | string[] = []
): ObservationReminderInfo | null {
  const dismissedSet = Array.isArray(dismissedKeys) ? new Set(dismissedKeys) : dismissedKeys;
  const todayIst = getTodayKolkata(dateInput);
  const { hour, minute } = getKolkataTimeComponents(dateInput);
  const totalMins = hour * 60 + minute;

  // Morning observation: 08:30 IST (510 min) up to 09:30 IST (570 min)
  if (totalMins >= 8 * 60 + 30 && totalMins <= 9 * 60 + 30) {
    const reminderKey = `${todayIst}_03Z`;
    if (!dismissedSet.has(reminderKey)) {
      return {
        slot: '03Z',
        timeLabel: '08:30 IST',
        title: '08:30 IST Observation Due',
        message: 'Please enter the latest 03 UTC observation.',
        reminderKey,
      };
    }
  }

  // Evening observation: 17:30 IST (1050 min) up to 18:00 IST (1080 min)
  if (totalMins >= 17 * 60 + 30 && totalMins <= 18 * 60) {
    const reminderKey = `${todayIst}_12Z`;
    if (!dismissedSet.has(reminderKey)) {
      return {
        slot: '12Z',
        timeLabel: '17:30 IST',
        title: '17:30 IST Observation Due',
        message: 'Please enter the latest 12 UTC observation.',
        reminderKey,
      };
    }
  }

  return null;
}

/**
 * Automatically resolves the active observation slot based on current Asia/Kolkata time.
 * Rules:
 * - 03 UTC / 0830 IST: Active within 3-hour operational window around morning observation (07:00 to < 10:00 IST).
 * - 12 UTC / 1730 IST: Active within 3-hour operational window around evening observation (16:30 to < 19:30 IST).
 * - Outside these windows: Returns null (preserving manual user selection).
 */
export function getAutoUtcSlot(dateInput: Date = new Date()): UtcSlot | null {
  const { hour, minute } = getKolkataTimeComponents(dateInput);
  const minutesSinceMidnight = hour * 60 + minute;

  // 3-hour window around 0830 IST: 07:00 (420 min) to < 10:00 (600 min)
  if (minutesSinceMidnight >= 7 * 60 && minutesSinceMidnight < 10 * 60) {
    return '03Z';
  }

  // 3-hour window around 1730 IST: 16:30 (990 min) to < 19:30 (1170 min)
  if (minutesSinceMidnight >= 16 * 60 + 30 && minutesSinceMidnight < 19 * 60 + 30) {
    return '12Z';
  }

  return null;
}

/**
 * Automatically determines the default operational report slot:
 * - Till 14:00 IST (< 14:00): 03Z report by default
 * - At or after 14:00 IST (>= 14:00): 12Z report by default
 */
export function getDefaultReportSlot(dateInput: Date = new Date()): UtcSlot {
  const { hour } = getKolkataTimeComponents(dateInput);
  return hour >= 14 ? '12Z' : '03Z';
}

/**
 * Returns today's date in YYYY-MM-DD strictly in Asia/Kolkata (IST).
 */
export function getTodayKolkata(dateInput: Date = new Date()): string {
  try {
    return getKolkataCalendarDetails(dateInput).dateStr;
  } catch {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(dateInput);
  }
}

/**
 * Formats a YYYY-MM-DD date string into an operational display label (e.g. "05-Jan-2026").
 */
export function formatOperationalDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [year, month, day] = dateStr.split('-');
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const mIdx = parseInt(month, 10) - 1;
  const mName = monthNames[mIdx] ?? month;
  return `${day}-${mName}-${year}`;
}
