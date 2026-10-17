/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

/**
 * The two authorized meteorological operational identities.
 */
export const WORKSTATION_IDENTITIES = ['AMSS Nagpur', 'RWFC Nagpur'] as const;
export type WorkstationIdentity = typeof WORKSTATION_IDENTITIES[number];

/**
 * Configuration options for workstation authentication.
 */
export interface AuthConfig {
  amssPassword?: string;
  rwfcPassword?: string;
  sessionSecret?: string;
}

/**
 * Resolved passwords and secret, with priority given to server-side environment variables.
 * Default passwords default to 'imd123' as per operational specification.
 */
export function getAuthConfig(override?: AuthConfig): {
  amssPassword: string;
  rwfcPassword: string;
  sessionSecret: string;
} {
  const amssPassword =
    override?.amssPassword ||
    process.env.WXOPS_AMSS_PASSWORD ||
    process.env.AMSS_NAGPUR_PASSWORD ||
    'imd123';

  const rwfcPassword =
    override?.rwfcPassword ||
    process.env.WXOPS_RWFC_PASSWORD ||
    process.env.RWFC_NAGPUR_PASSWORD ||
    'imd123';

  const sessionSecret =
    override?.sessionSecret ||
    process.env.SESSION_SECRET ||
    process.env.WXOPS_SESSION_SECRET ||
    'wxops-operational-workstation-session-secret-2026';

  return { amssPassword, rwfcPassword, sessionSecret };
}

/**
 * Constant-time string equality check to prevent timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to keep constant time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates workstation identity and credentials server-side.
 * Returns valid status and matched identity. Never exposes or logs passwords.
 */
export function verifyCredentials(
  identity: unknown,
  password: unknown,
  config?: AuthConfig
): { valid: boolean; identity?: WorkstationIdentity; error?: string } {
  if (typeof identity !== 'string' || typeof password !== 'string') {
    return { valid: false, error: 'Identity and password are required.' };
  }

  const cleanIdentity = identity.trim();
  if (cleanIdentity !== 'AMSS Nagpur' && cleanIdentity !== 'RWFC Nagpur') {
    return { valid: false, error: 'Invalid meteorological workstation identity.' };
  }

  const { amssPassword, rwfcPassword } = getAuthConfig(config);
  const expectedPassword = cleanIdentity === 'AMSS Nagpur' ? amssPassword : rwfcPassword;

  const matches = timingSafeCompare(password, expectedPassword);
  if (!matches) {
    return { valid: false, error: 'Invalid workstation credentials.' };
  }

  return { valid: true, identity: cleanIdentity };
}

/**
 * Session payload structure for signed tokens.
 */
export interface SessionPayload {
  sub: WorkstationIdentity;
  iat: number;
  exp: number;
}

/**
 * Generates an HMAC-SHA256 authenticated session token (valid for 24 hours).
 */
export function createSessionToken(
  identity: WorkstationIdentity,
  config?: AuthConfig,
  expiresInSeconds = 24 * 3600
): string {
  const { sessionSecret } = getAuthConfig(config);
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: identity,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', sessionSecret);
  hmac.update(payloadB64);
  const signatureB64 = hmac.digest('base64url');

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 session token.
 */
export function verifySessionToken(
  token: unknown,
  config?: AuthConfig
): { valid: boolean; identity?: WorkstationIdentity; payload?: SessionPayload; error?: string } {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, error: 'Malformed or missing session token.' };
  }

  const [payloadB64, signatureB64] = token.split('.');
  if (!payloadB64 || !signatureB64) {
    return { valid: false, error: 'Invalid token structure.' };
  }

  const { sessionSecret } = getAuthConfig(config);
  const hmac = crypto.createHmac('sha256', sessionSecret);
  hmac.update(payloadB64);
  const expectedSignatureB64 = hmac.digest('base64url');

  if (!timingSafeCompare(signatureB64, expectedSignatureB64)) {
    return { valid: false, error: 'Invalid token signature.' };
  }

  try {
    const rawJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(rawJson) as SessionPayload;

    if (!payload.sub || (payload.sub !== 'AMSS Nagpur' && payload.sub !== 'RWFC Nagpur')) {
      return { valid: false, error: 'Invalid token subject identity.' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Session has expired.' };
    }

    return { valid: true, identity: payload.sub, payload };
  } catch {
    return { valid: false, error: 'Failed to decode session payload.' };
  }
}

/**
 * Extracts session token from HTTP request headers (Authorization Bearer or Cookie).
 */
export function extractSessionToken(headers: Record<string, string | string[] | undefined>): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    if (match) return match[1];
  }

  // 2. Cookie: wxops_session=<token>
  const cookieHeader = headers['cookie'] || headers['Cookie'];
  if (typeof cookieHeader === 'string') {
    const match = cookieHeader.match(/(?:^|;\s*)wxops_session=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
    if (match) return match[1];
  }

  return null;
}
