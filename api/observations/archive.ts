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
import { defaultObservationStore, validateArchiveData } from '../../src/engine/observationStore.ts';

/**
 * Vercel Serverless Function Handler for /api/observations/archive
 * Protected endpoint: validates meteorological session token before export or restore.
 */
export default async function handler(req: any, res: any) {
  const token = extractSessionToken(req.headers || {});
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No session token provided.' });
  }

  const check = verifySessionToken(token);
  if (!check.valid || !check.identity) {
    return res.status(401).json({ error: check.error || 'Invalid meteorological session.' });
  }

  const client = isSupabaseConfigured() ? getSupabaseClient() : null;
  const dbService = client ? new SupabaseObservationStoreService(client) : null;

  if (req.method === 'GET') {
    try {
      const archive = dbService
        ? await dbService.exportArchive()
        : defaultObservationStore.exportArchive();

      const latestDate =
        archive.metadata.dates.length > 0
          ? archive.metadata.dates[archive.metadata.dates.length - 1]
          : 'empty';

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="wxops_archive_${latestDate}.json"`);
      return res.status(200).send(JSON.stringify(archive, null, 2));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: `Export error: ${msg}` });
    }
  }

  if (req.method === 'POST') {
    try {
      const payload = req.body;
      const valid = validateArchiveData(payload);
      if (!valid.valid || !valid.archive) {
        return res.status(400).json({ success: false, error: valid.error || 'Invalid archive format' });
      }

      if (dbService) {
        const restoreResult = await dbService.restoreArchive(valid.archive, 'merge_fields');
        if (!restoreResult.success) {
          return res.status(500).json({ success: false, error: restoreResult.error });
        }
      }

      const memResult = defaultObservationStore.restoreArchive(valid.archive);
      return res.status(200).json({
        success: true,
        provider: dbService ? 'supabase' : 'local',
        datesRestored: memResult.datesRestored,
        stationCount: memResult.stationCount,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid archive';
      return res.status(400).json({ success: false, error: msg });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
