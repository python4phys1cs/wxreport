/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  parseSynopBulletin,
  parse12UtcBulletin,
  parseSynopBulletinDetailed,
  parse12UtcBulletinDetailed,
  type ParsedStationObservation,
  type Parsed12UtcStationObservation,
} from '../parser/synopDecoder.ts';
import { isAllowlistedStation, getStation } from '../constants/stationRegistry.ts';
export { getPreviousDayDateString, getNextDayDateString } from './climatology.ts';
import { getPreviousDayDateString, getNextDayDateString } from './climatology.ts';
import type { HistoricalObservation, HistoricalObservationProvider } from './reportOrchestrator.ts';

/**
 * Operational SYNOP observation slot.
 */
export type UtcSlot = '03Z' | '12Z';

/**
 * Persisted state of operational observations for a meteorological station.
 * Retains latest known values for each observation field independently.
 */
export interface PersistedStationObservation {
  /** WMO 5-digit station code */
  readonly stationId: string;

  /** Canonical observatory station name from station registry */
  stationName?: string;

  /** Operational reporting date (YYYY-MM-DD) */
  reportingDate: string;

  /** Maximum temperature (°C) */
  tmax: number | null;
  tmaxDate: string | null;
  tmaxSlot: UtcSlot | null;
  tmax03Z?: number | null;
  tmax12Z?: number | null;

  /** Minimum temperature (°C) */
  tmin: number | null;
  tminDate: string | null;
  tminSlot: UtcSlot | null;

  /** Relative humidity at 0830 IST (%) */
  rh0830: number | null;

  /** Relative humidity at 1730 IST (%) */
  rh1730: number | null;

  /** Dry-bulb temperature at 0830 IST (°C) */
  dryBulb0830: number | null;

  /** Dew-point temperature at 0830 IST (°C) */
  dewPoint0830: number | null;

  /** Dry-bulb temperature at 1730 IST (°C) */
  dryBulb1730: number | null;

  /** Dew-point temperature at 1730 IST (°C) */
  dewPoint1730: number | null;

  /** 24-hour rainfall accumulation up to 0830 IST (mm) */
  rainfall0830: number | null;

  /** Rainfall accumulation up to 1730 IST (mm) */
  rainfall1730: number | null;

  /** Active display rainfall (mm) */
  rainfall: number | null;

  /** Mean sea level pressure at 0830 IST (hPa) */
  mslPressure0830: number | null;

  /** Mean sea level pressure at 1730 IST (hPa) */
  mslPressure1730: number | null;

  /** Visibility code (e.g. "96") */
  visibilityCode: string | null;
  visibilityCode03Z?: string | null;
  visibilityCode12Z?: string | null;

  /** Previous day maximum temperature explicitly reported in 03Z Section 333 */
  tmaxPreviousDay?: number | null;

  /** Slot flags indicating which observation telegrams have been ingested */
  has03Z?: boolean;
  has12Z?: boolean;

  /** Last updated slot and date for operational traceability */
  lastUpdatedSlot: UtcSlot | null;
  lastUpdatedDate: string | null;

  /** Raw SYNOP telegrams for audit, reprocessing, and traceability */
  rawSynop?: string;
  rawSynop03Z?: string;
  rawSynop12Z?: string;

  /** Tracks which observation fields were manually edited in table edit mode */
  manualEdits?: Record<string, boolean>;
}

/**
 * Metadata for the persistent observation archive.
 */
export interface ArchiveMetadata {
  readonly version: '1.0';
  readonly system: 'WXOps';
  readonly exportedAt: string; // ISO 8601 UTC
  readonly retentionLimit: number; // Configurable days (15, 30, 60, 120)
  readonly dateCount: number;
  readonly dates: readonly string[]; // Sorted ascending chronologically (YYYY-MM-DD)
  readonly stationCount: number; // Total unique stations represented
}

/**
 * Duplicate handling policy when importing historical database records.
 * - 'preserve_existing': Existing station/date records are kept intact; incoming duplicates are skipped (default).
 * - 'update_existing': Incoming duplicate records overwrite existing records for that station/date.
 * - 'merge_fields': Preserves existing non-null fields; populates null fields with incoming values.
 */
export type DuplicateHandlingPolicy = 'preserve_existing' | 'update_existing' | 'merge_fields';

/**
 * Summary breakdown of a historical database archive import operation.
 */
export interface ArchiveImportSummary {
  readonly success: boolean;
  readonly recordsAdded: number;
  readonly recordsUpdated: number;
  readonly recordsSkipped: number;
  readonly recordsRejected: number;
  readonly datesImported: string[];
  readonly totalDatesInStore: number;
  readonly error?: string;
  readonly warnings?: string[];
}

/**
 * Configuration options for importing an archived historical database.
 */
export interface ArchiveImportOptions {
  /** Duplicate handling policy (defaults to 'preserve_existing') */
  duplicatePolicy?: DuplicateHandlingPolicy;
  /** If true, dynamically expands retention limit so imported historical dates are retained */
  retainAllImportedDates?: boolean;
}

/**
 * Canonical JSON-compatible persistent observation archive structure.
 * Suitable for direct PC download, CMD backup, and disaster recovery.
 */
export interface ObservationArchive {
  readonly metadata: ArchiveMetadata;
  /** Partitioned by reporting date (YYYY-MM-DD) -> stationId -> PersistedStationObservation */
  readonly records: Record<string, Record<string, PersistedStationObservation>>;
  /** Original raw SYNOP bulletin strings by date and slot for audit and reprocessing */
  readonly rawBulletins?: Record<string, Partial<Record<UtcSlot, string>>>;
}

/**
 * Storage provider interface for persisting the archive across browser reloads
 * or application restarts.
 */
export interface ArchiveStorageProvider {
  load(): ObservationArchive | null;
  save(archive: ObservationArchive): void;
  clear?(): void;
}

/**
 * Browser LocalStorage implementation of ArchiveStorageProvider.
 * Survives page reloads, browser restarts, and tab closures on the PC.
 */
export class BrowserLocalStorageArchiveProvider implements ArchiveStorageProvider {
  private readonly storageKey: string;

  constructor(storageKey = 'wxops_observation_archive_v1') {
    this.storageKey = storageKey;
  }

  load(): ObservationArchive | null {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    try {
      const serialized = window.localStorage.getItem(this.storageKey);
      if (!serialized) return null;
      const parsed = JSON.parse(serialized);
      const validation = validateArchiveData(parsed);
      return validation.valid && validation.archive ? validation.archive : null;
    } catch {
      return null;
    }
  }

