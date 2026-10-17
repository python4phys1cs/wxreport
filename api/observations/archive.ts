/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defaultObservationStore } from '../../src/engine/observationStore.ts';

/**
 * Vercel Serverless Function Handler for /api/observations/archive
 */
export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const archive = defaultObservationStore.exportArchive();
    const latestDate =
      archive.metadata.dates.length > 0
        ? archive.metadata.dates[archive.metadata.dates.length - 1]
        : 'empty';

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wxops_archive_${latestDate}.json"`);
    return res.status(200).send(JSON.stringify(archive, null, 2));
  }

  if (req.method === 'POST') {
    try {
      const result = defaultObservationStore.restoreArchive(req.body);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.status(200).json({
        success: true,
        datesRestored: result.datesRestored,
        stationCount: result.stationCount,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid archive';
      return res.status(400).json({ success: false, error: msg });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
