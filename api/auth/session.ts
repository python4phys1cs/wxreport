/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { extractSessionToken, verifySessionToken } from '../../src/server/authService.ts';

/**
 * Vercel Serverless Function Handler for GET /api/auth/session
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ authenticated: false, error: `Method ${req.method} Not Allowed` });
  }

  const token = extractSessionToken(req.headers || {});
  if (!token) {
    return res.status(401).json({ authenticated: false, error: 'No session token provided.' });
  }

  const check = verifySessionToken(token);
  if (!check.valid || !check.identity) {
    return res.status(401).json({ authenticated: false, error: check.error || 'Invalid session.' });
  }

  return res.status(200).json({
    authenticated: true,
    identity: check.identity,
  });
}
