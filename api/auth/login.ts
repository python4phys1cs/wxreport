/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { verifyCredentials, createSessionToken } from '../../src/server/authService.ts';

/**
 * Vercel Serverless Function Handler for POST /api/auth/login
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { identity, password } = req.body || {};
    const check = verifyCredentials(identity, password);

    if (!check.valid || !check.identity) {
      return res.status(401).json({
        success: false,
        error: check.error || 'Invalid meteorological workstation credentials.',
      });
    }

    const token = createSessionToken(check.identity);

    // Set secure HttpOnly cookie (24 hour lifetime)
    res.setHeader(
      'Set-Cookie',
      `wxops_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
    );

    return res.status(200).json({
      success: true,
      identity: check.identity,
      token,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Authentication failure';
    return res.status(500).json({ success: false, error: msg });
  }
}
