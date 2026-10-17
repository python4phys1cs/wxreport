/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSTATION_IDENTITIES,
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
  extractSessionToken,
  getAuthConfig,
} from './authService.ts';

describe('Meteorological Workstation Server-Side Authentication Suite', () => {
  it('1. provides exactly two authorized identities: AMSS Nagpur and RWFC Nagpur', () => {
    assert.equal(WORKSTATION_IDENTITIES.length, 2);
    assert.ok(WORKSTATION_IDENTITIES.includes('AMSS Nagpur'));
    assert.ok(WORKSTATION_IDENTITIES.includes('RWFC Nagpur'));
  });

  it('2. successfully verifies credentials for AMSS Nagpur with default password imd123', () => {
    const result = verifyCredentials('AMSS Nagpur', 'imd123');
    assert.equal(result.valid, true);
    assert.equal(result.identity, 'AMSS Nagpur');
    assert.equal(result.error, undefined);
  });

  it('3. successfully verifies credentials for RWFC Nagpur with default password imd123', () => {
    const result = verifyCredentials('RWFC Nagpur', 'imd123');
    assert.equal(result.valid, true);
    assert.equal(result.identity, 'RWFC Nagpur');
    assert.equal(result.error, undefined);
  });

  it('4. rejects invalid password for AMSS Nagpur', () => {
    const result = verifyCredentials('AMSS Nagpur', 'wrongpassword');
    assert.equal(result.valid, false);
    assert.equal(result.identity, undefined);
    assert.ok(result.error?.includes('Invalid'));
  });

  it('5. rejects invalid password for RWFC Nagpur', () => {
    const result = verifyCredentials('RWFC Nagpur', 'badpassword');
    assert.equal(result.valid, false);
    assert.equal(result.identity, undefined);
    assert.ok(result.error?.includes('Invalid'));
  });

  it('6. rejects unauthorized or arbitrary identity', () => {
    const result = verifyCredentials('Admin', 'imd123');
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('Invalid meteorological workstation identity'));
  });

  it('7. respects custom password configured via environment or override', () => {
    const customConfig = {
      amssPassword: 'secure-amss-pwd-99',
      rwfcPassword: 'secure-rwfc-pwd-88',
      sessionSecret: 'test-secret',
    };

    // Old password fails
    assert.equal(verifyCredentials('AMSS Nagpur', 'imd123', customConfig).valid, false);
    // Custom password succeeds
    assert.equal(verifyCredentials('AMSS Nagpur', 'secure-amss-pwd-99', customConfig).valid, true);
    assert.equal(verifyCredentials('RWFC Nagpur', 'secure-rwfc-pwd-88', customConfig).valid, true);
  });

  it('8. creates and verifies HMAC-SHA256 session token', () => {
    const token = createSessionToken('AMSS Nagpur');
    assert.ok(typeof token === 'string');
    assert.ok(token.includes('.'));

    const check = verifySessionToken(token);
    assert.equal(check.valid, true);
    assert.equal(check.identity, 'AMSS Nagpur');
    assert.ok(check.payload);
    assert.equal(check.payload?.sub, 'AMSS Nagpur');
  });

  it('9. rejects tampered session token signature', () => {
    const token = createSessionToken('AMSS Nagpur');
    const [payload, signature] = token.split('.');
    const tamperedToken = `${payload}.${signature}tampered`;

    const check = verifySessionToken(tamperedToken);
    assert.equal(check.valid, false);
    assert.ok(check.error?.includes('Invalid token signature'));
  });

  it('10. rejects expired session token', () => {
    // Token with -10 second lifetime (already expired)
    const token = createSessionToken('RWFC Nagpur', undefined, -10);
    const check = verifySessionToken(token);
    assert.equal(check.valid, false);
    assert.ok(check.error?.includes('expired'));
  });

  it('11. extracts session token from Authorization Bearer header or Cookie', () => {
    const token = createSessionToken('RWFC Nagpur');

    // From Bearer header
    const tokenFromBearer = extractSessionToken({
      authorization: `Bearer ${token}`,
    });
    assert.equal(tokenFromBearer, token);

    // From Cookie header
    const tokenFromCookie = extractSessionToken({
      cookie: `theme=blue; wxops_session=${token}; slot=03z`,
    });
    assert.equal(tokenFromCookie, token);

    // Missing header
    assert.equal(extractSessionToken({}), null);
  });
});
