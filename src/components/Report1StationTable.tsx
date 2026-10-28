/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SubdivisionReportData } from '../engine/reportOrchestrator.ts';
import type { StationReportRow } from '../engine/reportCalculations.ts';
import type { UtcSlot } from '../engine/observationStore.ts';
import {
  sortSubdivisionsForOperationalReports,
  sortStationsAlphabetically,
} from '../utils/stationSort.ts';
import { shiftDateString } from './SynopInput.tsx';

export type EditableStationField = 'tmax' | 'tmin' | 'rh0830' | 'rh1730' | 'rainfall' | 'rainfall0830' | 'rainfall1730';

interface Report1Props {
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
  reportSlot = '03Z',
  isEditMode = false,
  showVisibility = false,
  onUpdateStationValue,
}) => {
  const is03Z = reportSlot === '03Z';
  const yesterdayDate = eveningDate || (reportingDate ? shiftDateString(reportingDate, -1) : '');
  const todayDate = reportingDate || '';
  const orderedSubdivisions = sortSubdivisionsForOperationalReports(subdivisions);

  return (
    <section className="report-section" aria-labelledby="report1-heading">
      <div className="report-section-header">
        <h2 id="report1-heading" className="report-title">
          Report 1: Daily Station Weather Observations ({reportSlot})
        </h2>
        <div className="report-meta">
          {is03Z
            ? `Observations recorded up to 0830 IST on ${reportingDate} (Previous day Max Temp from ${eveningDate})`
            : `Observations recorded up to 1730 IST on ${reportingDate} (Current day Max Temp from 12Z, Min Temp from 03Z)`}
        </div>
      </div>

      <div className="table-wrapper">
        <table
          className={`op-table ${isEditMode ? 'table-in-edit-mode' : ''}`}
          aria-label="Daily Station Weather Observations Table"
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
              {!is03Z && <th>at 0830 IST</th>}
              {!is03Z && <th>at 1730 IST</th>}
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
            {orderedSubdivisions.map((subData, subIdx) => {
              const sortedStationRows = sortStationsAlphabetically(subData.report1Rows);
              const summary = subData.report2Summary;
              // Move East Madhya Pradesh to Page 1 and keep only Chhattisgarh on Page 2
              const isPage1SplitSubdivision =
                (subData.subdivision.id === '20' || subIdx === 2) &&
                subIdx < orderedSubdivisions.length - 1;

              return (
                <React.Fragment key={subData.subdivision.id}>
                  <tr className="subhead-row">
                    <td colSpan={(is03Z ? 9 : 11) + (showVisibility ? 1 : 0)} className="cell-subhead">
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
                  {sortedStationRows.map((row: StationReportRow, stnIdx: number) => {
                    const hasData =
                      row.tmin !== null ||
                      row.tmax !== null ||
                      row.rainfall !== null ||
                      row.rh0830 !== null;
                    const isLastStationOfPage1 =
                      isPage1SplitSubdivision &&
                      stnIdx === sortedStationRows.length - 1;

                    return (
                      <tr
                        key={row.stationId}
                        className={isLastStationOfPage1 ? 'consolidated-page1-break' : undefined}
                      >
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
                        {showVisibility && <td>{row.visibilityText || (hasData ? '---' : '---')}</td>}

                        {/* Rainfall */}
                        {is03Z ? (
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
                                {formatValue(row.rainfall0830 ?? row.rainfall)}
                              </span>
                            )}
                          </td>
                        ) : (
                          <>
                            <td className="cell-value">
                              {isEditMode ? (
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  className={`edit-cell-input ${row.manualEdits?.rainfall0830 ? 'is-manually-edited' : ''}`}
                                  value={row.rainfall0830 !== null && row.rainfall0830 !== undefined ? row.rainfall0830 : ''}
                                  onChange={(e) => {
                                    const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
                                    onUpdateStationValue?.(row.stationId, 'rainfall0830', isNaN(val as number) ? null : val);
                                  }}
                                  aria-label={`0830 Rainfall for ${row.stationName}`}
                                />
                              ) : (
                                <span className="value-with-edit-tag">
                                  {formatValue(row.rainfall0830)}
                                </span>
                              )}
                            </td>
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
                                  className={`edit-cell-input ${row.manualEdits?.rainfall1730 ? 'is-manually-edited' : ''}`}
                                  value={row.rainfall1730 !== null && row.rainfall1730 !== undefined ? row.rainfall1730 : ''}
                                  onChange={(e) => {
                                    const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
                                    onUpdateStationValue?.(row.stationId, 'rainfall1730', isNaN(val as number) ? null : val);
                                  }}
                                  aria-label={`1730 Rainfall for ${row.stationName}`}
                                />
                              ) : (
                                <span className="value-with-edit-tag">
                                  {formatValue(row.rainfall1730)}
                                </span>
                              )}
                            </td>
                          </>
                        )}
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
