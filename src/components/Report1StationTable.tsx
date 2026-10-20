/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SubdivisionReportData } from '../engine/reportOrchestrator.ts';
import type { StationReportRow } from '../engine/reportCalculations.ts';
import {
  sortSubdivisionsForOperationalReports,
  sortStationsAlphabetically,
} from '../utils/stationSort.ts';

export type EditableStationField = 'tmax' | 'tmin' | 'rh0830' | 'rh1730' | 'rainfall' | 'rainfall0830' | 'rainfall1730';

interface Report1Props {
  subdivisions: SubdivisionReportData[];
  reportingDate: string;
  eveningDate: string;
  isEditMode?: boolean;
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

export function formatSubdivisionExtremeTmax(ext?: { value: number | null; stationNames: string }): string {
  if (!ext || ext.value === null || ext.value === undefined || isNaN(ext.value)) return '---';
  const name = ext.stationNames && ext.stationNames !== '---' ? ext.stationNames : '---';
  return `${name} — ${ext.value.toFixed(1)}°C`;
}

export function formatSubdivisionExtremeTmin(ext?: { value: number | null; stationNames: string }): string {
  if (!ext || ext.value === null || ext.value === undefined || isNaN(ext.value)) return '---';
  const name = ext.stationNames && ext.stationNames !== '---' ? ext.stationNames : '---';
  return `${name} — ${ext.value.toFixed(1)}°C`;
}

export function formatSubdivisionExtremeRainfall(ext?: { value: number | null; stationNames: string } | null): string {
  if (!ext || ext.value === null || ext.value === undefined || isNaN(ext.value)) return '---';
  if (ext.value === 0) return '0.0 mm';
  const name = ext.stationNames && ext.stationNames !== '---' ? ext.stationNames : '---';
  return `${name} — ${ext.value.toFixed(1)} mm`;
}

export const Report1StationTable: React.FC<Report1Props> = ({
  subdivisions,
  reportingDate,
  eveningDate,
  isEditMode = false,
  onUpdateStationValue,
}) => {
  const orderedSubdivisions = sortSubdivisionsForOperationalReports(subdivisions);

  return (
    <section className="report-section" aria-labelledby="report1-heading">
      <div className="report-section-header">
        <h2 id="report1-heading" className="report-title">
          Report 1: Daily Station Weather Observations
        </h2>
        <div className="report-meta">
          Observations recorded up to 0830 IST on {reportingDate} (Previous day Max Temp from {eveningDate})
        </div>
      </div>

      <div className="table-wrapper">
        <table
          className={`op-table ${isEditMode ? 'table-in-edit-mode' : ''}`}
          aria-label="Daily Station Weather Observations Table"
        >
          <thead>
            <tr>
              <th rowSpan={2} className="col-station">City / Observatory</th>
              <th colSpan={3}>Maximum Temperature (°C)</th>
              <th colSpan={3}>Minimum Temperature (°C)</th>
              <th colSpan={2}>Relative Humidity (%)</th>
              <th rowSpan={2}>Visibility</th>
              <th rowSpan={2}>Rainfall (mm)</th>
            </tr>
            <tr>
              <th>Max</th>
              <th>24h Chg</th>
              <th>Dep</th>
              <th>Min</th>
              <th>24h Chg</th>
              <th>Dep</th>
              <th>at 0830 IST</th>
              <th>at 1730 IST</th>
            </tr>
          </thead>
          <tbody>
            {orderedSubdivisions.map((subData) => {
              const sortedStationRows = sortStationsAlphabetically(subData.report1Rows);
              const summary = subData.report2Summary;

              return (
                <React.Fragment key={subData.subdivision.id}>
                  <tr className="subhead-row">
                    <td colSpan={11} className="cell-subhead">
                      <div className="subhead-content">
                        <span className="subhead-title">{subData.subdivision.name}</span>
                        <span className="subhead-extremes">
                          <span className="subhead-extreme-chip">
                            <strong>MAX TEMP:</strong> {formatSubdivisionExtremeTmax(summary?.highestTmax)}
                          </span>
                          <span className="subhead-extreme-sep">|</span>
                          <span className="subhead-extreme-chip">
                            <strong>MIN TEMP:</strong> {formatSubdivisionExtremeTmin(summary?.lowestTmin)}
                          </span>
                          <span className="subhead-extreme-sep">|</span>
                          <span className="subhead-extreme-chip">
                            <strong>MAX RAINFALL:</strong> {formatSubdivisionExtremeRainfall(summary?.heaviestRainfall)}
                          </span>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {sortedStationRows.map((row: StationReportRow) => {
                    const hasData =
                      row.tmin !== null ||
                      row.tmax !== null ||
                      row.rainfall !== null ||
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
                              {row.manualEdits?.tmax && (
                                <span className="manual-edit-indicator" title="Manually edited value (original SYNOP telegram preserved)">✎</span>
                              )}
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
                              {row.manualEdits?.tmin && (
                                <span className="manual-edit-indicator" title="Manually edited value (original SYNOP telegram preserved)">✎</span>
                              )}
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
                              {row.manualEdits?.rh0830 && (
                                <span className="manual-edit-indicator" title="Manually edited value (original SYNOP telegram preserved)">✎</span>
                              )}
                            </span>
                          ) : (
                            '---'
                          )}
                        </td>
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
                              {row.manualEdits?.rh1730 && (
                                <span className="manual-edit-indicator" title="Manually edited value (original SYNOP telegram preserved)">✎</span>
                              )}
                            </span>
                          ) : (
                            '---'
                          )}
                        </td>

                        {/* Visibility */}
                        <td>{row.visibilityText || (hasData ? '---' : '---')}</td>

                        {/* Rainfall */}
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
                              className={`edit-cell-input ${(row.manualEdits?.rainfall || row.manualEdits?.rainfall0830) ? 'is-manually-edited' : ''}`}
                              value={row.rainfall !== null && row.rainfall !== undefined ? row.rainfall : ''}
                              onChange={(e) => {
                                const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
                                onUpdateStationValue?.(row.stationId, 'rainfall', isNaN(val as number) ? null : val);
                              }}
                              aria-label={`Rainfall for ${row.stationName}`}
                            />
                          ) : (
                            <span className="value-with-edit-tag">
                              {formatValue(row.rainfall)}
                              {(row.manualEdits?.rainfall || row.manualEdits?.rainfall0830) && (
                                <span className="manual-edit-indicator" title="Manually edited value (original SYNOP telegram preserved)">✎</span>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
