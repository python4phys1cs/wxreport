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
import { defaultObservationStore, type UtcSlot, type DuplicateHandlingPolicy } from '../../src/engine/observationStore.ts';

/**
 * Vercel Serverless Function Handler for POST /api/observations/ingest
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
    utcSlot,
    rawBulletin,
    reportingDate,
    duplicatePolicy = 'merge_fields',
  } = req.body || {};

  if (!utcSlot || (utcSlot !== '03Z' && utcSlot !== '12Z')) {
    return res.status(400).json({ error: 'Valid utcSlot ("03Z" or "12Z") is required.' });
  }

  if (!rawBulletin || typeof rawBulletin !== 'string' || !rawBulletin.trim()) {
    return res.status(400).json({ error: 'Raw SYNOP bulletin text is required.' });
  }

  if (!reportingDate || typeof reportingDate !== 'string' || !reportingDate.trim()) {
    return res.status(400).json({ error: 'Reporting date (YYYY-MM-DD) is required.' });
  }

  const cleanDate = reportingDate.trim();
  const slot = utcSlot as UtcSlot;
  const policy = duplicatePolicy as DuplicateHandlingPolicy;

  try {
    const client = isSupabaseConfigured() ? getSupabaseClient() : null;
    let dbResult: any = null;

    if (client) {
      const dbService = new SupabaseObservationStoreService(client);
      dbResult = await dbService.ingestBulletin(slot, rawBulletin, cleanDate, policy);
    }

    // Always mirror to in-memory store so cached operations stay in sync
    const memResult = defaultObservationStore.ingestBulletin(slot, rawBulletin, cleanDate);

    return res.status(200).json({
      success: true,
      provider: client ? 'supabase' : 'local',
      slot,
      reportingDate: cleanDate,
      decodedCount: dbResult ? dbResult.decodedCount : memResult.decodedCount,
      updatedStationIds: dbResult ? dbResult.updatedStationIds : memResult.updatedStationIds,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      error: `PostgreSQL ingestion failure: ${msg}`,
    });
  }
}
