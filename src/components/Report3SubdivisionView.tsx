/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { SubdivisionReportData } from '../engine/reportOrchestrator.ts';
import type { StationReportRow, SubdivisionReportSummary } from '../engine/reportCalculations.ts';
import type { UtcSlot } from '../utils/timeSlot.ts';
import { sortStationsAlphabetically } from '../utils/stationSort.ts';
import { CANONICAL_STATIONS } from '../constants/stationRegistry.ts';
import type { EditableStationField } from './Report1StationTable.tsx';
import { shiftDateString } from './SynopInput.tsx';

interface Report3SubdivisionProps {
  subdivisions: SubdivisionReportData[];
  reportingDate: string;
  eveningDate: string;
  reportSlot?: UtcSlot;
  isEditMode?: boolean;
  showVisibility?: boolean;
  onUpdateStationValue?: (
    stationId: string,
    field: EditableStationField,
    value: number | null
  ) => void;
}

function formatChange(change: number | null): string {
  if (change === null || change === undefined) return '---';
  if (change > 0) return `+${change.toFixed(1)}`;
  return change.toFixed(1);
}

function formatValue(val: number | null, decimals = 1): string {
  if (val === null || val === undefined) return '---';
  return val.toFixed(decimals);
}

/**
 * Cleans station names by stripping parenthetical classifications/codes (e.g. "(MBN)", "(Normal)", "(WS)"),
 * resolving against the canonical station registry for district/station names, and uppercase formatting.
 */
export function cleanExtremeStationList(stationNamesStr: string): string {
  if (!stationNamesStr || stationNamesStr === '---') return '---';
  const tokens = stationNamesStr
    .split(/,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const cleanedNames = tokens.map((token) => {
    const baseName = token.replace(/\s*\([^)]*\)/g, '').trim();
    const stn = CANONICAL_STATIONS.find(
      (s) =>
        s.name.toLowerCase() === baseName.toLowerCase() ||
        s.name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase() === baseName.toLowerCase() ||
        (s.district && s.district.toLowerCase() === baseName.toLowerCase())
    );
    const resolved = stn ? (stn.district || stn.name).replace(/\s*\([^)]*\)/g, '').trim() : baseName;
    return resolved.toUpperCase();
  });

  const unique = Array.from(new Set(cleanedNames));
  if (unique.length === 0) return '---';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

/**
 * Formats subdivision summary labels to:
 * "Max: 35.4 °C at MORENA"
 * "Min: 19.1 °C at UJJAIN"
 * "Rainfall: 79.0 mm at RAJGARH"
 */
export function formatSubdivisionSummaryLabel(
  param: 'Max' | 'Min' | 'Rainfall',
  extreme?: { value: number | null; stationNames: string } | null
): string {
  if (!extreme || extreme.value === null || extreme.value === undefined || isNaN(extreme.value)) {
    return '---';
  }
  const valNum = Number(extreme.value);
  const formattedVal = valNum.toFixed(1);
  const unit = param === 'Rainfall' ? 'mm' : '°C';

  // When every station's rainfall is 0.0 mm, show '0.0 mm' without listing station names
  if (param === 'Rainfall' && valNum === 0) {
    return `${formattedVal} ${unit}`;
  }

  const stations = cleanExtremeStationList(extreme.stationNames);
  if (!stations || stations === '---') {
    return `${formattedVal} ${unit}`;
  }
  return `${formattedVal} ${unit} at ${stations}`;
}

