/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SubdivisionReportData } from '../engine/reportOrchestrator.ts';

/**
 * Canonical Operational Subdivision order for Consolidated Report and Weather Summary Report:
 * 1. Vidarbha ('26')
 * 2. West Madhya Pradesh ('19')
 * 3. East Madhya Pradesh ('20')
 * 4. Chhattisgarh ('27')
 */
export const OPERATIONAL_REPORT_SUBDIVISION_ORDER: readonly string[] = Object.freeze([
  '26', // 1. Vidarbha
  '19', // 2. West Madhya Pradesh
  '20', // 3. East Madhya Pradesh
  '27', // 4. Chhattisgarh / Chattisgarh
]);

/**
 * Sorts subdivision report data according to the exact operational sequence:
 * 1. Vidarbha
 * 2. West Madhya Pradesh
 * 3. East Madhya Pradesh
 * 4. Chhattisgarh
 * Any additional subdivisions are appended deterministically in alphabetical order.
 */
export function sortSubdivisionsForOperationalReports(
  subdivisions: readonly SubdivisionReportData[]
): SubdivisionReportData[] {
  return [...subdivisions].sort((a, b) => {
    const idxA = OPERATIONAL_REPORT_SUBDIVISION_ORDER.indexOf(String(a.subdivision.id));
    const idxB = OPERATIONAL_REPORT_SUBDIVISION_ORDER.indexOf(String(b.subdivision.id));

    if (idxA !== -1 && idxB !== -1) {
      return idxA - idxB;
    }
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    return a.subdivision.name.localeCompare(b.subdivision.name, 'en', { sensitivity: 'base' });
  });
}

/**
 * Deterministically sorts station rows alphabetically by station/observatory name (case-insensitive).
 * Uses canonical stationId as secondary tie-breaker if names match.
 */
export function sortStationsAlphabetically<T extends { stationName: string; stationId?: string }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort((a, b) => {
    const nameA = a.stationName.trim();
    const nameB = b.stationName.trim();
    const cmp = nameA.localeCompare(nameB, 'en', { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    if (a.stationId && b.stationId) {
      return a.stationId.localeCompare(b.stationId);
    }
    return 0;
  });
}
