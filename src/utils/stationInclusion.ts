/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CANONICAL_STATIONS } from '../constants/stationRegistry.ts';

/**
 * Default station codes excluded from operational reports.
 * Ashoknagar ('42665') must be disabled by default in reports.
 */
export const DEFAULT_DISABLED_STATION_IDS: readonly string[] = Object.freeze(['42665']);

export const STORAGE_KEY_STATION_INCLUSION = 'wxops_station_inclusion';

/**
 * Returns the default inclusion map for all canonical stations.
 * Every canonical station is true (enabled), except Ashoknagar ('42665') which is false (disabled).
 */
export function getDefaultStationInclusion(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const stn of CANONICAL_STATIONS) {
    map[stn.id] = !DEFAULT_DISABLED_STATION_IDS.includes(stn.id);
  }
  return map;
}

/**
 * Loads persisted station inclusion settings from browser localStorage if available,
 * otherwise returns default inclusion settings.
 */
export function loadStationInclusion(): Record<string, boolean> {
  const defaults = getDefaultStationInclusion();

  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_STATION_INCLUSION);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    // Merge saved settings with defaults to guarantee all canonical stations exist
    const merged: Record<string, boolean> = { ...defaults };
    for (const [stnId, enabled] of Object.entries(parsed)) {
      if (typeof enabled === 'boolean') {
        merged[stnId] = enabled;
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}

/**
 * Saves station inclusion settings to browser localStorage.
 */
export function saveStationInclusion(map: Record<string, boolean>): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY_STATION_INCLUSION, JSON.stringify(map));
  } catch {}
}

/**
 * Extracts a list of excluded (disabled) station IDs from an inclusion map.
 */
export function getExcludedStationIds(map: Record<string, boolean>): string[] {
  const excluded: string[] = [];
  for (const [stnId, enabled] of Object.entries(map)) {
    if (enabled === false) {
      excluded.push(stnId);
    }
  }
  return excluded;
}

/**
 * Checks whether a station code is currently included in reports.
 */
export function isStationIncluded(
  stationId: string,
  inclusionMap?: Record<string, boolean>
): boolean {
  if (!stationId) return false;
  if (!inclusionMap) {
    return !DEFAULT_DISABLED_STATION_IDS.includes(stationId.trim());
  }
  const val = inclusionMap[stationId.trim()];
  if (val !== undefined) return val;
  return !DEFAULT_DISABLED_STATION_IDS.includes(stationId.trim());
}

/**
 * Returns a new inclusion map with a specific station toggled or set.
 */
export function setStationInclusionState(
  stationId: string,
  enabled: boolean,
  currentMap: Record<string, boolean>
): Record<string, boolean> {
  const next = { ...currentMap, [stationId]: enabled };
  saveStationInclusion(next);
  return next;
}

/**
 * Resets station inclusion back to operational defaults (Ashoknagar disabled, others enabled).
 */
export function resetStationInclusion(): Record<string, boolean> {
  const defaults = getDefaultStationInclusion();
  saveStationInclusion(defaults);
  return defaults;
}

/**
 * Enables all canonical stations (including Ashoknagar).
 */
export function enableAllStations(currentMap: Record<string, boolean>): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const stn of CANONICAL_STATIONS) {
    next[stn.id] = true;
  }
  saveStationInclusion(next);
  return next;
}
