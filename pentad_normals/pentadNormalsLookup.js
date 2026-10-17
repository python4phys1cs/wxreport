/**
 * pentadNormalsLookup.js
 * 
 * High-performance, zero-dependency utility for querying pentad normals
 * directly from dates in a React application.
 */

// 1. Fast O(1) date-to-pentad mapping without string parsing overhead
export function getPentadFromDate(dateInput) {
  let month, day;

  if (dateInput instanceof Date) {
    month = dateInput.getMonth() + 1; // 1-12
    day = dateInput.getDate();         // 1-31
  } else if (typeof dateInput === 'string') {
    // Supports 'YYYY-MM-DD', 'MM-DD', or 'YYYY/MM/DD'
    const parts = dateInput.split(/[-/]/);
    if (parts.length === 3) {
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    } else {
      throw new Error(`Invalid date format: ${dateInput}. Use YYYY-MM-DD or MM-DD.`);
    }
  } else {
    throw new Error('dateInput must be a Date object or string (YYYY-MM-DD / MM-DD).');
  }

  // Handle special leap day: Feb 29 belongs to Pentad 12 (Feb 25 - Mar 01)
  if (month === 2 && day === 29) {
    return 12;
  }

  // Standard non-leap cumulative days before each month (1-indexed month)
  // [0, Jan(0), Feb(31), Mar(59), Apr(90), May(120), Jun(151), Jul(181), Aug(212), Sep(243), Oct(273), Nov(304), Dec(334)]
  const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  
  const doy = DAYS_BEFORE_MONTH[month] + day;
  
  // Standard pentad formula: Math.floor((DOY - 1) / 5) + 1
  return Math.min(73, Math.max(1, Math.floor((doy - 1) / 5) + 1));
}

/**
 * Direct O(1) lookup of pentad normals for a given station and date.
 * 
 * @param {Object} masterJson - The loaded normals_pentad_master.json object
 * @param {string} stationId - e.g. "42540"
 * @param {Date|string} dateInput - e.g. "2024-05-18", "05-18", or new Date()
 * @returns {Object|null} The normal values and date range metadata
 */
export function getNormalsForDate(masterJson, stationId, dateInput) {
  if (!masterJson || !masterJson.normals) {
    throw new Error('Invalid master dataset provided.');
  }

  const stationData = masterJson.normals[stationId];
  if (!stationData) {
    return null; // Station not found
  }

  const pentadId = getPentadFromDate(dateInput);
  const pentadIndex = pentadId - 1; // 0-indexed in array (0 to 72)
  const normalValues = stationData[pentadIndex];
  const metadata = masterJson.pentads[pentadIndex];

  return {
    station: stationId,
    pentad_id: pentadId,
    date_range: metadata.date_range,
    start_mmdd: metadata.start_mmdd,
    end_mmdd: metadata.end_mmdd,
    doy_start: metadata.doy_start,
    doy_end: metadata.doy_end,
    normals: {
      pres1: normalValues.pres1,
      pres2: normalValues.pres2,
      tmax: normalValues.tmax,
      tmin: normalValues.tmin,
      rh1: normalValues.rh1,
      rh2: normalValues.rh2,
    }
  };
}

/**
 * Optional React Hook Example:
 * 
 * import { useMemo } from 'react';
 * import masterNormals from './data/normals_pentad_master.json';
 * import { getNormalsForDate } from './pentadNormalsLookup';
 * 
 * export function useStationNormals(stationId, selectedDate) {
 *   return useMemo(() => {
 *     if (!stationId || !selectedDate) return null;
 *     return getNormalsForDate(masterNormals, stationId, selectedDate);
 *   }, [stationId, selectedDate]);
 * }
 */
