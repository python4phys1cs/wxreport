/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

/**
 * Canonical 4 Subdivisions for Operational Forecaster Entry.
 * Order: 1. Vidarbha, 2. West Madhya Pradesh, 3. East Madhya Pradesh, 4. Chhattisgarh
 */
export const FORECAST_SUBDIVISIONS = [
  { id: '26', name: 'Vidarbha' },
  { id: '19', name: 'West Madhya Pradesh' },
  { id: '20', name: 'East Madhya Pradesh' },
  { id: '27', name: 'Chhattisgarh' },
] as const;

/**
 * Reference Districts from Canonical Station Registry for Each Subdivision.
 */
export const SUBDIVISION_DISTRICTS: Record<string, readonly string[]> = Object.freeze({
  '26': Object.freeze([
    'Akola',
    'Amravati',
    'Bhandara',
    'Buldhana',
    'Chandrapur',
    'Gadchiroli',
    'Gondia',
    'Nagpur',
    'Wardha',
    'Washim',
    'Yavatmal',
  ]),
  '19': Object.freeze([
    'Ashoknagar',
    'Betul',
    'Bhind',
    'Bhopal',
    'Datia',
    'Dhar',
    'Guna',
    'Gwalior',
    'Hoshangabad',
    'Indore',
    'Khandwa',
    'Khargone',
    'Morena',
    'Neemuch',
    'Raisen',
    'Rajgarh',
    'Ratlam',
    'Shajapur',
    'Sheopur',
    'Shivpuri',
    'Ujjain',
  ]),
  '20': Object.freeze([
    'Chhatarpur',
    'Damoh',
    'Jabalpur',
    'Mandla',
    'Narsinghpur',
    'Panna',
    'Rewa',
    'Sagar',
    'Satna',
    'Seoni',
    'Sidhi',
    'Tikamgarh',
    'Umaria',
  ]),
  '27': Object.freeze([
    'Bastar',
    'Bilaspur',
    'Durg',
    'Janjgir-Champa',
    'Raipur',
    'Rajnandgaon',
    'Surguja',
  ]),
});

interface ForecastProps {
  reportingDate: string;
}

/**
 * Returns an array of calendar date strings (DD/MM/YYYY) for consecutive forecast days
 * starting from the day immediately following the reporting date.
 * Example: reportingDate = "2026-10-06" -> ["07/10/2026", "08/10/2026", ..., "13/10/2026"]
 */
export function getForecastDates(reportingDateStr: string, count: number = 7): string[] {
  if (!reportingDateStr) return [];
  const parts = reportingDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return [];
  const [y, m, d] = parts;
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    const day = String(dt.getUTCDate()).padStart(2, '0');
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const year = dt.getUTCFullYear();
    result.push(`${day}/${month}/${year}`);
  }
  return result;
}

/**
 * Returns formatted Day header strings in the form `Day N (dd)`, e.g. `Day 1 (07)`.
 */
export function getForecastDayHeaders(reportingDateStr: string, count: number = 7): string[] {
  const dates = getForecastDates(reportingDateStr, count);
  return dates.map((dateStr, idx) => {
    const dayPart = dateStr.slice(0, 2);
    return `Day ${idx + 1} (${dayPart})`;
  });
}

/**
 * Formats a YYYY-MM-DD reporting date into `dd-MMMM-yyyy` (e.g. 09-October-2026).
 */
export function formatDdMmmmYyyy(reportingDateStr: string): string {
  if (!reportingDateStr) return '';
  const parts = reportingDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return reportingDateStr;
  const [y, m, d] = parts;
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const dd = String(d).padStart(2, '0');
  const mmmm = monthNames[m - 1] ?? '';
  return `${dd}-${mmmm}-${y}`;
}

/**
 * Weather Summary Forecaster 7-Day Spatial Rainfall Forecast Entry Table.
 * Rendered below the Subdivision Realised Weather Summary Table in Report 2.
 */
export const ForecasterSummaryTable: React.FC<ForecastProps> = ({ reportingDate }) => {
  // Local state for interactive manual entry if forecaster fills in browser before printing
  const [entries, setEntries] = useState<Record<string, string>>({});
  const forecastDates = getForecastDates(reportingDate, 7);
  const dayHeaders = getForecastDayHeaders(reportingDate, 7);
  const formattedDate = formatDdMmmmYyyy(reportingDate);

  const handleCellChange = (key: string, value: string) => {
    setEntries((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="forecast-section" aria-labelledby="forecast-summary-heading">
      <div className="forecast-section-header">
        <h3 id="forecast-summary-heading" className="forecast-title">
          Forecast/Warnings issued on {formattedDate} for next five days:
        </h3>
        <div className="forecast-subheading-lighter">
          *(To be entered during video conferencing)*
        </div>
      </div>

      <div className="table-wrapper">
        <table className="op-table forecast-table" aria-label="Subdivision Forecaster Entry Table">
          <colgroup>
            <col style={{ width: '23%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="col-station">Subdivision</th>
              {dayHeaders.map((header, idx) => (
                <th key={forecastDates[idx] || header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FORECAST_SUBDIVISIONS.map((sub) => (
              <tr key={sub.id}>
                <td className="cell-station">{sub.name}</td>
                {forecastDates.map((date, idx) => {
                  const key = `sub_${sub.id}_d${idx + 1}`;
                  return (
                    <td key={date} className="cell-forecast-entry">
                      <input
                        type="text"
                        className="forecast-input"
                        value={entries[key] || ''}
                        onChange={(e) => handleCellChange(key, e.target.value)}
                        placeholder=""
                        aria-label={`${sub.name} ${dayHeaders[idx]} forecast`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * District-wise 7-Day Forecast Entry Table.
 * Rendered below the Weather Summary / forecast worksheet.
 * Vidarbha and its 11 canonical districts only, displayed directly beneath column headers.
 */
export const DistrictForecastTable: React.FC<ForecastProps> = ({ reportingDate }) => {
  const [districtEntries, setDistrictEntries] = useState<Record<string, string>>({});
  const forecastDates = getForecastDates(reportingDate, 7);
  const dayHeaders = getForecastDayHeaders(reportingDate, 7);
  const formattedDate = formatDdMmmmYyyy(reportingDate);
  const vidarbhaDistricts = SUBDIVISION_DISTRICTS['26'] || [];

  const handleCellChange = (key: string, value: string) => {
    setDistrictEntries((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="forecast-section" aria-labelledby="district-forecast-heading">
      <div className="forecast-section-header">
        <h3 id="district-forecast-heading" className="forecast-title">
          District-wise Forecast/Warning with Intensity and Probability issued on {formattedDate}:
        </h3>
        <div className="forecast-subdivision-label">
          Vidarbha Subdivision:
        </div>
      </div>

      <div className="table-wrapper">
        <table className="op-table forecast-table" aria-label="District-wise Forecast Table">
          <colgroup>
            <col style={{ width: '23%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="col-station">District</th>
              {dayHeaders.map((header, idx) => (
                <th key={forecastDates[idx] || header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vidarbhaDistricts.map((dist) => (
              <tr key={`26_${dist}`}>
                <td className="cell-station">{dist}</td>
                {forecastDates.map((date, idx) => {
                  const key = `dist_26_${dist}_d${idx + 1}`;
                  return (
                    <td key={date} className="cell-forecast-entry">
                      <input
                        type="text"
                        className="forecast-input"
                        value={districtEntries[key] || ''}
                        onChange={(e) => handleCellChange(key, e.target.value)}
                        placeholder=""
                        aria-label={`${dist} ${dayHeaders[idx]} forecast`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
