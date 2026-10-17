/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vercel Serverless Function Handler for POST /api/auth/logout
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // Clear session cookie
  res.setHeader(
    'Set-Cookie',
    'wxops_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );

  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
}
