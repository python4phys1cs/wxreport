/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  PersistedStationObservation,
  ObservationArchive,
  UtcSlot,
  DuplicateHandlingPolicy,
} from '../../engine/observationStore.ts';
import { getPreviousDayDateString, getNextDayDateString } from '../../engine/observationStore.ts';
import { parseSynopBulletin, parse12UtcBulletin } from '../../parser/synopDecoder.ts';
import { getStation } from '../../constants/stationRegistry.ts';

/**
 * Database row definition for station_observations table.
 */
export interface DbStationObservationRow {
  reporting_date: string;
  station_id: string;
  station_name: string | null;
  tmax: number | null;
  tmax_date: string | null;
  tmax_slot: string | null;
  tmin: number | null;
  tmin_date: string | null;
  tmin_slot: string | null;
  tmax_previous_day: number | null;
  rh0830: number | null;
  rh1730: number | null;
  dry_bulb0830: number | null;
  dew_point0830: number | null;
  dry_bulb1730: number | null;
  dew_point1730: number | null;
  rainfall0830: number | null;
  rainfall1730: number | null;
  rainfall: number | null;
  msl_pressure0830: number | null;
  msl_pressure1730: number | null;
  visibility_code: string | null;
  last_updated_slot: string | null;
  last_updated_date: string | null;
  raw_synop: string | null;
  raw_synop03z: string | null;
  raw_synop12z: string | null;
  manual_edits: Record<string, boolean>;
  has03z: boolean;
  has12z: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DbRawBulletinRow {
  reporting_date: string;
  utc_slot: '03Z' | '12Z';
  raw_bulletin: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Converts a database row to a canonical PersistedStationObservation.
 */
export function rowToObservation(row: DbStationObservationRow): PersistedStationObservation {
  const canonical = getStation(row.station_id);
  const stnName = canonical ? canonical.name : (row.station_name ?? undefined);

  return {
    stationId: row.station_id,
    stationName: stnName,
    reportingDate: row.reporting_date,
    tmax: row.tmax !== null && row.tmax !== undefined ? Number(row.tmax) : null,
    tmaxDate: row.tmax_date ?? null,
    tmaxSlot: (row.tmax_slot as UtcSlot) ?? null,
    tmin: row.tmin !== null && row.tmin !== undefined ? Number(row.tmin) : null,
    tminDate: row.tmin_date ?? null,
    tminSlot: (row.tmin_slot as UtcSlot) ?? null,
    tmaxPreviousDay: row.tmax_previous_day !== null && row.tmax_previous_day !== undefined ? Number(row.tmax_previous_day) : null,
    rh0830: row.rh0830 !== null && row.rh0830 !== undefined ? Math.round(Number(row.rh0830)) : null,
    rh1730: row.rh1730 !== null && row.rh1730 !== undefined ? Math.round(Number(row.rh1730)) : null,
    dryBulb0830: row.dry_bulb0830 !== null && row.dry_bulb0830 !== undefined ? Number(row.dry_bulb0830) : null,
    dewPoint0830: row.dew_point0830 !== null && row.dew_point0830 !== undefined ? Number(row.dew_point0830) : null,
    dryBulb1730: row.dry_bulb1730 !== null && row.dry_bulb1730 !== undefined ? Number(row.dry_bulb1730) : null,
    dewPoint1730: row.dew_point1730 !== null && row.dew_point1730 !== undefined ? Number(row.dew_point1730) : null,
    rainfall0830: row.rainfall0830 !== null && row.rainfall0830 !== undefined ? Number(row.rainfall0830) : null,
    rainfall1730: row.rainfall1730 !== null && row.rainfall1730 !== undefined ? Number(row.rainfall1730) : null,
    rainfall: row.rainfall !== null && row.rainfall !== undefined ? Number(row.rainfall) : null,
    mslPressure0830: row.msl_pressure0830 !== null && row.msl_pressure0830 !== undefined ? Number(row.msl_pressure0830) : null,
    mslPressure1730: row.msl_pressure1730 !== null && row.msl_pressure1730 !== undefined ? Number(row.msl_pressure1730) : null,
    visibilityCode: row.visibility_code ?? null,
    lastUpdatedSlot: (row.last_updated_slot as UtcSlot) ?? null,
    lastUpdatedDate: row.last_updated_date ?? null,
    rawSynop: row.raw_synop ?? undefined,
    rawSynop03Z: row.raw_synop03z ?? undefined,
    rawSynop12Z: row.raw_synop12z ?? undefined,
    manualEdits: row.manual_edits && Object.keys(row.manual_edits).length > 0 ? row.manual_edits : undefined,
    has03Z: Boolean(row.has03z),
    has12Z: Boolean(row.has12z),
  };
}

/**
 * Converts a PersistedStationObservation to a database row.
 */
export function observationToRow(obs: PersistedStationObservation): DbStationObservationRow {
  const canonical = getStation(obs.stationId);
  const stnName = canonical ? canonical.name : (obs.stationName ?? null);

  return {
    reporting_date: obs.reportingDate,
    station_id: obs.stationId,
    station_name: stnName,
    tmax: obs.tmax ?? null,
    tmax_date: obs.tmaxDate ?? null,
    tmax_slot: obs.tmaxSlot ?? null,
    tmin: obs.tmin ?? null,
    tmin_date: obs.tminDate ?? null,
    tmin_slot: obs.tminSlot ?? null,
    tmax_previous_day: obs.tmaxPreviousDay ?? null,
    rh0830: obs.rh0830 ?? null,
    rh1730: obs.rh1730 ?? null,
    dry_bulb0830: obs.dryBulb0830 ?? null,
    dew_point0830: obs.dewPoint0830 ?? null,
    dry_bulb1730: obs.dryBulb1730 ?? null,
    dew_point1730: obs.dewPoint1730 ?? null,
    rainfall0830: obs.rainfall0830 ?? null,
    rainfall1730: obs.rainfall1730 ?? null,
    rainfall: obs.rainfall ?? null,
    msl_pressure0830: obs.mslPressure0830 ?? null,
    msl_pressure1730: obs.mslPressure1730 ?? null,
    visibility_code: obs.visibilityCode ?? null,
    last_updated_slot: obs.lastUpdatedSlot ?? null,
    last_updated_date: obs.lastUpdatedDate ?? null,
    raw_synop: obs.rawSynop ?? null,
    raw_synop03z: obs.rawSynop03Z ?? null,
    raw_synop12z: obs.rawSynop12Z ?? null,
    manual_edits: obs.manualEdits ?? {},
    has03z: Boolean(obs.has03Z),
    has12z: Boolean(obs.has12Z),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Returns whether Supabase is configured via environment variables.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

let cachedSupabaseClient: SupabaseClient | null = null;

/**
 * Returns a configured SupabaseClient or null if unconfigured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedSupabaseClient) return cachedSupabaseClient;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  cachedSupabaseClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedSupabaseClient;
}

/**
 * Service class for PostgreSQL operations on Supabase.
 */
export class SupabaseObservationStoreService {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /**
   * Health check / ping database.
   */
  async checkConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const { data, error } = await this.client
        .from('wxops_metadata')
        .select('key')
        .limit(1);

      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Fetches all observations for a specific reporting date.
   */
  async getObservationsForDate(date: string): Promise<PersistedStationObservation[]> {
    const cleanDate = date.trim();
    const { data, error } = await this.client
      .from('station_observations')
      .select('*')
      .eq('reporting_date', cleanDate);

    if (error) {
      throw new Error(`Database error fetching observations for date ${cleanDate}: ${error.message}`);
    }

    return (data || []).map((row: DbStationObservationRow) => rowToObservation(row));
  }

  /**
   * Fetches raw bulletins for a specific reporting date.
   */
  async getRawBulletinsForDate(date: string): Promise<Record<UtcSlot, string>> {
    const cleanDate = date.trim();
    const { data, error } = await this.client
      .from('raw_bulletins')
      .select('*')
      .eq('reporting_date', cleanDate);

    if (error) {
      throw new Error(`Database error fetching bulletins for date ${cleanDate}: ${error.message}`);
    }

    const res: Record<UtcSlot, string> = { '03Z': '', '12Z': '' };
    for (const row of data || []) {
      if (row.utc_slot === '03Z' || row.utc_slot === '12Z') {
        res[row.utc_slot as UtcSlot] = row.raw_bulletin;
      }
    }
    return res;
  }

  /**
   * Fetches distinct archived dates currently stored in database.
   */
  async getArchivedDates(): Promise<string[]> {
    const { data, error } = await this.client
      .from('station_observations')
      .select('reporting_date')
      .order('reporting_date', { ascending: true });

    if (error) {
      throw new Error(`Database error fetching archived dates: ${error.message}`);
    }

    const set = new Set<string>();
    for (const row of data || []) {
      if (row.reporting_date) set.add(row.reporting_date);
    }
    return Array.from(set).sort();
  }

  /**
   * Ingests a raw SYNOP bulletin (03Z or 12Z) for a reporting date.
   * Performs an atomic merge respecting cycle field boundaries, duplicate policies,
   * and previous-day maximum temperature associations.
   */
  async ingestBulletin(
    utcSlot: UtcSlot,
    rawBulletin: string,
    reportingDate: string,
    duplicatePolicy: DuplicateHandlingPolicy = 'merge_fields'
  ): Promise<{
    slot: UtcSlot;
    reportingDate: string;
    decodedCount: number;
    updatedStationIds: string[];
  }> {
    const cleanDate = reportingDate.trim();
    const previousDate = getPreviousDayDateString(cleanDate);

    // Save raw bulletin
    const { error: bErr } = await this.client
      .from('raw_bulletins')
      .upsert({
        reporting_date: cleanDate,
        utc_slot: utcSlot,
        raw_bulletin: rawBulletin,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'reporting_date,utc_slot' });

    if (bErr) {
      throw new Error(`Failed to store raw bulletin in PostgreSQL: ${bErr.message}`);
    }

    // Parse bulletin
    let decodedCount = 0;
    const updatedStationIds: string[] = [];

    // Fetch existing records for this date to execute deterministic merging
    const existing = await this.getObservationsForDate(cleanDate);
    const existingMap = new Map<string, PersistedStationObservation>();
    for (const obs of existing) {
      existingMap.set(obs.stationId, obs);
    }

    const rowsToUpsert: DbStationObservationRow[] = [];
    const priorDayRowsToUpsert: DbStationObservationRow[] = [];
    const nextDayRowsToUpsert: DbStationObservationRow[] = [];

    if (utcSlot === '03Z') {
      const parsed03 = parseSynopBulletin(rawBulletin);
      decodedCount = parsed03.length;
      const priorExisting = await this.getObservationsForDate(previousDate).catch(() => []);
      const priorExistingMap = new Map<string, PersistedStationObservation>();
      for (const p of priorExisting) {
        priorExistingMap.set(p.stationId, p);
      }

      for (const obs of parsed03) {
        if (!obs.stationId) continue;
        const stnId = obs.stationId.trim();
        const current = existingMap.get(stnId) ?? {
          stationId: stnId,
          stationName: getStation(stnId)?.name,
          reportingDate: cleanDate,
          tmax: null,
          tmaxDate: null,
          tmaxSlot: null,
          tmin: null,
          tminDate: null,
          tminSlot: null,
          tmaxPreviousDay: null,
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
          has03Z: false,
          has12Z: false,
        };

        if (duplicatePolicy === 'preserve_existing' && current.has03Z) {
          continue;
        }

        current.has03Z = true;
        current.lastUpdatedSlot = '03Z';
        current.lastUpdatedDate = cleanDate;

        // Morning Tmin
        if (obs.tmin !== null && obs.tmin !== undefined && !isNaN(obs.tmin)) {
          if (!current.manualEdits?.tmin || duplicatePolicy === 'update_existing') {
            current.tmin = obs.tmin;
            current.tminDate = cleanDate;
            current.tminSlot = '03Z';
          }
        }

        // Section 333 previous day Tmax
        if (obs.tmaxPreviousDay !== null && obs.tmaxPreviousDay !== undefined && !isNaN(obs.tmaxPreviousDay)) {
          current.tmaxPreviousDay = obs.tmaxPreviousDay;
          if (!current.manualEdits?.tmax && (current.tmaxDate !== cleanDate || current.tmaxSlot !== '12Z')) {
            current.tmax = obs.tmaxPreviousDay;
            current.tmaxDate = previousDate;
            current.tmaxSlot = '03Z';
          }

          // Backfill previous day (D0) record in Supabase so historical 24h comparisons succeed
          const priorRec = priorExistingMap.get(stnId);
          if (priorRec) {
            if ((priorRec.tmax === null || priorRec.tmax === undefined) && !priorRec.manualEdits?.tmax) {
              priorRec.tmax = obs.tmaxPreviousDay;
              priorRec.tmaxDate = previousDate;
              priorRec.tmaxSlot = '03Z';
              priorDayRowsToUpsert.push(observationToRow(priorRec));
            }
          } else {
            const newPrior: PersistedStationObservation = {
              stationId: stnId,
              stationName: getStation(stnId)?.name,
              reportingDate: previousDate,
              tmax: obs.tmaxPreviousDay,
              tmaxDate: previousDate,
              tmaxSlot: '03Z',
              tmin: null,
              tminDate: null,
              tminSlot: null,
              tmaxPreviousDay: null,
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
              lastUpdatedSlot: '03Z',
              lastUpdatedDate: cleanDate,
              has03Z: false,
              has12Z: false,
            };
            priorDayRowsToUpsert.push(observationToRow(newPrior));
          }
        } else if (!current.manualEdits?.tmax && (current.tmax === null || current.tmaxDate === previousDate)) {
          // Carry forward previous day's evening Tmax if 03Z telegram omits Section 333 Group 1
          const priorRec = priorExistingMap.get(stnId);
          if (priorRec && priorRec.tmax !== null && priorRec.tmax !== undefined && !isNaN(priorRec.tmax)) {
            current.tmax = priorRec.tmax;
            current.tmaxDate = previousDate;
            current.tmaxSlot = '03Z';
            current.tmaxPreviousDay = priorRec.tmax;
          }
        }

        // Morning 0830 RH
        if (obs.relativeHumidity !== null && obs.relativeHumidity !== undefined && !isNaN(obs.relativeHumidity)) {
          if (!current.manualEdits?.rh0830 || duplicatePolicy === 'update_existing') {
            current.rh0830 = obs.relativeHumidity;
          }
        }

        // Morning dry bulb & dew point
        if (obs.dryBulb !== null && obs.dryBulb !== undefined && !isNaN(obs.dryBulb)) {
          if (!current.manualEdits?.dryBulb0830 || duplicatePolicy === 'update_existing') {
            current.dryBulb0830 = obs.dryBulb;
          }
        }
        if (obs.dewPoint !== null && obs.dewPoint !== undefined && !isNaN(obs.dewPoint)) {
          if (!current.manualEdits?.dewPoint0830 || duplicatePolicy === 'update_existing') {
            current.dewPoint0830 = obs.dewPoint;
          }
        }

        // Rainfall (0830 IST)
        if (obs.rainfall !== null && obs.rainfall !== undefined && !isNaN(obs.rainfall)) {
          if (!current.manualEdits?.rainfall0830 || duplicatePolicy === 'update_existing') {
            current.rainfall0830 = obs.rainfall;
          }
          if (!current.has12Z && (!current.manualEdits?.rainfall || duplicatePolicy === 'update_existing')) {
            current.rainfall = obs.rainfall;
          }
        }

        // MSL Pressure & Visibility
        if (obs.mslPressure !== null && obs.mslPressure !== undefined && !isNaN(obs.mslPressure)) {
          if (!current.manualEdits?.mslPressure0830 || duplicatePolicy === 'update_existing') {
            current.mslPressure0830 = obs.mslPressure;
          }
        }
        if (obs.visibilityCode) {
          if (!current.manualEdits?.visibilityCode || duplicatePolicy === 'update_existing') {
            current.visibilityCode = obs.visibilityCode;
          }
        }

        // Raw telegrams
        if (obs.rawSynop) {
          current.rawSynop03Z = obs.rawSynop;
          current.rawSynop = obs.rawSynop;
        }

        rowsToUpsert.push(observationToRow(current));
        updatedStationIds.push(stnId);
      }
    } else {
      // 12Z Bulletin Ingestion
      const parsed12 = parse12UtcBulletin(rawBulletin);
      decodedCount = parsed12.length;
      const nextDate = getNextDayDateString(cleanDate);
      const nextExisting = await this.getObservationsForDate(nextDate).catch(() => []);
      const nextExistingMap = new Map<string, PersistedStationObservation>();
      for (const n of nextExisting) {
        nextExistingMap.set(n.stationId, n);
      }

      for (const obs of parsed12) {
        if (!obs.stationId) continue;
        const stnId = obs.stationId.trim();
        const current = existingMap.get(stnId) ?? {
          stationId: stnId,
          stationName: getStation(stnId)?.name,
          reportingDate: cleanDate,
          tmax: null,
          tmaxDate: null,
          tmaxSlot: null,
          tmin: null,
          tminDate: null,
          tminSlot: null,
          tmaxPreviousDay: null,
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
          has03Z: false,
          has12Z: false,
        };

        if (duplicatePolicy === 'preserve_existing' && current.has12Z) {
          continue;
        }

        current.has12Z = true;
        current.lastUpdatedSlot = '12Z';
        current.lastUpdatedDate = cleanDate;

        // Evening Tmax
        if (obs.tmax !== null && obs.tmax !== undefined && !isNaN(obs.tmax)) {
          if (!current.manualEdits?.tmax || duplicatePolicy === 'update_existing') {
            current.tmax = obs.tmax;
            current.tmaxDate = cleanDate;
            current.tmaxSlot = '12Z';
          }

          // Propagate forward to next day (D1) record in Supabase if exists
          const nextRec = nextExistingMap.get(stnId);
          if (nextRec && !nextRec.manualEdits?.tmax && (nextRec.tmax === null || nextRec.tmaxDate === cleanDate || nextRec.tmaxSlot === '03Z')) {
            nextRec.tmax = obs.tmax;
            nextRec.tmaxDate = cleanDate;
            nextRec.tmaxSlot = '03Z';
            nextRec.tmaxPreviousDay = obs.tmax;
            nextDayRowsToUpsert.push(observationToRow(nextRec));
          }
        }

        // Evening 1730 RH
        if (obs.relativeHumidity !== null && obs.relativeHumidity !== undefined && !isNaN(obs.relativeHumidity)) {
          if (!current.manualEdits?.rh1730 || duplicatePolicy === 'update_existing') {
            current.rh1730 = obs.relativeHumidity;
          }
        }

        // Evening dry bulb & dew point
        if (obs.dryBulb !== null && obs.dryBulb !== undefined && !isNaN(obs.dryBulb)) {
          if (!current.manualEdits?.dryBulb1730 || duplicatePolicy === 'update_existing') {
            current.dryBulb1730 = obs.dryBulb;
          }
        }
        if (obs.dewPoint !== null && obs.dewPoint !== undefined && !isNaN(obs.dewPoint)) {
          if (!current.manualEdits?.dewPoint1730 || duplicatePolicy === 'update_existing') {
            current.dewPoint1730 = obs.dewPoint;
          }
        }

        // Evening 1730 rainfall
        if (obs.rainfall !== null && obs.rainfall !== undefined && !isNaN(obs.rainfall)) {
          if (!current.manualEdits?.rainfall1730 || duplicatePolicy === 'update_existing') {
            current.rainfall1730 = obs.rainfall;
          }
          if (!current.manualEdits?.rainfall || duplicatePolicy === 'update_existing') {
            current.rainfall = obs.rainfall;
          }
        }

        // MSLP & Visibility
        if (obs.mslPressure !== null && obs.mslPressure !== undefined && !isNaN(obs.mslPressure)) {
          if (!current.manualEdits?.mslPressure1730 || duplicatePolicy === 'update_existing') {
            current.mslPressure1730 = obs.mslPressure;
          }
        }
        if (obs.visibilityCode) {
          if (!current.manualEdits?.visibilityCode || duplicatePolicy === 'update_existing') {
            current.visibilityCode = obs.visibilityCode;
          }
        }

        // Raw 12Z
        if (obs.rawSynop) {
          current.rawSynop12Z = obs.rawSynop;
          if (!current.rawSynop) {
            current.rawSynop = obs.rawSynop;
          }
        }

        rowsToUpsert.push(observationToRow(current));
        updatedStationIds.push(stnId);
      }
    }

    if (rowsToUpsert.length > 0) {
      const { error: upsertErr } = await this.client
        .from('station_observations')
        .upsert(rowsToUpsert, { onConflict: 'reporting_date,station_id' });

      if (upsertErr) {
        throw new Error(`Failed to commit observations to PostgreSQL: ${upsertErr.message}`);
      }
    }

    if (priorDayRowsToUpsert.length > 0) {
      const { error: priorErr } = await this.client
        .from('station_observations')
        .upsert(priorDayRowsToUpsert, { onConflict: 'reporting_date,station_id' });

      if (priorErr) {
        console.warn('Prior day Tmax backfill warning:', priorErr.message);
      }
    }

    if (nextDayRowsToUpsert.length > 0) {
      const { error: nextErr } = await this.client
        .from('station_observations')
        .upsert(nextDayRowsToUpsert, { onConflict: 'reporting_date,station_id' });

      if (nextErr) {
        console.warn('Next day Tmax forward propagation warning:', nextErr.message);
      }
    }

    return {
      slot: utcSlot,
      reportingDate: cleanDate,
      decodedCount,
      updatedStationIds,
    };
  }

  /**
   * Updates a single station's observation with manual edits.
   */
  async updateStationObservation(
    date: string,
    stationId: string,
    updates: Partial<PersistedStationObservation>
  ): Promise<PersistedStationObservation> {
    const cleanDate = date.trim();
    const cleanId = stationId.trim();

    // Fetch existing
    const { data: existingRows, error: fetchErr } = await this.client
      .from('station_observations')
      .select('*')
      .eq('reporting_date', cleanDate)
      .eq('station_id', cleanId)
      .limit(1);

    if (fetchErr) {
      throw new Error(`Database error fetching station ${cleanId}: ${fetchErr.message}`);
    }

    const existingRow = existingRows && existingRows.length > 0 ? existingRows[0] : null;
    const current: PersistedStationObservation = existingRow
      ? rowToObservation(existingRow)
      : {
          stationId: cleanId,
          stationName: getStation(cleanId)?.name,
          reportingDate: cleanDate,
          tmax: null,
          tmaxDate: null,
          tmaxSlot: null,
          tmin: null,
          tminDate: null,
          tminSlot: null,
          tmaxPreviousDay: null,
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
          has03Z: false,
          has12Z: false,
        };

    const manualEdits: Record<string, boolean> = {
      ...(current.manualEdits || {}),
      ...(updates.manualEdits || {}),
    };

    const ignoredKeys = new Set(['stationId', 'reportingDate', 'manualEdits']);
    for (const key of Object.keys(updates) as Array<keyof PersistedStationObservation>) {
      if (ignoredKeys.has(key)) continue;
      if (updates[key] !== undefined) {
        (current as any)[key] = updates[key];
        manualEdits[key] = true;
      }
    }
    current.manualEdits = manualEdits;

    const row = observationToRow(current);
    const { error: saveErr } = await this.client
      .from('station_observations')
      .upsert(row, { onConflict: 'reporting_date,station_id' });

    if (saveErr) {
      throw new Error(`Failed to commit manual edit to PostgreSQL: ${saveErr.message}`);
    }

    return current;
  }

  /**
   * Exports full archive matching ObservationArchive schema.
   */
  async exportArchive(): Promise<ObservationArchive> {
    const { data: obsRows, error: obsErr } = await this.client
      .from('station_observations')
      .select('*')
      .order('reporting_date', { ascending: true });

    if (obsErr) {
      throw new Error(`Failed to export observations: ${obsErr.message}`);
    }

    const { data: bRows, error: bErr } = await this.client
      .from('raw_bulletins')
      .select('*');

    if (bErr) {
      throw new Error(`Failed to export raw bulletins: ${bErr.message}`);
    }

    const records: Record<string, Record<string, PersistedStationObservation>> = {};
    const datesSet = new Set<string>();
    const stationsSet = new Set<string>();

    for (const row of obsRows || []) {
      const obs = rowToObservation(row);
      const d = obs.reportingDate;
      if (!records[d]) records[d] = {};
      records[d][obs.stationId] = obs;
      datesSet.add(d);
      stationsSet.add(obs.stationId);
    }

    const rawBulletins: Record<string, Record<UtcSlot, string>> = {};
    for (const b of bRows || []) {
      const d = b.reporting_date;
      if (!rawBulletins[d]) {
        rawBulletins[d] = { '03Z': '', '12Z': '' };
      }
      if (b.utc_slot === '03Z' || b.utc_slot === '12Z') {
        rawBulletins[d][b.utc_slot as UtcSlot] = b.raw_bulletin;
      }
    }

    const dates = Array.from(datesSet).sort();

    return {
      metadata: {
        version: '1.0',
        system: 'WXOps',
        exportedAt: new Date().toISOString(),
        retentionLimit: 15,
        dateCount: dates.length,
        stationCount: stationsSet.size,
        dates,
      },
      records,
      rawBulletins,
    };
  }

  /**
   * Restores/imports archive into PostgreSQL safely.
   */
  async restoreArchive(
    archive: ObservationArchive,
    duplicatePolicy: DuplicateHandlingPolicy = 'merge_fields'
  ): Promise<{
    success: boolean;
    datesRestored: number;
    stationCount: number;
    rejectedCount: number;
    error?: string;
  }> {
    if (!archive || typeof archive !== 'object' || !archive.records) {
      return { success: false, datesRestored: 0, stationCount: 0, rejectedCount: 0, error: 'Invalid archive format' };
    }

    let datesRestored = 0;
    let stationCount = 0;
    let rejectedCount = 0;

    const rowsToUpsert: DbStationObservationRow[] = [];
    const bulletinsToUpsert: DbRawBulletinRow[] = [];

    for (const [dateStr, stnMap] of Object.entries(archive.records)) {
      if (!stnMap || typeof stnMap !== 'object') continue;
      let dateHasValidStations = false;

      for (const [stnId, obs] of Object.entries(stnMap)) {
        if (!obs || typeof obs !== 'object' || !stnId) {
          rejectedCount++;
          continue;
        }

        const validObs: PersistedStationObservation = {
          ...obs,
          stationId: stnId.trim(),
          reportingDate: dateStr.trim(),
        };

        rowsToUpsert.push(observationToRow(validObs));
        stationCount++;
        dateHasValidStations = true;
      }

      if (dateHasValidStations) {
        datesRestored++;
      }
    }

    if (archive.rawBulletins) {
      for (const [d, slots] of Object.entries(archive.rawBulletins)) {
        for (const [slot, raw] of Object.entries(slots)) {
          if ((slot === '03Z' || slot === '12Z') && raw) {
            bulletinsToUpsert.push({
              reporting_date: d,
              utc_slot: slot as '03Z' | '12Z',
              raw_bulletin: raw,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    if (rowsToUpsert.length > 0) {
      const { error: upsertErr } = await this.client
        .from('station_observations')
        .upsert(rowsToUpsert, { onConflict: 'reporting_date,station_id' });

      if (upsertErr) {
        return { success: false, datesRestored: 0, stationCount: 0, rejectedCount, error: upsertErr.message };
      }
    }

    if (bulletinsToUpsert.length > 0) {
      await this.client
        .from('raw_bulletins')
        .upsert(bulletinsToUpsert, { onConflict: 'reporting_date,utc_slot' });
    }

    return {
      success: true,
      datesRestored,
      stationCount,
      rejectedCount,
    };
  }

  /**
   * Purges all observations from PostgreSQL (guarded operation).
   */
  async clearAll(): Promise<void> {
    await this.client.from('station_observations').delete().neq('station_id', '__never__');
    await this.client.from('raw_bulletins').delete().neq('utc_slot', '__never__');
  }
}