  save(archive: ObservationArchive): void {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(archive));
    } catch (err) {
      console.warn('Unable to persist WXOps archive to localStorage:', err);
    }
  }

  clear(): void {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * In-memory storage provider for deterministic unit tests and server-side runtimes.
 */
export class MemoryArchiveStorageProvider implements ArchiveStorageProvider {
  private storedArchive: ObservationArchive | null = null;

  constructor(initialArchive: ObservationArchive | null = null) {
    this.storedArchive = initialArchive;
  }

  load(): ObservationArchive | null {
    return this.storedArchive ? JSON.parse(JSON.stringify(this.storedArchive)) : null;
  }

  save(archive: ObservationArchive): void {
    this.storedArchive = JSON.parse(JSON.stringify(archive));
  }

  clear(): void {
    this.storedArchive = null;
  }
}

/**
 * Ingestion summary result.
 */
export interface IngestionResult {
  readonly slot: UtcSlot;
  readonly reportingDate: string;
  readonly decodedCount: number;
  readonly updatedStationIds: string[];
  readonly skippedStationIds?: string[];
  readonly warnings?: string[];
}

/**
 * Archive restore result.
 */
export interface ArchiveRestoreResult {
  readonly success: boolean;
  readonly datesRestored: string[];
  readonly stationCount: number;
  readonly error?: string;
}

/**
 * Parses CSV exported archive content back into an ObservationArchive object.
 * Supports standard CSV quotes, multi-line values, and column mappings.
 */
export function parseCsvToArchive(csvText: string): { valid: boolean; archive?: ObservationArchive; error?: string } {
  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return { valid: false, error: 'Empty CSV content.' };
  }

  // Parse lines taking into account quoted newlines and escaped quotes
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    return { valid: false, error: 'CSV must contain at least a header row and one observation record.' };
  }

  const rawHeaders = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (keys: string[]): number => {
    for (const k of keys) {
      const idx = rawHeaders.indexOf(k.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxDate = colIndex(['reporting date', 'reportingdate', 'date', 'obs_date']);
  const idxStation = colIndex(['station id', 'stationid', 'station', 'stn_id', 'id']);
  const idxStationName = colIndex(['station name', 'stationname', 'station_name', 'name', 'observatory']);

  if (idxDate === -1 || idxStation === -1) {
    return { valid: false, error: "Missing required 'Reporting Date' or 'Station ID' columns in CSV." };
  }

  const idxTmax = colIndex(['tmax (c)', 'tmax', 'tmax_c']);
  const idxTmaxDate = colIndex(['tmax date', 'tmaxdate']);
  const idxTmaxSlot = colIndex(['tmax slot', 'tmaxslot']);
  const idxTmin = colIndex(['tmin (c)', 'tmin', 'tmin_c']);
  const idxTminDate = colIndex(['tmin date', 'tmindate']);
  const idxTminSlot = colIndex(['tmin slot', 'tminslot']);
  const idxRh0830 = colIndex(['rh 0830 (%)', 'rh0830', 'rh_0830']);
  const idxRh1730 = colIndex(['rh 1730 (%)', 'rh1730', 'rh_1730']);
  const idxDry0830 = colIndex(['dry bulb 0830 (c)', 'drybulb0830', 'dry_bulb_0830']);
  const idxDew0830 = colIndex(['dew point 0830 (c)', 'dewpoint0830', 'dew_point_0830']);
  const idxDry1730 = colIndex(['dry bulb 1730 (c)', 'drybulb1730', 'dry_bulb_1730']);
  const idxDew1730 = colIndex(['dew point 1730 (c)', 'dewpoint1730', 'dew_point_1730']);
  const idxRain0830 = colIndex(['rainfall 0830 (mm)', 'rainfall0830', 'rainfall_0830']);
  const idxRain1730 = colIndex(['rainfall 1730 (mm)', 'rainfall1730', 'rainfall_1730']);
  const idxRain = colIndex(['rainfall (mm)', 'rainfall', 'rf']);
  const idxVis = colIndex(['visibility code', 'visibilitycode', 'visibility']);
  const idxMslp0830 = colIndex(['mslp 0830 (hpa)', 'mslpressure0830', 'mslp0830']);
  const idxMslp1730 = colIndex(['mslp 1730 (hpa)', 'mslpressure1730', 'mslp1730']);
  const idxLastSlot = colIndex(['last updated slot', 'lastupdatedslot']);
  const idxLastDate = colIndex(['last updated date', 'lastupdateddate']);
  const idxRawSynop = colIndex(['raw synop', 'rawsynop']);
  const idxRaw03Z = colIndex(['raw synop 03z', 'rawsynop03z']);
  const idxRaw12Z = colIndex(['raw synop 12z', 'rawsynop12z']);
  const idxManualEdits = colIndex(['manual edits', 'manualedits', 'edited_fields', 'manual_edits']);

  const getNum = (row: string[], idx: number): number | null => {
    if (idx === -1 || idx >= row.length) return null;
    const v = row[idx].trim();
    if (!v) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const getStr = (row: string[], idx: number): string | null => {
    if (idx === -1 || idx >= row.length) return null;
    const v = row[idx].trim();
    return v ? v : null;
  };

  const records: Record<string, Record<string, PersistedStationObservation>> = {};
  const datesSet = new Set<string>();
  const stationsSet = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const dateVal = getStr(row, idxDate);
    const stnVal = getStr(row, idxStation);

    if (!dateVal || !stnVal) continue;

    if (!records[dateVal]) {
      records[dateVal] = {};
      datesSet.add(dateVal);
    }

    const tmaxSlot = getStr(row, idxTmaxSlot);
    const tminSlot = getStr(row, idxTminSlot);
    const lastSlot = getStr(row, idxLastSlot);

    let parsedManualEdits: Record<string, boolean> | undefined;
    const rawEditsStr = getStr(row, idxManualEdits);
    if (rawEditsStr) {
      const editsMap: Record<string, boolean> = {};
      const tokens = rawEditsStr.split(/[;,|]/);
      for (const tok of tokens) {
        const trimmed = tok.trim();
        if (trimmed) editsMap[trimmed] = true;
      }
      if (Object.keys(editsMap).length > 0) {
        parsedManualEdits = editsMap;
      }
    }

    // Station code is authoritative; do not trust an imported name over the canonical registry
    const canonical = getStation(stnVal);
    const resolvedStationName = canonical ? canonical.name : (getStr(row, idxStationName) ?? undefined);

    const obs: PersistedStationObservation = {
      stationId: stnVal,
      stationName: resolvedStationName,
      reportingDate: dateVal,
      tmax: getNum(row, idxTmax),
      tmaxDate: getStr(row, idxTmaxDate),
      tmaxSlot: (tmaxSlot === '03Z' || tmaxSlot === '12Z') ? tmaxSlot : null,
      tmaxPreviousDay: null,
      tmin: getNum(row, idxTmin),
      tminDate: getStr(row, idxTminDate),
      tminSlot: (tminSlot === '03Z' || tminSlot === '12Z') ? tminSlot : null,
      rh0830: getNum(row, idxRh0830),
      rh1730: getNum(row, idxRh1730),
      dryBulb0830: getNum(row, idxDry0830),
      dewPoint0830: getNum(row, idxDew0830),
      dryBulb1730: getNum(row, idxDry1730),
      dewPoint1730: getNum(row, idxDew1730),
      rainfall0830: getNum(row, idxRain0830),
      rainfall1730: getNum(row, idxRain1730),
      rainfall: getNum(row, idxRain),
      mslPressure0830: getNum(row, idxMslp0830),
      mslPressure1730: getNum(row, idxMslp1730),
      visibilityCode: getStr(row, idxVis),
      lastUpdatedSlot: (lastSlot === '03Z' || lastSlot === '12Z') ? lastSlot : null,
      lastUpdatedDate: getStr(row, idxLastDate),
      rawSynop: getStr(row, idxRawSynop) ?? undefined,
      rawSynop03Z: getStr(row, idxRaw03Z) ?? undefined,
      rawSynop12Z: getStr(row, idxRaw12Z) ?? undefined,
      ...(parsedManualEdits ? { manualEdits: parsedManualEdits } : {}),
    };

    records[dateVal][stnVal] = obs;
    stationsSet.add(stnVal);
  }

  const dates = Array.from(datesSet).sort();
  if (dates.length === 0 || stationsSet.size === 0) {
    return { valid: false, error: 'No valid station observation rows found in CSV.' };
  }

  const archive: ObservationArchive = {
    metadata: {
      version: '1.0',
      system: 'WXOps',
      exportedAt: new Date().toISOString(),
      retentionLimit: Math.max(15, dates.length),
      dateCount: dates.length,
      dates,
      stationCount: stationsSet.size,
    },
    records,
  };

  return { valid: true, archive };
}

/**
 * Validates untrusted archive data against the canonical ObservationArchive schema.
 */
export function validateArchiveData(
  data: unknown,
  options?: { enforceRetention?: boolean }
): {
  valid: boolean;
  error?: string;
  archive?: ObservationArchive;
} {
  let raw: unknown = data;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('{')) {
      try {
        raw = JSON.parse(trimmed);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid JSON';
        return { valid: false, error: `JSON parse error: ${msg}` };
      }
    } else {
      const csvRes = parseCsvToArchive(trimmed);
      if (csvRes.valid && csvRes.archive) {
        raw = csvRes.archive;
      } else {
        return { valid: false, error: csvRes.error ?? 'Invalid archive data (neither valid JSON nor CSV).' };
      }
    }
  }

  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Archive payload must be a non-null JSON object or valid CSV.' };
  }

  const rawObj = raw as Record<string, any>;
  raw = rawObj;

  if (rawObj.version && rawObj.version !== '1.0') {
    return { valid: false, error: `Unsupported archive version: ${rawObj.version}. Expected '1.0'.` };
  }

  if (!rawObj.records || typeof rawObj.records !== 'object' || Array.isArray(rawObj.records)) {
    return { valid: false, error: "Archive is missing required 'records' object dictionary." };
  }

  const recordsObj = rawObj.records as Record<string, unknown>;
  const validatedRecords: Record<string, Record<string, PersistedStationObservation>> = {};
  const validDates: string[] = [];
  const uniqueStations = new Set<string>();

  for (const [dateStr, stnDict] of Object.entries(recordsObj)) {
    // Validate date key format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return { valid: false, error: `Invalid date key format: '${dateStr}'. Expected YYYY-MM-DD.` };
    }

    if (!stnDict || typeof stnDict !== 'object' || Array.isArray(stnDict)) {
      return { valid: false, error: `Invalid station dictionary for date: '${dateStr}'.` };
    }

    const validStationMap: Record<string, PersistedStationObservation> = {};

    for (const [stationId, obsRaw] of Object.entries(stnDict as Record<string, unknown>)) {
      if (!obsRaw || typeof obsRaw !== 'object') {
        return { valid: false, error: `Invalid observation for station '${stationId}' on '${dateStr}'.` };
      }

      const obs = obsRaw as Record<string, unknown>;
      const stnId = String(obs.stationId || stationId).trim();
      if (!stnId) {
        return { valid: false, error: `Empty station ID for entry on '${dateStr}'.` };
      }

      // Validate numeric temperature/rainfall constraints
      const numOrNull = (v: unknown): number | null => {
        if (v === null || v === undefined) return null;
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        return isNaN(n) ? null : n;
      };

      // Station code is authoritative; do not trust an imported name over the canonical registry
      const canonical = getStation(stnId);
      const resolvedStationName = canonical
        ? canonical.name
        : (typeof obs.stationName === 'string' && obs.stationName.trim() ? obs.stationName.trim() : undefined);

      const validObs: PersistedStationObservation = {
        stationId: stnId,
        stationName: resolvedStationName,
        reportingDate: String(obs.reportingDate || dateStr),
        tmax: numOrNull(obs.tmax),
        tmaxDate: obs.tmaxDate ? String(obs.tmaxDate) : null,
        tmaxSlot: (obs.tmaxSlot === '03Z' || obs.tmaxSlot === '12Z') ? obs.tmaxSlot : null,
        tmax03Z: numOrNull(obs.tmax03Z ?? obs.tmaxPreviousDay),
        tmax12Z: numOrNull(obs.tmax12Z),
        tmaxPreviousDay: numOrNull(obs.tmaxPreviousDay),
        tmin: numOrNull(obs.tmin),
        tminDate: obs.tminDate ? String(obs.tminDate) : null,
        tminSlot: (obs.tminSlot === '03Z' || obs.tminSlot === '12Z') ? obs.tminSlot : null,
        rh0830: numOrNull(obs.rh0830),
        rh1730: numOrNull(obs.rh1730),
        dryBulb0830: numOrNull(obs.dryBulb0830),
        dewPoint0830: numOrNull(obs.dewPoint0830),
        dryBulb1730: numOrNull(obs.dryBulb1730),
        dewPoint1730: numOrNull(obs.dewPoint1730),
        rainfall0830: numOrNull(obs.rainfall0830),
        rainfall1730: numOrNull(obs.rainfall1730),
        rainfall: numOrNull(obs.rainfall),
        mslPressure0830: numOrNull(obs.mslPressure0830),
        mslPressure1730: numOrNull(obs.mslPressure1730),
        visibilityCode: obs.visibilityCode ? String(obs.visibilityCode) : null,
        visibilityCode03Z: obs.visibilityCode03Z ? String(obs.visibilityCode03Z) : null,
        visibilityCode12Z: obs.visibilityCode12Z ? String(obs.visibilityCode12Z) : null,
        has03Z: Boolean(obs.has03Z),
        has12Z: Boolean(obs.has12Z),
        lastUpdatedSlot: (obs.lastUpdatedSlot === '03Z' || obs.lastUpdatedSlot === '12Z') ? obs.lastUpdatedSlot : null,
        lastUpdatedDate: obs.lastUpdatedDate ? String(obs.lastUpdatedDate) : null,
        rawSynop: obs.rawSynop ? String(obs.rawSynop) : (obs.rawSynop03Z ? String(obs.rawSynop03Z) : (obs.rawSynop12Z ? String(obs.rawSynop12Z) : undefined)),
        rawSynop03Z: obs.rawSynop03Z ? String(obs.rawSynop03Z) : undefined,
        rawSynop12Z: obs.rawSynop12Z ? String(obs.rawSynop12Z) : undefined,
        manualEdits: (obs.manualEdits && typeof obs.manualEdits === 'object' && !Array.isArray(obs.manualEdits))
          ? (obs.manualEdits as Record<string, boolean>)
          : undefined,
      };

      validStationMap[stnId] = validObs;
      uniqueStations.add(stnId);
    }

    validatedRecords[dateStr] = validStationMap;
    validDates.push(dateStr);
  }

  // Sort dates chronologically ascending
  validDates.sort((a, b) => a.localeCompare(b));

  const rawMeta = (rawObj.metadata && typeof rawObj.metadata === 'object') ? (rawObj.metadata as Record<string, unknown>) : null;
  const configuredLimit = typeof rawMeta?.retentionLimit === 'number' && rawMeta.retentionLimit > 0
    ? rawMeta.retentionLimit
    : 15;

  // Enforce retention limit only if explicitly requested
  if (options?.enforceRetention) {
    while (validDates.length > configuredLimit) {
      const oldest = validDates.shift()!;
      delete validatedRecords[oldest];
    }
  }

  // Validate optional raw bulletins
  let validBulletins: Record<string, Partial<Record<UtcSlot, string>>> | undefined;
  if (rawObj.rawBulletins && typeof rawObj.rawBulletins === 'object' && !Array.isArray(rawObj.rawBulletins)) {
    validBulletins = {};
    for (const [dateKey, slotMap] of Object.entries(rawObj.rawBulletins as Record<string, unknown>)) {
      if (slotMap && typeof slotMap === 'object' && !Array.isArray(slotMap)) {
        const cleanSlots: Partial<Record<UtcSlot, string>> = {};
        for (const [slotKey, val] of Object.entries(slotMap as Record<string, unknown>)) {
          if ((slotKey === '03Z' || slotKey === '12Z') && typeof val === 'string') {
            cleanSlots[slotKey as UtcSlot] = val;
          }
        }
        if (Object.keys(cleanSlots).length > 0) {
          validBulletins[dateKey] = cleanSlots;
        }
      }
    }
  }

  const archive: ObservationArchive = {
    metadata: {
      version: '1.0',
      system: 'WXOps',
      exportedAt: new Date().toISOString(),
      retentionLimit: Math.max(configuredLimit, validDates.length),
      dateCount: validDates.length,
      dates: validDates,
      stationCount: uniqueStations.size,
    },
    records: validatedRecords,
    ...(validBulletins && Object.keys(validBulletins).length > 0 ? { rawBulletins: validBulletins } : {}),
  };

  return { valid: true, archive };
}