export const Report3SubdivisionView: React.FC<Report3SubdivisionProps> = ({
  subdivisions,
  reportingDate,
  eveningDate,
  reportSlot = '03Z',
  isEditMode = false,
  showVisibility = false,
  onUpdateStationValue,
}) => {
  const is03Z = reportSlot !== '12Z';
  const yesterdayDate = eveningDate || (reportingDate ? shiftDateString(reportingDate, -1) : '');
  const todayDate = reportingDate || '';

  // Make Vidarbha (subdivision id '26') the default and first focused subdivision
  const [selectedSubId, setSelectedSubId] = useState<string>(() => {
    const hasVidarbha = subdivisions.some((s) => s.subdivision.id === '26');
    return hasVidarbha ? '26' : (subdivisions[0]?.subdivision.id ?? 'all');
  });

  const displayedSubdivisions =
    selectedSubId === 'all'
      ? subdivisions
      : subdivisions.filter((s) => s.subdivision.id === selectedSubId);

  return (
    <section className="report-section" aria-labelledby="report3-heading">
      <div className="report-section-header">
        <h2 id="report3-heading" className="report-title">
          Subdivision-wise Observation Report
        </h2>
        <div className="report-meta">
          Regional subdivision breakdown and observations for 24 hours ending {is03Z ? '0830' : '1730'} IST on {reportingDate}
        </div>
      </div>

      {/* Subdivision Filter Bar (No-Print) */}
      <div className="subdivision-filter-bar no-print" role="tablist" aria-label="Subdivision selector">
        <button
          type="button"
          className={`btn-sub-tab ${selectedSubId === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedSubId('all')}
          role="tab"
          aria-selected={selectedSubId === 'all'}
        >
          All Subdivisions ({subdivisions.length})
        </button>
        {subdivisions.map((sub) => (
          <button
            key={sub.subdivision.id}
            type="button"
            className={`btn-sub-tab ${selectedSubId === sub.subdivision.id ? 'active' : ''}`}
            onClick={() => setSelectedSubId(sub.subdivision.id)}
            role="tab"
            aria-selected={selectedSubId === sub.subdivision.id}
          >
            {sub.subdivision.name} ({sub.reportingStationsCount})
          </button>
        ))}
      </div>

      {displayedSubdivisions.map((subData) => {
        const summary: SubdivisionReportSummary = subData.report2Summary;
        const sortedStationRows = sortStationsAlphabetically(subData.report1Rows);

        return (
          <div key={subData.subdivision.id} className="subdivision-block">
            {/* Subdivision Banner */}
            <div className="subdivision-block-header">
              <div className="sub-title">
                {subData.subdivision.name} <span className="sub-count">({subData.reportingStationsCount} stations)</span>
              </div>
              <div className="sub-summary-chips">
                <span className="summary-item">
                  <strong>Max:</strong> {formatSubdivisionSummaryLabel('Max', summary.highestTmax)}
                </span>
                <span className="summary-sep">|</span>
                <span className="summary-item">
                  <strong>Min:</strong> {formatSubdivisionSummaryLabel('Min', summary.lowestTmin)}
                </span>
                <span className="summary-sep">|</span>
                <span className="summary-item">
                  <strong>Rainfall:</strong> {formatSubdivisionSummaryLabel('Rainfall', summary.heaviestRainfall)}
                </span>
              </div>
            </div>

            {/* Station Table for this Subdivision */}
            <div className="table-wrapper">
              <table
                className={`op-table ${isEditMode ? 'table-in-edit-mode' : ''}`}
                aria-label={`${subData.subdivision.name} Stations Table`}
              >
                {is03Z ? (
                  showVisibility ? (
                    <colgroup>
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '8%' }} />
                    </colgroup>
                  ) : (
                    <colgroup>
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '11%' }} />
                    </colgroup>
                  )
                ) : (
                  showVisibility ? (
                    <colgroup>
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '7.5%' }} />
                    </colgroup>
                  ) : (
                    <colgroup>
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '7.5%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '8.5%' }} />
                    </colgroup>
                  )
                )}
                <thead>
                  <tr>
                    <th rowSpan={3} className="col-station">City / Observatory</th>
                    <th colSpan={3}>Maximum Temperature (°C)</th>
                    <th colSpan={3}>Minimum Temperature (°C)</th>
                    <th colSpan={is03Z ? 1 : 2}>Relative Humidity (%)</th>
                    {showVisibility && <th rowSpan={2}>Visibility</th>}
                    <th colSpan={is03Z ? 1 : 2} rowSpan={is03Z ? 2 : 1}>Rainfall (mm)</th>
                  </tr>
                  <tr>
                    <th>Max</th>
                    <th>24h Chg</th>
                    <th>Dep</th>
                    <th>Min</th>
                    <th>24h Chg</th>
                    <th>Dep</th>
                    <th>at 0830 IST</th>
                    {!is03Z && <th>at 1730 IST</th>}
                    {!is03Z && <th className="col-rain-sub">Last 24 Hours up to 0830 hrs IST</th>}
                    {!is03Z && <th className="col-rain-sub">Last 9 Hours up to 1730 hrs IST</th>}
                  </tr>
                  <tr className="header-date-row">
                    <th colSpan={3} className="header-date-cell">Observed on {is03Z ? yesterdayDate : todayDate}</th>
                    <th
                      colSpan={3 + (is03Z ? 1 : 2) + (showVisibility ? 1 : 0) + (is03Z ? 1 : 2)}
                      className="header-date-cell"
                    >Observed on {todayDate}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStationRows.map((row: StationReportRow) => {
                    const hasData =
                      row.tmin !== null ||
                      row.tmax !== null ||
                      row.rainfall !== null ||
                      row.rainfall0830 !== null ||
                      row.rainfall1730 !== null ||
                      row.rh0830 !== null;

                    return (
                      <tr key={row.stationId}>
                        <td className="cell-station">{row.stationName.toUpperCase()}</td>

                        {/* Maximum Temperature */}
                        <td
                          className="cell-value"
                          style={{
                            backgroundColor:
                              !isEditMode && row.tmaxColor !== '#ffffee' && row.tmaxColor !== 'white'
                                ? row.tmaxColor
                                : undefined,
                          }}
                        >
                          {isEditMode ? (
                            <input
                              type="number"
                              step="0.1"
                              className={`edit-cell-input ${row.manualEdits?.tmax ? 'is-manually-edited' : ''}`}
                              value={row.tmax !== null && row.tmax !== undefined ? row.tmax : ''}
                              onChange={(e) => {
                                const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
                                onUpdateStationValue?.(row.stationId, 'tmax', isNaN(val as number) ? null : val);
                              }}
                               aria-label={`Max temperature for ${row.stationName}`}
                             />
                           ) : (
                            <span className="value-with-edit-tag">
                              {formatValue(row.tmax)}
                            </span>
                          )}
                        </td>
                        <td className="cell-value">{formatChange(row.tmax24hChange)}</td>
                        <td className="cell-value">{row.tmaxDeparture ?? '---'}</td>

                        {/* Minimum Temperature */}
                        <td
                          className="cell-value"
                          style={{
                            backgroundColor:
                              !isEditMode && row.tminColor !== '#ffffee' && row.tminColor !== 'white'
                                ? row.tminColor
                                : undefined,
                          }}
                        >
                          {isEditMode ? (
                            <input
                              type="number"
                              step="0.1"
                              className={`edit-cell-input ${row.manualEdits?.tmin ? 'is-manually-edited' : ''}`}
                              value={row.tmin !== null && row.tmin !== undefined ? row.tmin : ''}
                              onChange={(e) => {
                                const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
                                onUpdateStationValue?.(row.stationId, 'tmin', isNaN(val as number) ? null : val);
                              }}
                              aria-label={`Min temperature for ${row.stationName}`}
                            />
                          ) : (
                            <span className="value-with-edit-tag">
                              {formatValue(row.tmin)}
                            </span>
                          )}
                        </td>
                        <td className="cell-value">{formatChange(row.tmin24hChange)}</td>
                        <td className="cell-value">{row.tminDeparture ?? '---'}</td>

                        {/* Relative Humidity */}
                        <td className="cell-value">
                          {isEditMode ? (
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="100"
                              className={`edit-cell-input ${row.manualEdits?.rh0830 ? 'is-manually-edited' : ''}`}
                              value={row.rh0830 !== null && row.rh0830 !== undefined ? row.rh0830 : ''}
                              onChange={(e) => {
                                const val = e.target.value.trim() === '' ? null : parseInt(e.target.value, 10);
                                onUpdateStationValue?.(row.stationId, 'rh0830', isNaN(val as number) ? null : val);
                              }}
                              aria-label={`0830 RH for ${row.stationName}`}
                            />
                          ) : row.rh0830 !== null ? (
                            <span className="value-with-edit-tag">
                              {`${row.rh0830}%`}
                            </span>
                          ) : (
                            '---'
                          )}
                        </td>
                        {!is03Z && (
                          <td className="cell-value">
                            {isEditMode ? (
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                className={`edit-cell-input ${row.manualEdits?.rh1730 ? 'is-manually-edited' : ''}`}
                                value={row.rh1730 !== null && row.rh1730 !== undefined ? row.rh1730 : ''}
                                onChange={(e) => {
                                  const val = e.target.value.trim() === '' ? null : parseInt(e.target.value, 10);
                                  onUpdateStationValue?.(row.stationId, 'rh1730', isNaN(val as number) ? null : val);
                                }}
                                aria-label={`1730 RH for ${row.stationName}`}
                              />
                            ) : row.rh1730 !== null ? (
                              <span className="value-with-edit-tag">
                                {`${row.rh1730}%`}
                              </span>
                            ) : (
                              '---'
                            )}
                          </td>
                        )}

                        {/* Visibility */}
                        {showVisibility && <td className="cell-value">{row.visibilityText || (hasData ? '---' : '---')}</td>}

                        {/* Rainfall: 0830 hrs IST */}
                        <td
                          className="cell-value"
                          style={{
                            backgroundColor:
                              !isEditMode && row.rainfallColor !== 'white' ? row.rainfallColor : undefined,
                          }}
                        >
                          {isEditMode ? (
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              className={`edit-cell-input ${(row.manualEdits?.rainfall0830 || row.manualEdits?.rainfall) ? 'is-manually-edited' : ''}`}
                              value={row.rainfall0830 !== null && row.rainfall0830 !== undefined ? row.rainfall0830 : (row.rainfall !== null && row.rainfall !== undefined ? row.rainfall : '')}
                              onChange={(e) => {
                                const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
                                onUpdateStationValue?.(row.stationId, 'rainfall0830', isNaN(val as number) ? null : val);
                              }}
                              aria-label={`24h Rainfall (0830 IST) for ${row.stationName}`}
                            />
                          ) : (
                            <span className="value-with-edit-tag">
                              {formatValue(row.rainfall0830 ?? row.rainfall)}
                            </span>
                          )}
                        </td>

                        {/* Rainfall: Last 9 Hours up to 1730 hrs IST (only in 12Z mode) */}
                        {!is03Z && (
                          <td className="cell-value">
                            {isEditMode ? (
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                className={`edit-cell-input ${row.manualEdits?.rainfall1730 ? 'is-manually-edited' : ''}`}
                                value={row.rainfall1730 !== null && row.rainfall1730 !== undefined ? row.rainfall1730 : ''}
                                onChange={(e) => {
                                  const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
                                  onUpdateStationValue?.(row.stationId, 'rainfall1730', isNaN(val as number) ? null : val);
                                }}
                                aria-label={`9h Rainfall (1730 IST) for ${row.stationName}`}
                              />
                            ) : (
                              <span className="value-with-edit-tag">
                                {formatValue(row.rainfall1730)}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
};
