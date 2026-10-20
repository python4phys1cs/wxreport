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
 * Vercel Serverless Function Handler for GET /api/observations/status
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
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

  const configured = isSupabaseConfigured();
  if (!configured) {
    return res.status(200).json({
      configured: false,
      provider: 'local',
      healthy: true,
      datesCount: defaultObservationStore.getArchiveSize(),
      archivedDates: defaultObservationStore.getArchivedDates(),
      message: 'Supabase PostgreSQL is not configured. Running on local/in-memory storage buffer.',
    });
  }

  try {
    const client = getSupabaseClient();
    if (!client) {
      return res.status(200).json({
        configured: false,
        provider: 'local',
        healthy: false,
        datesCount: defaultObservationStore.getArchiveSize(),
        error: 'Failed to initialize Supabase client with provided credentials.',
      });
    }

    const service = new SupabaseObservationStoreService(client);
    const health = await service.checkConnection();
    const dates = health.ok ? await service.getArchivedDates() : [];

    return res.status(200).json({
      configured: true,
      provider: 'supabase',
      healthy: health.ok,
      error: health.error,
      datesCount: dates.length,
      archivedDates: dates,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      configured: true,
      provider: 'supabase',
      healthy: false,
      error: msg,
      datesCount: 0,
      archivedDates: [],
    });
  }
}