/**
 * Converts canonical ObservationArchive to CSV formatted string.
 */
export function convertArchiveToCsv(archive: ObservationArchive): string {
  const headers = [
    'Reporting Date',
    'Station ID',
    'Station Name',
    'Tmax (C)',
    'Tmax Date',
    'Tmax Slot',
    'Tmin (C)',
    'Tmin Date',
    'Tmin Slot',
    'RH 0830 (%)',
    'RH 1730 (%)',
    'Dry Bulb 0830 (C)',
    'Dew Point 0830 (C)',
    'Dry Bulb 1730 (C)',
    'Dew Point 1730 (C)',
    'Rainfall 0830 (mm)',
    'Rainfall 1730 (mm)',
    'Rainfall (mm)',
    'Visibility Code',
    'MSLP 0830 (hPa)',
    'MSLP 1730 (hPa)',
    'Last Updated Slot',
    'Last Updated Date',
    'Raw SYNOP',
    'Raw SYNOP 03Z',
    'Raw SYNOP 12Z',
    'Manual Edits',
  ];

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [headers.join(',')];

  for (const date of archive.metadata.dates) {
    const stationMap = archive.records[date] || {};
    for (const [stnId, obs] of Object.entries(stationMap)) {
      const canonical = getStation(stnId);
      const stnName = canonical ? canonical.name : (obs.stationName ?? '');

      const manualEditsStr = obs.manualEdits
        ? Object.entries(obs.manualEdits)
            .filter(([, v]) => Boolean(v))
            .map(([k]) => k)
            .join(';')
        : '';

      const row = [
        date,
        stnId,
        stnName,
        obs.tmax !== null ? obs.tmax : '',
        obs.tmaxDate ?? '',
        obs.tmaxSlot ?? '',
        obs.tmin !== null ? obs.tmin : '',
        obs.tminDate ?? '',
        obs.tminSlot ?? '',
        obs.rh0830 !== null ? obs.rh0830 : '',
        obs.rh1730 !== null ? obs.rh1730 : '',
        obs.dryBulb0830 !== null ? obs.dryBulb0830 : '',
        obs.dewPoint0830 !== null ? obs.dewPoint0830 : '',
        obs.dryBulb1730 !== null ? obs.dryBulb1730 : '',
        obs.dewPoint1730 !== null ? obs.dewPoint1730 : '',
        obs.rainfall0830 !== null ? obs.rainfall0830 : '',
        obs.rainfall1730 !== null ? obs.rainfall1730 : '',
        obs.rainfall !== null ? obs.rainfall : '',
        obs.visibilityCode ?? '',
        obs.mslPressure0830 !== null ? obs.mslPressure0830 : '',
        obs.mslPressure1730 !== null ? obs.mslPressure1730 : '',
        obs.lastUpdatedSlot ?? '',
        obs.lastUpdatedDate ?? '',
        obs.rawSynop ?? '',
        obs.rawSynop03Z ?? '',
        obs.rawSynop12Z ?? '',
        manualEditsStr,
      ];
      lines.push(row.map(escapeCsv).join(','));
    }
  }

  return lines.join('\r\n');
}

/**
 * Abstract Observation Store contract.
 * Extended with multi-date archive, export, and restore capabilities.
 */
export interface ObservationStore extends HistoricalObservationProvider {
  /** Ingests 03 UTC parsed observations into persisted state for a date. */
  ingest03Z(observations: ParsedStationObservation[], reportingDate: string): string[];

  /** Ingests 12 UTC parsed observations into persisted state for a date. */
  ingest12Z(observations: Parsed12UtcStationObservation[], reportingDate: string): string[];

  /** Parses and ingests a raw bulletin for the specified slot and date. */
  ingestBulletin(utcSlot: UtcSlot, rawBulletin: string, reportingDate: string): IngestionResult;

  /** Ingests a revised bulletin containing one or more station telegrams without altering other stored stations. */
  ingestRevisedBulletin(utcSlot: UtcSlot, rawBulletin: string, reportingDate: string): IngestionResult;

  /** Updates/revises a single station's observation from a parsed telegram for a given date and slot. */
  reviseStationObservation(
    reportingDate: string,
    utcSlot: UtcSlot,
    stationId: string,
    parsed: ParsedStationObservation | Parsed12UtcStationObservation
  ): PersistedStationObservation;

  /** Retrieves un-resolved raw observation record stored strictly on a specific date. */
  getRawStationObservation(stationId: string, date: string): PersistedStationObservation | null;

  /** Updates observation values for a station on a specific reporting date. */
  updateStationObservation(
    date: string,
    stationId: string,
    updates: Partial<PersistedStationObservation>
  ): PersistedStationObservation;

  /** Hydrates/updates observation state directly from server or archive without treating non-edited fields as manual cell edits. */
  setStationObservationFromServer(
    date: string,
    stationId: string,
    obs: Partial<PersistedStationObservation>
  ): PersistedStationObservation;

