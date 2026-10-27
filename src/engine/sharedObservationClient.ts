/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { authClient } from '../auth/authClient.ts';
import {
  defaultObservationStore,
  type PersistedStationObservation,
  type ObservationArchive,
  type UtcSlot,
  type DuplicateHandlingPolicy,
} from './observationStore.ts';

export interface StorageStatus {
  configured: boolean;
  provider: 'supabase' | 'local';
  healthy: boolean;
  error?: string;
  datesCount: number;
  archivedDates: string[];
  message?: string;
}

export interface IngestionResponse {
  success: boolean;
  provider: 'supabase' | 'local';
  slot: UtcSlot;
  reportingDate: string;
  decodedCount: number;
  updatedStationIds: string[];
}

export interface SyncResponse {
  success: boolean;
  provider: 'supabase' | 'local';
  datesRestored: number;
  stationCount: number;
  rejectedCount: number;
  preMigrationBackupAvailable: boolean;
}

/**
 * Client service to communicate with authoritative PostgreSQL backend on Vercel.
 */
export class SharedObservationClient {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = authClient.getSessionToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Checks database connectivity and configuration status.
   */
  async getStatus(): Promise<StorageStatus> {
    try {
      const res = await fetch('/api/observations/status', {
        headers: this.getHeaders(),
        credentials: 'same-origin',
      });

      if (!res.ok) {
        return {
          configured: false,
          provider: 'local',
          healthy: false,
          error: `HTTP ${res.status} (${res.statusText})`,
          datesCount: defaultObservationStore.getArchiveSize(),
          archivedDates: defaultObservationStore.getArchivedDates(),
        };
      }

      return await res.json();
    } catch (err: unknown) {
      return {
        configured: false,
        provider: 'local',
        healthy: false,
        error: err instanceof Error ? err.message : 'Network error connecting to server.',
        datesCount: defaultObservationStore.getArchiveSize(),
        archivedDates: defaultObservationStore.getArchivedDates(),
      };
    }
  }

  /**
   * Loads authoritative observations for a specific reporting date from PostgreSQL
   * and synchronizes into local client store.
   */
  async loadDateObservations(date: string): Promise<{
    provider: 'supabase' | 'local';
    observations: PersistedStationObservation[];
    rawBulletins: Record<string, string>;
    archivedDates: string[];
  }> {
    const cleanDate = date.trim();
    const res = await fetch(`/api/observations?date=${encodeURIComponent(cleanDate)}`, {
      headers: this.getHeaders(),
      credentials: 'same-origin',
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to fetch observations (HTTP ${res.status})`);
    }

    const data = await res.json();
    const obsList: PersistedStationObservation[] = data.observations || [];

    // Sync into in-memory store cleanly without turning all server fields into artificial manual edits
    for (const obs of obsList) {
      defaultObservationStore.setStationObservationFromServer(cleanDate, obs.stationId, obs);
    }

    if (data.rawBulletins) {
      if (data.rawBulletins['03Z']) {
        defaultObservationStore.saveRawBulletin(cleanDate, '03Z', data.rawBulletins['03Z']);
      }
      if (data.rawBulletins['12Z']) {
        defaultObservationStore.saveRawBulletin(cleanDate, '12Z', data.rawBulletins['12Z']);
      }
    }

    return {
      provider: data.provider || 'local',
      observations: obsList,
      rawBulletins: data.rawBulletins || {},
      archivedDates: data.archivedDates || [],
    };
  }

  /**
   * Submits a SYNOP bulletin to be saved in PostgreSQL and merged into client store.
   */
  async ingestBulletin(
    utcSlot: UtcSlot,
    rawBulletin: string,
    reportingDate: string,
    duplicatePolicy: DuplicateHandlingPolicy = 'merge_fields'
  ): Promise<IngestionResponse> {
    const res = await fetch('/api/observations/ingest', {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({
        utcSlot,
        rawBulletin,
        reportingDate,
        duplicatePolicy,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Database save failed (HTTP ${res.status})`);
    }

    const result: IngestionResponse = await res.json();

    // Mirror to client-side store
    defaultObservationStore.ingestBulletin(utcSlot, rawBulletin, reportingDate);

    return result;
  }

  /**
   * Submits a manual table edit to be persisted in PostgreSQL.
   */
  async updateStationObservation(
    reportingDate: string,
    stationId: string,
    updates: Partial<PersistedStationObservation>
  ): Promise<PersistedStationObservation> {
    const res = await fetch('/api/observations/update', {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({
        reportingDate,
        stationId,
        updates,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to persist edit to PostgreSQL (HTTP ${res.status})`);
    }

    const data = await res.json();
    // Mirror to client-side store
    defaultObservationStore.updateStationObservation(reportingDate, stationId, updates);
    return data.observation;
  }

  /**
   * Synchronizes browser-stored observations or backup file into PostgreSQL.
   */
  async syncToDatabase(payload: {
    archive?: ObservationArchive;
    rawCsv?: string;
    duplicatePolicy?: DuplicateHandlingPolicy;
  }): Promise<SyncResponse> {
    const res = await fetch('/api/observations/sync', {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Migration failed (HTTP ${res.status})`);
    }

    return await res.json();
  }

  /**
   * Exports authoritative archive from PostgreSQL.
   */
  async exportArchive(): Promise<ObservationArchive> {
    const res = await fetch('/api/observations/archive', {
      headers: this.getHeaders(),
      credentials: 'same-origin',
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to export archive (HTTP ${res.status})`);
    }

    return await res.json();
  }

  /**
   * Clears database and local store after user confirmation.
   */
  async clearAll(confirmation: string = 'DELETE'): Promise<void> {
    const res = await fetch('/api/observations', {
      method: 'DELETE',
      headers: this.getHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ confirmation }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to clear observations (HTTP ${res.status})`);
    }

    defaultObservationStore.clear();
  }
}

export const sharedObservationClient = new SharedObservationClient();
