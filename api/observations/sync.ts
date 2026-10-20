/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { extractSessionToken, verifySessionToken } from '../../src/server/authService.ts';
import {
  isSupabaseConfigured,
  getSupabaseClient,
  SupabaseObservationStoreService,
} from '../../src/server/db/supabaseClient.ts';
import {
  defaultObservationStore,
  validateArchiveData,
  parseCsvToArchive,
  type ObservationArchive,
  type DuplicateHandlingPolicy,
} from '../../src/engine/observationStore.ts';

/**
 * Vercel Serverless Function Handler for POST /api/observations/sync
 * Safely migrates browser-stored observations or JSON/CSV backups into PostgreSQL.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const token = extractSessionToken(req.headers || {});
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No session token provided.' });
  }

  const check = verifySessionToken(token);
  if (!check.valid || !check.identity) {
    return res.status(401).json({ error: check.error || 'Invalid meteorological session.' });
  }

  const {
    archive,
    rawCsv,
    duplicatePolicy = 'merge_fields',
  } = req.body || {};

  let targetArchive: ObservationArchive | null = null;

  if (rawCsv && typeof rawCsv === 'string') {
    const csvResult = parseCsvToArchive(rawCsv);
    if (!csvResult.valid || !csvResult.archive) {
      return res.status(400).json({ success: false, error: csvResult.error || 'Invalid CSV format.' });
    }
    targetArchive = csvResult.archive;
  } else if (archive && typeof archive === 'object') {
    const validResult = validateArchiveData(archive);
    if (!validResult.valid || !validResult.archive) {
      return res.status(400).json({ success: false, error: validResult.error || 'Invalid JSON archive format.' });
    }
    targetArchive = validResult.archive;
  } else {
    return res.status(400).json({
      success: false,
      error: 'Either "archive" (JSON object) or "rawCsv" (string) must be provided for migration.',
    });
  }

  try {
    const client = isSupabaseConfigured() ? getSupabaseClient() : null;
    let preMigrationBackup: ObservationArchive | null = null;
    let restoreResult: any = null;

    if (client) {
      const dbService = new SupabaseObservationStoreService(client);
      // Pre-migration snapshot for safety
      try {
        preMigrationBackup = await dbService.exportArchive();
      } catch {
        preMigrationBackup = null;
      }

      restoreResult = await dbService.restoreArchive(
        targetArchive,
        duplicatePolicy as DuplicateHandlingPolicy
      );

      if (!restoreResult.success) {
        return res.status(500).json({
          success: false,
          error: restoreResult.error || 'Failed to migrate records into PostgreSQL.',
        });
      }
    }

    // Mirror to local store
    defaultObservationStore.restoreArchive(targetArchive);

    return res.status(200).json({
      success: true,
      provider: client ? 'supabase' : 'local',
      datesRestored: restoreResult ? restoreResult.datesRestored : targetArchive.metadata.dateCount,
      stationCount: restoreResult ? restoreResult.stationCount : targetArchive.metadata.stationCount,
      rejectedCount: restoreResult ? restoreResult.rejectedCount : 0,
      preMigrationBackupAvailable: Boolean(preMigrationBackup && preMigrationBackup.metadata.dateCount > 0),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      error: `Migration error: ${msg}`,
    });
  }
}