  /** Retrieves resolved observation state for a station for a reporting date. */
  getStationObservation(stationId: string, date?: string): PersistedStationObservation | null;

  /** Retrieves all resolved station observations for a reporting date. */
  getAllObservations(date?: string): Map<string, PersistedStationObservation>;

  /** Retrieves historical observation for 24-hr change comparisons. */
  getHistoricalObservation(stationId: string, date: string): HistoricalObservation | null;

  /** Retrieves sorted list of reporting dates currently in the archive. */
  getArchivedDates(): string[];

  /** Returns number of dates currently archived. */
  getArchiveSize(): number;

  /** Returns the configured retention limit in days. */
  getRetentionLimit(): number;

  /** Sets the configured retention limit in days (e.g. 15, 30, 60, 120). */
  setRetentionLimit(limit: number): void;

  /** Exports the complete archive as a canonical JSON-compatible object. */
  exportArchive(): ObservationArchive;

  /** Exports the archive as a formatted JSON string for download or file backup. */
  exportArchiveJson(pretty?: boolean): string;

  /** Exports the archive as a CSV string for tabular download and spreadsheet review. */
  exportArchiveCsv(): string;

  /** Restores the archive from a JSON string or object (overwriting store). */
  restoreArchive(archiveData: unknown): ArchiveRestoreResult;

  /** Imports an archived historical database with deterministic duplicate handling, preserving existing data by default. */
  importHistoricalArchive(
    archiveData: unknown,
    options?: ArchiveImportOptions
  ): ArchiveImportSummary;

  /** Retrieves raw bulletin for date and slot if stored */
  getRawBulletin(date: string, slot: UtcSlot): string | null;

  /** Saves raw bulletin for date and slot */
  saveRawBulletin(date: string, slot: UtcSlot, rawBulletin: string): void;

  /** Seeds historical baseline observations. */
  seedHistoricalBaseline(observations: HistoricalObservation[]): void;

  /** Resets all store state. */
  clear(): void;
}

/**
 * Creates an empty observation record for a station.
 */
function createEmptyStationObservation(stationId: string, reportingDate: string): PersistedStationObservation {
  const canonical = getStation(stationId);
  return {
    stationId,
    stationName: canonical ? canonical.name : undefined,
    reportingDate,
    tmax: null,
    tmaxDate: null,
    tmaxSlot: null,
    tmax03Z: null,
    tmax12Z: null,
    tmin: null,
    tminDate: null,
    tminSlot: null,
    rh0830: null,
    rh1730: null,
    dryBulb0830: null,
    dewPoint0830: null,
    dryBulb1730: null,
    dewPoint1730: null,
    rainfall0830: null,
    rainfall1730: null,
    rainfall: null,
    mslPressure0830: null,
    mslPressure1730: null,
    visibilityCode: null,
    lastUpdatedSlot: null,
    lastUpdatedDate: null,
  };
}

/**
 * Creates an observation record carrying forward latest known fields from prior observations.
 */
function createStationObservationWithPriorState(
  stationId: string,
  reportingDate: string,
  prior?: PersistedStationObservation | null
): PersistedStationObservation {
  if (!prior) {
    return createEmptyStationObservation(stationId, reportingDate);
  }
  const canonical = getStation(stationId);
  return {
    stationId,
    stationName: canonical ? canonical.name : (prior.stationName ?? undefined),
    reportingDate,
    tmax: prior.tmax,
    tmaxDate: prior.tmaxDate,
    tmaxSlot: prior.tmaxSlot,
    tmax03Z: prior.tmax03Z,
    tmax12Z: prior.tmax12Z,
    tmaxPreviousDay: prior.tmaxPreviousDay,
    tmin: prior.tmin,
    tminDate: prior.tminDate,
    tminSlot: prior.tminSlot,
    rh0830: prior.rh0830,
    rh1730: prior.rh1730,
    dryBulb0830: prior.dryBulb0830,
    dewPoint0830: prior.dewPoint0830,
    dryBulb1730: prior.dryBulb1730,
    dewPoint1730: prior.dewPoint1730,
    rainfall0830: prior.rainfall0830,
    rainfall1730: prior.rainfall1730,
    rainfall: prior.rainfall,
    mslPressure0830: prior.mslPressure0830,
    mslPressure1730: prior.mslPressure1730,
    visibilityCode: prior.visibilityCode,
    lastUpdatedSlot: null,
    lastUpdatedDate: null,
  };
}

/**
 * Deterministic 15-day operational observation store.
 * - Stores observations partitioned by reporting date.
 * - Retains strictly the latest 15 reporting dates, automatically purging the 16th and older dates.
 * - Merges 03Z and 12Z updates non-destructively for each station.
 * - Survives browser reloads through pluggable ArchiveStorageProvider (localStorage / memory).
 */
export class InMemoryObservationStore implements ObservationStore {
  /** 15-day observation archive partitioned by date: date -> stationId -> PersistedStationObservation */
  private readonly archiveByDate = new Map<string, Map<string, PersistedStationObservation>>();

  /** Raw bulletin text stored by date -> UtcSlot -> raw bulletin string for audit and reprocessing */
  private readonly rawBulletinsByDate = new Map<string, Map<UtcSlot, string>>();

  /** Currently selected/active reporting date */
  private activeReportingDate: string | null = null;

  /** Historical daily snapshots keyed by `${stationId}_${date}` */
  private readonly history = new Map<string, HistoricalObservation>();

  /** Storage provider for persistence */
  private readonly storageProvider: ArchiveStorageProvider;

  /** Maximum number of reporting dates retained (configurable: 15, 30, 60, 120; default 15) */
  private retentionLimit = 15;

