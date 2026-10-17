/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SubdivisionReportData } from '../engine/reportOrchestrator.ts';
import type { SubdivisionReportSummary } from '../engine/reportCalculations.ts';
import { CANONICAL_STATIONS } from '../constants/stationRegistry.ts';
import { sortSubdivisionsForOperationalReports } from '../utils/stationSort.ts';
import {
  ForecasterSummaryTable,
  DistrictForecastTable,
} from './ForecasterForecastTables.tsx';

/**
 * Formats a comma- or "and"-separated station/district string into:
 * - Upper case district name(s)
 * - Comma-separated with "and" before the final item for ties
 * Example: "Nagpur" -> "NAGPUR"
 * Example: "Bhandara, Gondia" -> "BHANDARA and GONDIA"
 * Example: "District One, District Two, District Three" -> "DISTRICT ONE, DISTRICT TWO and DISTRICT THREE"
 */
export function formatExtremeDistrictList(stationNamesStr: string): string {
  if (!stationNamesStr || stationNamesStr === '---') return '';
  const tokens = stationNamesStr
    .split(/,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const districts = tokens.map((token) => {
    const stn = CANONICAL_STATIONS.find(
      (s) =>
        s.name.toLowerCase() === token.toLowerCase() ||
        (s.district && s.district.toLowerCase() === token.toLowerCase())
    );
    return (stn?.district || token).toUpperCase();
  });

  const unique = Array.from(new Set(districts));
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

export interface FormattedSummaryExtreme {
  valueLine: string;
  districtsLine: string;
  fullText: string;
}

/**
 * Formats a subdivision extreme for Weather Summary report:
 * Value line: "XX.X at"
 * Following line: uppercase district names with tie-handling
 */
export function formatSummaryExtreme(
  extreme?: { value: number | null; stationNames: string } | null,
  options?: { isRainfall?: boolean }
): FormattedSummaryExtreme {
  if (!extreme || extreme.value === null || extreme.value === undefined) {
    return { valueLine: '---', districtsLine: '', fullText: '---' };
  }

  const valNum = Number(extreme.value);
  const formattedVal = valNum.toFixed(1);

  if (options?.isRainfall && valNum === 0) {
    return {
      valueLine: '0.0',
      districtsLine: '',
      fullText: '0.0',
    };
  }

  const districts = formatExtremeDistrictList(extreme.stationNames);
  if (!districts) {
    return {
      valueLine: formattedVal,
      districtsLine: '',
      fullText: formattedVal,
    };
  }

  const valueLine = `${formattedVal} at`;
  const fullText = `${valueLine}\n${districts}`;

  return {
    valueLine,
    districtsLine: districts,
    fullText,
  };
}

export interface Report2Props {
  subdivisions: SubdivisionReportData[];
  reportingDate: string;
  showHeatWaveCount?: boolean;
  showColdWaveCount?: boolean;
  /** @deprecated Backwards compatibility */
  showHeatColdWaveCount?: boolean;
}

export const Report2SummaryTable: React.FC<Report2Props> = ({
  subdivisions,
  reportingDate,
  showHeatWaveCount,
  showColdWaveCount,
  showHeatColdWaveCount,
}) => {
  const isHeatWaveVisible = showHeatWaveCount ?? showHeatColdWaveCount ?? true;
  const isColdWaveVisible = showColdWaveCount ?? showHeatColdWaveCount ?? true;
  const orderedSubdivisions = sortSubdivisionsForOperationalReports(subdivisions);

  return (
    <section className="report-section" aria-label="Subdivision Realised Weather Summary">
      <div className="table-wrapper">
        <table className="op-table" aria-label="Subdivision Realised Weather Summary Table">
          <thead>
            <tr>
              <th rowSpan={2} className="col-station">Subdivision</th>
              <th colSpan={isHeatWaveVisible ? 4 : 3}>Maximum Temperature</th>
              <th colSpan={isColdWaveVisible ? 4 : 3}>Minimum Temperature</th>
              <th colSpan={2}>Rainfall</th>
            </tr>
            <tr>
              <th>24h Chg</th>
              <th>Dep Class</th>
              <th>Highest Tmax</th>
              {isHeatWaveVisible && <th>Heat Wave</th>}
              <th>24h Chg</th>
              <th>Dep Class</th>
              <th>Lowest Tmin</th>
              {isColdWaveVisible && <th>Cold Wave</th>}
              <th>Highest</th>
              <th>Distribution</th>
            </tr>
          </thead>
          <tbody>
            {orderedSubdivisions.map((subData) => {
              const summary: SubdivisionReportSummary = subData.report2Summary;
              const maxTExtreme = formatSummaryExtreme(summary.highestTmax);
              const minTExtreme = formatSummaryExtreme(summary.lowestTmin);
              const rfExtreme = formatSummaryExtreme(summary.heaviestRainfall, { isRainfall: true });

              return (
                <tr key={summary.subdivisionId}>
                  <td className="cell-station">{summary.subdivisionName}</td>

                  {/* Maximum Temperature */}
                  <td className="cell-value">{summary.tmax24hChangeClass}</td>
                  <td className="cell-value">{summary.tmaxDepartureClass}</td>
                  <td className="cell-extreme">
                    {maxTExtreme.districtsLine ? (
                      <div className="summary-extreme-container">
                        <div className="extreme-value-line">{maxTExtreme.valueLine}</div>
                        <div className="extreme-districts-line">{maxTExtreme.districtsLine}</div>
                      </div>
                    ) : (
                      maxTExtreme.valueLine
                    )}
                  </td>
                  {isHeatWaveVisible && (
                    <td>
                      {summary.isHeatWaveSeason
                        ? `${summary.heatWaveStationsCount} / ${summary.heatWaveStationsTotal}`
                        : 'N/A'}
                    </td>
                  )}

                  {/* Minimum Temperature */}
                  <td className="cell-value">{summary.tmin24hChangeClass}</td>
                  <td className="cell-value">{summary.tminDepartureClass}</td>
                  <td className="cell-extreme">
                    {minTExtreme.districtsLine ? (
                      <div className="summary-extreme-container">
                        <div className="extreme-value-line">{minTExtreme.valueLine}</div>
                        <div className="extreme-districts-line">{minTExtreme.districtsLine}</div>
                      </div>
                    ) : (
                      minTExtreme.valueLine
                    )}
                  </td>
                  {isColdWaveVisible && (
                    <td>
                      {summary.isColdWaveSeason
                        ? `${summary.coldWaveStationsCount} / ${summary.coldWaveStationsTotal}`
                        : 'N/A'}
                    </td>
                  )}

                  {/* Rainfall */}
                  <td className="cell-extreme">
                    {rfExtreme.districtsLine ? (
                      <div className="summary-extreme-container">
                        <div className="extreme-value-line">{rfExtreme.valueLine}</div>
                        <div className="extreme-districts-line">{rfExtreme.districtsLine}</div>
                      </div>
                    ) : (
                      rfExtreme.valueLine
                    )}
                  </td>
                  <td
                    style={{
                      backgroundColor:
                        summary.rainfallDistributionColor !== '#ffffff'
                          ? summary.rainfallDistributionColor
                          : undefined,
                      fontWeight: 600,
                    }}
                  >
                    {summary.rainfallDistributionClass} ({summary.rainfallPercent}%)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Forecaster 7-Day Spatial Rainfall Forecast Worksheet */}
      <ForecasterSummaryTable reportingDate={reportingDate} />

      {/* Forecaster District-wise 7-Day Forecast Worksheet */}
      <DistrictForecastTable reportingDate={reportingDate} />
    </section>
  );
};
