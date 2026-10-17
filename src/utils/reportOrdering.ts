/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SubdivisionReportData } from '../engine/reportOrchestrator.ts';

/**
 * Exact operational subdivision order required for WXOps reports:
 * 1. Vidarbha ('26')
 * 2. West Madhya Pradesh ('19')
 * 3. East Madhya Pradesh ('20')
 * 4. Chhattisgarh ('27')
 */
export const OPERATIONAL_REPORT_SUBDIVISION_ORDER: readonly string[] = Object.freeze([
  '26', // Vidarbha
  '19', // West Madhya Pradesh
  '20', // East Madhya Pradesh
  '27', // Chhattisgarh
]);

/**
 * Deterministically orders subdivisions and station rows:
 * 1. Subdivisions in exact operational order: Vidarbha -> West MP -> East MP -> Chhattisgarh
 * 2. Stations in deterministic, case-insensitive alphabetical order by station name.
 */
export function orderSubdivisionsAndStationsForReport(
  subdivisions: readonly SubdivisionReportData[]
): SubdivisionReportData[] {
  return [...subdivisions]
    .sort((a, b) => {
      const idxA = OPERATIONAL_REPORT_SUBDIVISION_ORDER.indexOf(String(a.subdivision.id));
      const idxB = OPERATIONAL_REPORT_SUBDIVISION_ORDER.indexOf(String(b.subdivision.id));
      const orderA = idxA === -1 ? 999 : idxA;
      const orderB = idxB === -1 ? 999 : idxB;
      return orderA - orderB;
    })
    .map((subData) => ({
      ...subData,
      report1Rows: [...subData.report1Rows].sort((a, b) =>
        a.stationName.localeCompare(b.stationName, undefined, { sensitivity: 'base' })
      ),
    }));
}