  constructor(
    initialHistory: HistoricalObservation[] = [],
    storageProvider?: ArchiveStorageProvider
  ) {
    // Default to BrowserLocalStorageArchiveProvider in browser environment, Memory in Node/tests
    if (storageProvider) {
      this.storageProvider = storageProvider;
    } else if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      this.storageProvider = new BrowserLocalStorageArchiveProvider();
    } else {
      this.storageProvider = new MemoryArchiveStorageProvider();
    }

    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        const savedLimit = window.localStorage.getItem('wxops_retention_days');
        if (savedLimit) {
          const parsed = parseInt(savedLimit, 10);
          if ([15, 30, 60, 120].includes(parsed)) {
            this.retentionLimit = parsed;
          }
        }
      } catch {}
    }

    this.seedHistoricalBaseline(initialHistory);

    // Hydrate from storage provider if available
    const existingArchive = this.storageProvider.load();
    if (existingArchive) {
      this.restoreArchive(existingArchive);
    }
  }

  /**
   * Returns internal map for a specific date, creating it if needed.
   */
  private getDateMap(date: string): Map<string, PersistedStationObservation> {
    let map = this.archiveByDate.get(date);
    if (!map) {
      map = new Map<string, PersistedStationObservation>();
      this.archiveByDate.set(date, map);
    }
    return map;
  }

  /**
   * Enforces the retention limit.
   * If there are > retentionLimit distinct dates, oldest dates beyond the limit are purged.
   */
  private enforceRetentionLimit(): void {
    const dates = Array.from(this.archiveByDate.keys()).sort((a, b) => a.localeCompare(b));
    while (dates.length > this.retentionLimit) {
      const oldestDate = dates.shift()!;
      this.archiveByDate.delete(oldestDate);

      // Prune history snapshots for the deleted date
      for (const key of Array.from(this.history.keys())) {
        if (key.endsWith(`_${oldestDate}`)) {
          this.history.delete(key);
        }
      }
    }
  }

  /**
   * Persists the current archive state to the storage provider.
   */
  private persist(): void {
    try {
      this.storageProvider.save(this.exportArchive());
    } catch (err) {
      console.warn('Failed to persist observation archive:', err);
    }
  }

  /**
   * Retrieves the latest persisted observation for a station strictly prior to beforeDate (or overall).
   */
  private getLatestObservationForStation(
    stationId: string,
    beforeDate?: string
  ): PersistedStationObservation | null {
    const dates = this.getArchivedDates();
    const candidateDates = beforeDate
      ? dates.filter((d) => d < beforeDate)
      : dates;

    for (let i = candidateDates.length - 1; i >= 0; i--) {
      const d = candidateDates[i];
      const map = this.archiveByDate.get(d);
      const obs = map?.get(stationId);
      if (obs) return obs;
    }
    return null;
  }

  /**
   * Ingests 03 UTC observations into persistent state for a date.
   * Updates:
   * - current-day Tmin (0830 IST)
   * - 0830 IST rainfall
   * - 0830 IST RH / dry-bulb / dew-point
   * - 0830 IST visibility & MSLP
   * - previous day Tmax if explicitly reported in 03Z Section 333
   * Preserves:
   * - 1730 IST RH & other 12Z fields
   * - existing Tmax if 03Z omits it
   */
  ingest03Z(observations: ParsedStationObservation[], reportingDate: string): string[] {
    const cleanDate = reportingDate.trim();
    this.activeReportingDate = cleanDate;
    const dateMap = this.getDateMap(cleanDate);
    const updatedIds: string[] = [];
    const previousDate = getPreviousDayDateString(cleanDate);

    for (const obs of observations) {
      if (!obs.stationId) continue;
      const stnId = obs.stationId.trim();

      let current = dateMap.get(stnId);
      if (!current) {
        current = createEmptyStationObservation(stnId, cleanDate);
        dateMap.set(stnId, current);
      }

      current.reportingDate = cleanDate;
      current.has03Z = true;
      current.lastUpdatedSlot = '03Z';
      current.lastUpdatedDate = cleanDate;

      // 1. Current-day Tmin (0830 IST)
      if (obs.tmin !== null && obs.tmin !== undefined && !isNaN(obs.tmin)) {
        if (!current.manualEdits?.tmin) {
          current.tmin = obs.tmin;
          current.tminDate = cleanDate;
          current.tminSlot = '03Z';
        }
      }

      // 2. Previous-day Tmax from Section 333 (if present in 03Z)
      if (obs.tmaxPreviousDay !== null && obs.tmaxPreviousDay !== undefined && !isNaN(obs.tmaxPreviousDay)) {
        current.tmaxPreviousDay = obs.tmaxPreviousDay;
        current.tmax03Z = obs.tmaxPreviousDay;
        if (!current.manualEdits?.tmax && (current.tmaxDate !== cleanDate || current.tmaxSlot !== '12Z')) {
          current.tmax = obs.tmaxPreviousDay;
          current.tmaxDate = previousDate;
          current.tmaxSlot = '03Z';
        }
        // Associate with previous day (D0) in history map without adding a ghost date to archiveByDate
        const histKey = `${stnId}_${previousDate}`;
        const existingHist = this.history.get(histKey);
        this.history.set(histKey, {
          stationId: stnId,
          date: previousDate,
          tmin: existingHist?.tmin ?? null,
          tmax: obs.tmaxPreviousDay,
          rainfall: existingHist?.rainfall ?? null,
          rh0830: existingHist?.rh0830 ?? null,
          rh1730: existingHist?.rh1730 ?? null,
        });

        // If previousDate ALREADY exists in archiveByDate, update its tmax as well:
        const prevMap = this.archiveByDate.get(previousDate);
        if (prevMap) {
          const prevRecord = prevMap.get(stnId);
          if (prevRecord && !prevRecord.manualEdits?.tmax) {
            if (prevRecord.tmax === null) {
              prevRecord.tmax = obs.tmaxPreviousDay;
              prevRecord.tmaxDate = previousDate;
              prevRecord.tmaxSlot = '03Z';
            }
            if (prevRecord.tmax03Z === null || prevRecord.tmax03Z === undefined) {
              prevRecord.tmax03Z = obs.tmaxPreviousDay;
            }
          }
        }
      } else if (!current.manualEdits?.tmax && (current.tmax === null || current.tmaxDate === previousDate || current.tmax03Z === null || current.tmax03Z === undefined)) {
        // Carry forward previous evening's Tmax if 03Z telegram omits Section 333 Group 1
        const prevRecord = this.archiveByDate.get(previousDate)?.get(stnId);
        const prevTmax = (prevRecord?.tmax12Z !== null && prevRecord?.tmax12Z !== undefined)
          ? prevRecord.tmax12Z
          : (prevRecord?.tmax !== null && prevRecord?.tmax !== undefined)
            ? prevRecord.tmax
            : (this.history.get(`${stnId}_${previousDate}`)?.tmax ?? null);
        if (prevTmax !== null && prevTmax !== undefined && !isNaN(prevTmax)) {
          current.tmax03Z = prevTmax;
          current.tmaxPreviousDay = prevTmax;
          if (current.tmaxDate !== cleanDate || current.tmaxSlot !== '12Z') {
            current.tmax = prevTmax;
            current.tmaxDate = previousDate;
            current.tmaxSlot = '03Z';
          }
        }
      }

      // 3. 0830 IST Relative Humidity
      if (obs.relativeHumidity !== null && obs.relativeHumidity !== undefined && !isNaN(obs.relativeHumidity)) {
        if (!current.manualEdits?.rh0830) {
          current.rh0830 = obs.relativeHumidity;
        }
      }

      // 4. 0830 IST Dry-Bulb & Dew-Point
      if (obs.dryBulb !== null && obs.dryBulb !== undefined && !isNaN(obs.dryBulb)) {
        if (!current.manualEdits?.dryBulb0830) {
          current.dryBulb0830 = obs.dryBulb;
        }
      }
      if (obs.dewPoint !== null && obs.dewPoint !== undefined && !isNaN(obs.dewPoint)) {
        if (!current.manualEdits?.dewPoint0830) {
          current.dewPoint0830 = obs.dewPoint;
        }
      }

      // 5. 0830 IST Rainfall
      if (obs.rainfall !== null && obs.rainfall !== undefined && !isNaN(obs.rainfall)) {
        if (!current.manualEdits?.rainfall0830 && !current.manualEdits?.rainfall) {
          current.rainfall0830 = obs.rainfall;
          current.rainfall = obs.rainfall;
        }
      }

      // 6. Visibility Code
      if (obs.visibilityCode) {
        if (!current.manualEdits?.visibilityCode) {
          current.visibilityCode = obs.visibilityCode;
        }
      }

      // 7. MSL Pressure (0830 IST)
      if (obs.mslPressure !== null && obs.mslPressure !== undefined && !isNaN(obs.mslPressure)) {
        if (!current.manualEdits?.mslPressure0830) {
          current.mslPressure0830 = obs.mslPressure;
        }
      }

      // 8. Raw telegram string
      if (obs.rawSynop) {
        current.rawSynop = obs.rawSynop;
        current.rawSynop03Z = obs.rawSynop;
      }

      // Archive historical entry for date
      this.updateHistorySnapshot(current, cleanDate);
      updatedIds.push(stnId);
    }

    this.enforceRetentionLimit();
    this.persist();
    return updatedIds;
  }

  /**
   * Ingests 12 UTC observations into persistent state for a date.
   * Updates:
   * - Tmax (current day maximum temperature from 12Z Section 333)
   * - 1730 IST rainfall (accumulated up to 1730 IST)
   * - 1730 IST RH / dry-bulb / dew-point
   * - 1730 IST MSLP & visibility
   * Preserves:
   * - 0830 IST Tmin, rainfall, and RH from previous 03Z
   */
  ingest12Z(observations: Parsed12UtcStationObservation[], reportingDate: string): string[] {
    const cleanDate = reportingDate.trim();
    this.activeReportingDate = cleanDate;
    const dateMap = this.getDateMap(cleanDate);
    const updatedIds: string[] = [];

    for (const obs of observations) {
      if (!obs.stationId) continue;
      const stnId = obs.stationId.trim();

      let current = dateMap.get(stnId);
      if (!current) {
        current = createEmptyStationObservation(stnId, cleanDate);
        dateMap.set(stnId, current);
      }

      current.reportingDate = cleanDate;
      current.has12Z = true;
      current.lastUpdatedSlot = '12Z';
      current.lastUpdatedDate = cleanDate;

      // 1. Current day Tmax (recorded up to 1730 IST on reportingDate)
      if (obs.tmax !== null && obs.tmax !== undefined && !isNaN(obs.tmax)) {
        current.tmax12Z = obs.tmax;
        if (!current.manualEdits?.tmax) {
          current.tmax = obs.tmax;
          current.tmaxDate = cleanDate;
          current.tmaxSlot = '12Z';
        }

        // Propagate forward to next day's (D1) 03Z record if already present in archiveByDate
        const nextDate = getNextDayDateString(cleanDate);
        const nextMap = this.archiveByDate.get(nextDate);
        if (nextMap) {
          const nextRecord = nextMap.get(stnId);
          if (nextRecord && !nextRecord.manualEdits?.tmax) {
            nextRecord.tmaxPreviousDay = obs.tmax;
            nextRecord.tmax03Z = obs.tmax;
            if (nextRecord.tmax === null || nextRecord.tmaxDate === cleanDate || nextRecord.tmaxSlot === '03Z') {
              nextRecord.tmax = obs.tmax;
              nextRecord.tmaxDate = cleanDate;
              nextRecord.tmaxSlot = '03Z';
              this.updateHistorySnapshot(nextRecord, nextDate);
            }
          }
        }
      }

      // 2. 1730 IST Relative Humidity
      if (obs.relativeHumidity !== null && obs.relativeHumidity !== undefined && !isNaN(obs.relativeHumidity)) {
        if (!current.manualEdits?.rh1730) {
          current.rh1730 = obs.relativeHumidity;
        }
      }

      // 3. 1730 IST Dry-Bulb & Dew-Point
      if (obs.dryBulb !== null && obs.dryBulb !== undefined && !isNaN(obs.dryBulb)) {
        if (!current.manualEdits?.dryBulb1730) {
          current.dryBulb1730 = obs.dryBulb;
        }
      }
      if (obs.dewPoint !== null && obs.dewPoint !== undefined && !isNaN(obs.dewPoint)) {
        if (!current.manualEdits?.dewPoint1730) {
          current.dewPoint1730 = obs.dewPoint;
        }
      }

      // 4. 1730 IST Rainfall
      if (obs.rainfall !== null && obs.rainfall !== undefined && !isNaN(obs.rainfall)) {
        if (!current.manualEdits?.rainfall1730) {
          current.rainfall1730 = obs.rainfall;
        }
        if (!current.manualEdits?.rainfall) {
          current.rainfall = obs.rainfall;
        }
      }

      // 5. Visibility Code
      if (obs.visibilityCode) {
        if (!current.manualEdits?.visibilityCode) {
          current.visibilityCode = obs.visibilityCode;
        }
      }

      // 6. MSL Pressure (1730 IST)
      if (obs.mslPressure !== null && obs.mslPressure !== undefined && !isNaN(obs.mslPressure)) {
        if (!current.manualEdits?.mslPressure1730) {
          current.mslPressure1730 = obs.mslPressure;
        }
      }

      // 7. Raw telegram string
      if (obs.rawSynop) {
        current.rawSynop12Z = obs.rawSynop;
        if (!current.rawSynop) {
          current.rawSynop = obs.rawSynop;
        }
      }

      // Archive historical entry for date
      this.updateHistorySnapshot(current, cleanDate);
      updatedIds.push(stnId);
    }

    this.enforceRetentionLimit();
    this.persist();
    return updatedIds;
  }

  /**
   * Retrieves raw bulletin string for date and slot if stored.
   */
  getRawBulletin(date: string, slot: UtcSlot): string | null {
    return this.rawBulletinsByDate.get(date.trim())?.get(slot) ?? null;
  }

  /**
   * Saves raw bulletin string for date and slot.
   */
  saveRawBulletin(date: string, slot: UtcSlot, rawBulletin: string): void {
    if (!date || !rawBulletin) return;
    const cleanDate = date.trim();
    let map = this.rawBulletinsByDate.get(cleanDate);
    if (!map) {
      map = new Map<UtcSlot, string>();
      this.rawBulletinsByDate.set(cleanDate, map);
    }
    map.set(slot, rawBulletin);
  }

  /**
   * Ingests a raw bulletin for a specific slot and date.
   */
  ingestBulletin(utcSlot: UtcSlot, rawBulletin: string, reportingDate: string): IngestionResult {
    const cleanDate = reportingDate.trim();
    this.saveRawBulletin(cleanDate, utcSlot, rawBulletin);
    let updatedIds: string[] = [];
    let decodedCount = 0;

    if (utcSlot === '03Z') {
      const parsed03 = parseSynopBulletin(rawBulletin);
      decodedCount = parsed03.length;
      updatedIds = this.ingest03Z(parsed03, cleanDate);
    } else {
      const parsed12 = parse12UtcBulletin(rawBulletin);
      decodedCount = parsed12.length;
      updatedIds = this.ingest12Z(parsed12, cleanDate);
    }

    return {
      slot: utcSlot,
      reportingDate: cleanDate,
      decodedCount,
      updatedStationIds: updatedIds,
    };
  }

  /**
   * Ingests a revised bulletin containing one or more station telegrams.
   * Replaces/updates only those stations present in the revised submission.
   * All other stations stored for that date and slot remain completely unchanged.
   */
  ingestRevisedBulletin(utcSlot: UtcSlot, rawBulletin: string, reportingDate: string): IngestionResult {
    const cleanDate = reportingDate.trim();
    this.activeReportingDate = cleanDate;
    this.saveRawBulletin(cleanDate, utcSlot, rawBulletin);
    const updatedIds: string[] = [];

    if (utcSlot === '03Z') {
      const parsed03 = parseSynopBulletin(rawBulletin);
      if (parsed03.length === 0) {
        throw new Error('No valid 03 UTC station telegrams found in revised bulletin.');
      }
      for (const obs of parsed03) {
        if (!obs.stationId) continue;
        this.reviseStationObservation(cleanDate, '03Z', obs.stationId, obs);
        if (!updatedIds.includes(obs.stationId)) {
          updatedIds.push(obs.stationId);
        }
      }
      return {
        slot: '03Z',
        reportingDate: cleanDate,
        decodedCount: parsed03.length,
        updatedStationIds: updatedIds,
      };
    } else {
      const parsed12 = parse12UtcBulletin(rawBulletin);
      if (parsed12.length === 0) {
        throw new Error('No valid 12 UTC station telegrams found in revised bulletin.');
      }
      for (const obs of parsed12) {
        if (!obs.stationId) continue;
        this.reviseStationObservation(cleanDate, '12Z', obs.stationId, obs);
        if (!updatedIds.includes(obs.stationId)) {
          updatedIds.push(obs.stationId);
        }
      }
      return {
        slot: '12Z',
        reportingDate: cleanDate,
        decodedCount: parsed12.length,
        updatedStationIds: updatedIds,
      };
    }
  }

  /**
   * Revises a single station's observation from a parsed telegram for a given date and slot.
   * Replaces/updates that station's observation without modifying other stations.
   */
  reviseStationObservation(
    reportingDate: string,
    utcSlot: UtcSlot,
    stationId: string,
    parsed: ParsedStationObservation | Parsed12UtcStationObservation
  ): PersistedStationObservation {
    const cleanDate = reportingDate.trim();
    const cleanId = stationId.trim();
    const dateMap = this.getDateMap(cleanDate);
    const previousDate = getPreviousDayDateString(cleanDate);

    let current = dateMap.get(cleanId);
    if (!current) {
      current = createEmptyStationObservation(cleanId, cleanDate);
      dateMap.set(cleanId, current);
    }

    current.reportingDate = cleanDate;
    current.lastUpdatedSlot = utcSlot;
    current.lastUpdatedDate = cleanDate;

    if (utcSlot === '03Z') {
      const obs = parsed as ParsedStationObservation;
      if (obs.tmin !== null && obs.tmin !== undefined && !isNaN(obs.tmin)) {
        if (!current.manualEdits?.tmin) {
          current.tmin = obs.tmin;
          current.tminDate = cleanDate;
          current.tminSlot = '03Z';
        }
      }
      if (obs.tmaxPreviousDay !== null && obs.tmaxPreviousDay !== undefined && !isNaN(obs.tmaxPreviousDay)) {
        current.tmaxPreviousDay = obs.tmaxPreviousDay;
        current.tmax03Z = obs.tmaxPreviousDay;
        if (!current.manualEdits?.tmax && (current.tmaxDate !== cleanDate || current.tmaxSlot !== '12Z')) {
          current.tmax = obs.tmaxPreviousDay;
          current.tmaxDate = previousDate;
          current.tmaxSlot = '03Z';
        }
        // Associate with previous day (D0) in history map without adding a ghost date to archiveByDate
        const histKey = `${cleanId}_${previousDate}`;
        const existingHist = this.history.get(histKey);
        this.history.set(histKey, {
          stationId: cleanId,
          date: previousDate,
          tmin: existingHist?.tmin ?? null,
          tmax: obs.tmaxPreviousDay,
          rainfall: existingHist?.rainfall ?? null,
          rh0830: existingHist?.rh0830 ?? null,
          rh1730: existingHist?.rh1730 ?? null,
        });

        // If previousDate ALREADY exists in archiveByDate, update its tmax as well:
        const prevMap = this.archiveByDate.get(previousDate);
        if (prevMap) {
          const prevRecord = prevMap.get(cleanId);
          if (prevRecord && !prevRecord.manualEdits?.tmax) {
            if (prevRecord.tmax === null) {
              prevRecord.tmax = obs.tmaxPreviousDay;
              prevRecord.tmaxDate = previousDate;
              prevRecord.tmaxSlot = '03Z';
            }
            if (prevRecord.tmax03Z === null || prevRecord.tmax03Z === undefined) {
              prevRecord.tmax03Z = obs.tmaxPreviousDay;
            }
          }
        }
      } else if (!current.manualEdits?.tmax && (current.tmax === null || current.tmaxDate === previousDate || current.tmax03Z === null || current.tmax03Z === undefined)) {
        // Carry forward previous evening's Tmax if 03Z telegram omits Section 333 Group 1
        const prevRecord = this.archiveByDate.get(previousDate)?.get(cleanId);
        const prevTmax = (prevRecord?.tmax12Z !== null && prevRecord?.tmax12Z !== undefined)
          ? prevRecord.tmax12Z
          : (prevRecord?.tmax !== null && prevRecord?.tmax !== undefined)
            ? prevRecord.tmax
            : (this.history.get(`${cleanId}_${previousDate}`)?.tmax ?? null);
        if (prevTmax !== null && prevTmax !== undefined && !isNaN(prevTmax)) {
          current.tmax03Z = prevTmax;
          current.tmaxPreviousDay = prevTmax;
          if (current.tmaxDate !== cleanDate || current.tmaxSlot !== '12Z') {
            current.tmax = prevTmax;
            current.tmaxDate = previousDate;
            current.tmaxSlot = '03Z';
          }
        }
      }
      if (obs.relativeHumidity !== null && obs.relativeHumidity !== undefined && !isNaN(obs.relativeHumidity)) {
        if (!current.manualEdits?.rh0830) {
          current.rh0830 = obs.relativeHumidity;
        }
      }
      if (obs.dryBulb !== null && obs.dryBulb !== undefined && !isNaN(obs.dryBulb)) {
        if (!current.manualEdits?.dryBulb0830) {
          current.dryBulb0830 = obs.dryBulb;
        }
      }
      if (obs.dewPoint !== null && obs.dewPoint !== undefined && !isNaN(obs.dewPoint)) {
        if (!current.manualEdits?.dewPoint0830) {
          current.dewPoint0830 = obs.dewPoint;
        }
      }
      if (obs.rainfall !== null && obs.rainfall !== undefined && !isNaN(obs.rainfall)) {
        if (!current.manualEdits?.rainfall0830 && !current.manualEdits?.rainfall) {
          current.rainfall0830 = obs.rainfall;
          current.rainfall = obs.rainfall;
        }
      }
      if (obs.visibilityCode) {
        if (!current.manualEdits?.visibilityCode) {
          current.visibilityCode = obs.visibilityCode;
        }
      }
      if (obs.mslPressure !== null && obs.mslPressure !== undefined && !isNaN(obs.mslPressure)) {
        if (!current.manualEdits?.mslPressure0830) {
          current.mslPressure0830 = obs.mslPressure;
        }
      }
      if (obs.rawSynop) {
        current.rawSynop = obs.rawSynop;
        current.rawSynop03Z = obs.rawSynop;
      }
    } else {
      const obs = parsed as Parsed12UtcStationObservation;
      if (obs.tmax !== null && obs.tmax !== undefined && !isNaN(obs.tmax)) {
        current.tmax12Z = obs.tmax;
        if (!current.manualEdits?.tmax) {
          current.tmax = obs.tmax;
          current.tmaxDate = cleanDate;
          current.tmaxSlot = '12Z';
        }

        // Propagate forward to next day's (D1) 03Z record if already present in archiveByDate
        const nextDate = getNextDayDateString(cleanDate);
        const nextMap = this.archiveByDate.get(nextDate);
        if (nextMap) {
          const nextRecord = nextMap.get(cleanId);
          if (nextRecord && !nextRecord.manualEdits?.tmax) {
            nextRecord.tmaxPreviousDay = obs.tmax;
            nextRecord.tmax03Z = obs.tmax;
            if (nextRecord.tmax === null || nextRecord.tmaxDate === cleanDate || nextRecord.tmaxSlot === '03Z') {
              nextRecord.tmax = obs.tmax;
              nextRecord.tmaxDate = cleanDate;
              nextRecord.tmaxSlot = '03Z';
              this.updateHistorySnapshot(nextRecord, nextDate);
            }
          }
        }
      }
      if (obs.rainfall !== null && obs.rainfall !== undefined && !isNaN(obs.rainfall)) {
        if (!current.manualEdits?.rainfall1730) {
          current.rainfall1730 = obs.rainfall;
        }
        if (!current.manualEdits?.rainfall) {
          current.rainfall = obs.rainfall;
        }
      }
      if (obs.relativeHumidity !== null && obs.relativeHumidity !== undefined && !isNaN(obs.relativeHumidity)) {
        if (!current.manualEdits?.rh1730) {
          current.rh1730 = obs.relativeHumidity;
        }
      }
      if (obs.dryBulb !== null && obs.dryBulb !== undefined && !isNaN(obs.dryBulb)) {
        if (!current.manualEdits?.dryBulb1730) {
          current.dryBulb1730 = obs.dryBulb;
        }
      }
      if (obs.dewPoint !== null && obs.dewPoint !== undefined && !isNaN(obs.dewPoint)) {
        if (!current.manualEdits?.dewPoint1730) {
          current.dewPoint1730 = obs.dewPoint;
        }
      }
      if (obs.visibilityCode) {
        if (!current.manualEdits?.visibilityCode) {
          current.visibilityCode = obs.visibilityCode;
        }
      }
      if (obs.mslPressure !== null && obs.mslPressure !== undefined && !isNaN(obs.mslPressure)) {
        if (!current.manualEdits?.mslPressure1730) {
          current.mslPressure1730 = obs.mslPressure;
        }
      }
      if (obs.rawSynop) {
        current.rawSynop12Z = obs.rawSynop;
        if (!current.rawSynop) {
          current.rawSynop = obs.rawSynop;
        }
      }
    }

    this.updateHistorySnapshot(current, cleanDate);
    this.enforceRetentionLimit();
    this.persist();
    return current;
  }

  /**
   * Resolves target date: explicit date, or active date, or latest archived date.
   */
  private resolveTargetDate(date?: string): string | null {
    if (date && date.trim()) return date.trim();
    if (this.activeReportingDate) return this.activeReportingDate;
    const dates = this.getArchivedDates();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }

  /**
   * Retrieves un-resolved raw observation record stored strictly on a specific date.
   */
  getRawStationObservation(stationId: string, date: string): PersistedStationObservation | null {
    if (!date || !date.trim()) return null;
    const dateMap = this.archiveByDate.get(date.trim());
    const obs = dateMap?.get(stationId.trim());
    return obs ? { ...obs } : null;
  }

  /**
   * Updates observation values for a station on a specific reporting date.
   */
  updateStationObservation(
    date: string,
    stationId: string,
    updates: Partial<PersistedStationObservation>
  ): PersistedStationObservation {
    const cleanDate = date.trim();
    const cleanId = stationId.trim();
    const map = this.getDateMap(cleanDate);
    const existing = map.get(cleanId) ?? createEmptyStationObservation(cleanId, cleanDate);

    // Track manually edited fields
    const manualEdits: Record<string, boolean> = {
      ...(existing.manualEdits || {}),
      ...(updates.manualEdits || {}),
    };

    const ignoredKeys = new Set([
      'stationId',
      'reportingDate',
      'lastUpdatedDate',
      'lastUpdatedSlot',
      'rawSynop',
      'rawSynop03Z',
      'rawSynop12Z',
      'manualEdits',
    ]);

    for (const key of Object.keys(updates)) {
      if (!ignoredKeys.has(key)) {
        manualEdits[key] = true;
      }
    }

    const canonical = getStation(cleanId);
    const updated: PersistedStationObservation = {
      ...existing,
      ...updates,
      stationName: canonical ? canonical.name : (existing.stationName || updates.stationName),
      manualEdits,
      stationId: cleanId,
      reportingDate: cleanDate,
      lastUpdatedDate: cleanDate,
    };
    map.set(cleanId, updated);
    this.updateHistorySnapshot(updated, cleanDate);
    this.persist();
    return updated;
  }

  /**
   * Hydrates/updates observation state directly from server or archive without treating fields as manual cell edits.
   */
  setStationObservationFromServer(
    date: string,
    stationId: string,
    obs: Partial<PersistedStationObservation>
  ): PersistedStationObservation {
    const cleanDate = date.trim();
    const cleanId = stationId.trim();
    const map = this.getDateMap(cleanDate);
    const canonical = getStation(cleanId);
    const existing = map.get(cleanId) ?? createEmptyStationObservation(cleanId, cleanDate);

    const record: PersistedStationObservation = {
      ...existing,
      ...obs,
      stationId: cleanId,
      stationName: canonical ? canonical.name : (obs.stationName || existing.stationName || undefined),
      reportingDate: cleanDate,
      manualEdits: obs.manualEdits && Object.keys(obs.manualEdits).length > 0 ? { ...obs.manualEdits } : undefined,
    };

    map.set(cleanId, record);
    this.updateHistorySnapshot(record, cleanDate);
    this.persist();
    return record;
  }

  /**
   * Returns persisted observation for a single station.
   */
  getStationObservation(stationId: string, date?: string): PersistedStationObservation | null {
    const targetDate = this.resolveTargetDate(date);
    if (!targetDate) return null;
    const dateMap = this.archiveByDate.get(targetDate);
    const stn = dateMap?.get(stationId.trim());
    return stn ? { ...stn } : null;
  }

  /**
   * Returns all persisted station observations for a reporting date.
   */
  getAllObservations(date?: string): Map<string, PersistedStationObservation> {
    const copy = new Map<string, PersistedStationObservation>();
    const targetDate = this.resolveTargetDate(date);
    if (!targetDate) return copy;

    const dateMap = this.archiveByDate.get(targetDate);
    if (dateMap) {
      for (const [id, obs] of dateMap.entries()) {
        copy.set(id, { ...obs });
      }
    }
    return copy;
  }

  /**
   * Returns sorted list of dates currently retained in the archive (ascending).
   */
  getArchivedDates(): string[] {
    return Array.from(this.archiveByDate.keys()).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Returns total count of dates currently archived (max 15).
   */
  getArchiveSize(): number {
    return this.archiveByDate.size;
  }

  /**
   * Returns historical baseline observation for prior 24-hr calculations.
   * Satisfies HistoricalObservationProvider interface.
   */
  getObservation(stationId: string, date: string): HistoricalObservation | null {
    return this.getHistoricalObservation(stationId, date);
  }

  /**
   * Returns historical observation for prior 24-hr calculations.
   * Checks the 15-day observation archive first, then the baseline history map.
   */
  getHistoricalObservation(stationId: string, date: string): HistoricalObservation | null {
    const cleanStn = stationId.trim();
    const cleanDate = date.trim();

    const key = `${cleanStn}_${cleanDate}`;

    // 1. Check if observation exists in the 15-day archive for that date
    const dateMap = this.archiveByDate.get(cleanDate);
    if (dateMap) {
      const archivedObs = dateMap.get(cleanStn);
      if (archivedObs) {
        const histTmax =
          archivedObs.tmax12Z ??
          (archivedObs.tmaxSlot === '12Z' ? archivedObs.tmax : null) ??
          this.history.get(key)?.tmax ??
          archivedObs.tmax ??
          null;
        return {
          stationId: cleanStn,
          date: cleanDate,
          tmin: archivedObs.tmin,
          tmax: histTmax,
          rainfall: archivedObs.rainfall,
          rh0830: archivedObs.rh0830,
          rh1730: archivedObs.rh1730,
        };
      }
    }

    // 2. Check seeded baseline history
    return this.history.get(key) ?? null;
  }

  /**
   * Exports the entire 15-day archive as a canonical JSON object.
   */
  exportArchive(): ObservationArchive {
    const dates = this.getArchivedDates();
    const records: Record<string, Record<string, PersistedStationObservation>> = {};
    const stationSet = new Set<string>();

    for (const d of dates) {
      const dateMap = this.archiveByDate.get(d);
      if (!dateMap) continue;
      const stnRecords: Record<string, PersistedStationObservation> = {};
      for (const [stnId, obs] of dateMap.entries()) {
        const canonical = getStation(stnId);
        stnRecords[stnId] = {
          ...obs,
          stationName: canonical ? canonical.name : (obs.stationName ?? undefined),
        };
        stationSet.add(stnId);
      }
      records[d] = stnRecords;
    }

    const exportedBulletins: Record<string, Partial<Record<UtcSlot, string>>> = {};
    for (const [d, slotMap] of this.rawBulletinsByDate.entries()) {
      const obj: Partial<Record<UtcSlot, string>> = {};
      for (const [slot, text] of slotMap.entries()) {
        obj[slot] = text;
      }
      if (Object.keys(obj).length > 0) {
        exportedBulletins[d] = obj;
      }
    }

    return {
      metadata: {
        version: '1.0',
        system: 'WXOps',
        exportedAt: new Date().toISOString(),
        retentionLimit: this.retentionLimit,
        dateCount: dates.length,
        dates,
        stationCount: stationSet.size,
      },
      records,
      ...(Object.keys(exportedBulletins).length > 0 ? { rawBulletins: exportedBulletins } : {}),
    };
  }

  /**
   * Returns current configured retention limit.
   */
  getRetentionLimit(): number {
    return this.retentionLimit;
  }

  /**
   * Sets retention limit (15, 30, 60, 120) and prunes excess records.
   */
  setRetentionLimit(limit: number): void {
    if (limit > 0) {
      this.retentionLimit = limit;
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        try {
          window.localStorage.setItem('wxops_retention_days', String(limit));
        } catch {}
      }
      this.enforceRetentionLimit();
      this.persist();
    }
  }

  /**
   * Exports the archive as a formatted JSON string.
   */
  exportArchiveJson(pretty = true): string {
    return JSON.stringify(this.exportArchive(), null, pretty ? 2 : undefined);
  }

  /**
   * Exports the archive as a CSV string for tabular review.
   */
  exportArchiveCsv(): string {
    return convertArchiveToCsv(this.exportArchive());
  }

  /**
   * Restores/imports the archive from a JSON string or object (overwriting store).
   * Validates schema, rejects malformed records, enforces retention limit.
   */
  restoreArchive(archiveData: unknown): ArchiveRestoreResult {
    const validation = validateArchiveData(archiveData, { enforceRetention: true });
    if (!validation.valid || !validation.archive) {
      return { success: false, datesRestored: [], stationCount: 0, error: validation.error };
    }

    const { archive } = validation;
    this.archiveByDate.clear();
    this.rawBulletinsByDate.clear();

    const uniqueStations = new Set<string>();
    const dates = Object.keys(archive.records).sort((a, b) => a.localeCompare(b));

    for (const d of dates) {
      const dateMap = new Map<string, PersistedStationObservation>();
      const rawMap = archive.records[d];
      for (const [stnId, obs] of Object.entries(rawMap)) {
        dateMap.set(stnId, { ...obs });
        uniqueStations.add(stnId);
        this.updateHistorySnapshot(obs, d);
      }
      this.archiveByDate.set(d, dateMap);
    }

    if (archive.rawBulletins) {
      for (const [d, slotMap] of Object.entries(archive.rawBulletins)) {
        if (!slotMap) continue;
        const bMap = new Map<UtcSlot, string>();
        for (const [slot, text] of Object.entries(slotMap)) {
          if (text && (slot === '03Z' || slot === '12Z')) {
            bMap.set(slot as UtcSlot, text);
          }
        }
        if (bMap.size > 0) {
          this.rawBulletinsByDate.set(d, bMap);
        }
      }
    }

    this.enforceRetentionLimit();

    const restoredDates = this.getArchivedDates();
    if (restoredDates.length > 0) {
      this.activeReportingDate = restoredDates[restoredDates.length - 1];
    }

    this.persist();

    return {
      success: true,
      datesRestored: restoredDates,
      stationCount: uniqueStations.size,
    };
  }

  /**
   * Imports an archived historical database with deterministic duplicate handling,
   * preserving existing observations and database state by default.
   */
  importHistoricalArchive(
    archiveData: unknown,
    options?: ArchiveImportOptions
  ): ArchiveImportSummary {
    const validation = validateArchiveData(archiveData);
    if (!validation.valid || !validation.archive) {
      return {
        success: false,
        recordsAdded: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsRejected: 0,
        datesImported: [],
        totalDatesInStore: this.archiveByDate.size,
        error: validation.error ?? 'Invalid archive data format',
      };
    }

    const { archive } = validation;
    const policy: DuplicateHandlingPolicy = options?.duplicatePolicy ?? 'preserve_existing';

    let recordsAdded = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;
    let recordsRejected = 0;
    const datesImportedSet = new Set<string>();

    for (const [dateStr, stnDict] of Object.entries(archive.records)) {
      datesImportedSet.add(dateStr);
      const existingDateMap = this.getDateMap(dateStr);

      for (const [stnId, incomingObs] of Object.entries(stnDict)) {
        if (!stnId || !incomingObs) {
          recordsRejected++;
          continue;
        }

        const existingObs = existingDateMap.get(stnId);

        if (!existingObs) {
          // New station/date record
          existingDateMap.set(stnId, { ...incomingObs });
          this.updateHistorySnapshot(incomingObs, dateStr);
          recordsAdded++;
        } else {
          // Duplicate station/date record
          if (policy === 'preserve_existing') {
            // Keep existing data untouched by default
            recordsSkipped++;
          } else if (policy === 'update_existing') {
            // Overwrite existing record with incoming data
            existingDateMap.set(stnId, { ...incomingObs });
            this.updateHistorySnapshot(incomingObs, dateStr);
            recordsUpdated++;
          } else if (policy === 'merge_fields') {
            // Non-destructive field-level merge: fill missing/null fields only
            let wasUpdated = false;
            const merged = { ...existingObs };
            for (const key of Object.keys(incomingObs) as Array<keyof PersistedStationObservation>) {
              if (key === 'manualEdits') {
                if (incomingObs.manualEdits) {
                  merged.manualEdits = {
                    ...(merged.manualEdits || {}),
                    ...incomingObs.manualEdits,
                  };
                }
                continue;
              }
              if (merged[key] === null || merged[key] === undefined) {
                if (incomingObs[key] !== null && incomingObs[key] !== undefined) {
                  (merged as any)[key] = incomingObs[key];
                  wasUpdated = true;
                }
              }
            }
            existingDateMap.set(stnId, merged);
            this.updateHistorySnapshot(merged, dateStr);
            if (wasUpdated) {
              recordsUpdated++;
            } else {
              recordsSkipped++;
            }
          }
        }
      }
    }

    // Merge rawBulletins if present in archive
    if (archive.rawBulletins) {
      for (const [d, slotMap] of Object.entries(archive.rawBulletins)) {
        if (!slotMap) continue;
        let dateBulletins = this.rawBulletinsByDate.get(d);
        if (!dateBulletins) {
          dateBulletins = new Map<UtcSlot, string>();
          this.rawBulletinsByDate.set(d, dateBulletins);
        }
        for (const [slot, text] of Object.entries(slotMap)) {
          if (text && (slot === '03Z' || slot === '12Z')) {
            if (policy === 'preserve_existing' && dateBulletins.has(slot as UtcSlot)) {
              // preserve existing
            } else {
              dateBulletins.set(slot as UtcSlot, text);
            }
          }
        }
      }
    }

    // Retain all imported historical dates by default
    if (options?.retainAllImportedDates !== false) {
      this.retentionLimit = Math.max(this.retentionLimit, this.archiveByDate.size);
    } else {
      this.enforceRetentionLimit();
    }

    this.persist();

    return {
      success: true,
      recordsAdded,
      recordsUpdated,
      recordsSkipped,
      recordsRejected,
      datesImported: Array.from(datesImportedSet).sort(),
      totalDatesInStore: this.archiveByDate.size,
    };
  }

  /**
   * Seeds historical baseline observations.
   */
  seedHistoricalBaseline(observations: HistoricalObservation[]): void {
    for (const obs of observations) {
      if (!obs.stationId || !obs.date) continue;
      this.history.set(`${obs.stationId}_${obs.date}`, { ...obs });
    }
  }

  /**
   * Clears all in-memory and persistent storage state.
   */
  clear(): void {
    this.archiveByDate.clear();
    this.rawBulletinsByDate.clear();
    this.history.clear();
    this.activeReportingDate = null;
    if (this.storageProvider.clear) {
      this.storageProvider.clear();
    }
  }

  /**
   * Helper to maintain the historical observation snapshot map.
   */
  private updateHistorySnapshot(state: PersistedStationObservation, date: string): void {
    const key = `${state.stationId}_${date}`;
    const existing = this.history.get(key);

    this.history.set(key, {
      stationId: state.stationId,
      date,
      tmin: state.tmin ?? existing?.tmin ?? null,
      tmax: state.tmax ?? existing?.tmax ?? null,
      rainfall: state.rainfall ?? existing?.rainfall ?? null,
      rh0830: state.rh0830 ?? existing?.rh0830 ?? null,
      rh1730: state.rh1730 ?? existing?.rh1730 ?? null,
    });
  }
}

/**
 * Singleton production observation store instance.
 */
export const defaultObservationStore = new InMemoryObservationStore();
