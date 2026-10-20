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
 * Vercel Serverless Function Handler for POST /api/observations/update
 * Handles cell-level manual edits in real time.
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

  const { reportingDate, stationId, updates } = req.body || {};

  if (!reportingDate || typeof reportingDate !== 'string') {
    return res.status(400).json({ error: 'Reporting date is required.' });
  }
  if (!stationId || typeof stationId !== 'string') {
    return res.status(400).json({ error: 'Station ID is required.' });
  }
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Updates payload is required.' });
  }

  const cleanDate = reportingDate.trim();
  const cleanId = stationId.trim();

  try {
    const client = isSupabaseConfigured() ? getSupabaseClient() : null;
    let savedObservation: any = null;

    if (client) {
      const dbService = new SupabaseObservationStoreService(client);
      savedObservation = await dbService.updateStationObservation(cleanDate, cleanId, updates);
    }

    // Mirror to in-memory store
    const memObservation = defaultObservationStore.updateStationObservation(cleanDate, cleanId, updates);

    return res.status(200).json({
      success: true,
      provider: client ? 'supabase' : 'local',
      observation: savedObservation ?? memObservation,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      error: `PostgreSQL update error: ${msg}`,
    });
  }
}
