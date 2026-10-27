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
import { defaultObservationStore } from '../../src/engine/observationStore.ts';

/**
 * Vercel Serverless Function Handler for /api/observations
 * GET: Retrieves observations, bulletins, and archived dates.
 * DELETE: Purges stored observations when authorized and confirmed.
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
    const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
    const dateParam = url.searchParams.get('date') || req.query?.date;
    const fullArchiveParam = url.searchParams.get('fullArchive') === 'true' || req.query?.fullArchive === 'true';

    try {
      if (dbService) {
        if (fullArchiveParam) {
          const archive = await dbService.exportArchive();
          return res.status(200).json({
            provider: 'supabase',
            archive,
          });
        }

        const archivedDates = await dbService.getArchivedDates();
        const targetDate = dateParam ? String(dateParam).trim() : (archivedDates[archivedDates.length - 1] ?? null);

        let observations: any[] = [];
        let rawBulletins: Record<string, string> = { '03Z': '', '12Z': '' };

        if (targetDate) {
          observations = await dbService.getObservationsForDate(targetDate);
          rawBulletins = await dbService.getRawBulletinsForDate(targetDate);
        }

        return res.status(200).json({
          provider: 'supabase',
          targetDate,
          archivedDates,
          observations,
          rawBulletins,
        });
      } else {
        // Fallback to in-memory store
        if (fullArchiveParam) {
          return res.status(200).json({
            provider: 'local',
            archive: defaultObservationStore.exportArchive(),
          });
        }

        const archivedDates = defaultObservationStore.getArchivedDates();
        const targetDate = dateParam ? String(dateParam).trim() : (archivedDates[archivedDates.length - 1] ?? null);
        const obsMap = targetDate ? defaultObservationStore.getAllObservations(targetDate) : new Map();
        const observations = Array.from(obsMap.values());
        const rawBulletins = targetDate
          ? {
              '03Z': defaultObservationStore.getRawBulletin(targetDate, '03Z') ?? '',
              '12Z': defaultObservationStore.getRawBulletin(targetDate, '12Z') ?? '',
            }
          : { '03Z': '', '12Z': '' };

        return res.status(200).json({
          provider: 'local',
          targetDate,
          archivedDates,
          observations,
          rawBulletins,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: `Database error: ${msg}` });
    }
  }

  if (req.method === 'DELETE') {
    const confirmation = req.body?.confirmation || req.query?.confirmation;
    if (confirmation !== 'DELETE' && confirmation !== 'CONFIRM_DELETE_ALL') {
      return res.status(400).json({
        error: 'Destructive action safeguard: explicit confirmation "DELETE" is required.',
      });
    }

    try {
      if (dbService) {
        await dbService.clearAll();
      }
      defaultObservationStore.clear();

      return res.status(200).json({
        success: true,
        message: 'All stored observations and bulletins purged successfully.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: `Database clear error: ${msg}` });
    }
  }

  res.setHeader('Allow', ['GET', 'DELETE']);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
