/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WorkstationIdentity } from '../server/authService.ts';

const TOKEN_KEY = 'wxops_workstation_token';
const IDENTITY_KEY = 'wxops_workstation_identity';

export interface LoginResult {
  success: boolean;
  identity?: WorkstationIdentity;
  error?: string;
}

export interface SessionResult {
  authenticated: boolean;
  identity?: WorkstationIdentity;
  error?: string;
}

/**
 * Client-side authentication service interacting with server-side auth endpoints.
 */
export const authClient = {
  getStoredToken(): string | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      return window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  getSessionToken(): string | null {
    return this.getStoredToken();
  },

  getStoredIdentity(): WorkstationIdentity | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      const val = window.sessionStorage.getItem(IDENTITY_KEY);
      if (val === 'AMSS Nagpur' || val === 'RWFC Nagpur') {
        return val;
      }
      return null;
    } catch {
      return null;
    }
  },

  setStoredSession(token: string, identity: WorkstationIdentity): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token);
      window.sessionStorage.setItem(IDENTITY_KEY, identity);
    } catch {}
  },

  clearStoredSession(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(IDENTITY_KEY);
    } catch {}
  },

  async login(identity: string, password: string): Promise<LoginResult> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identity, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Invalid meteorological workstation credentials.',
        };
      }

      if (data.token && data.identity) {
        this.setStoredSession(data.token, data.identity);
      }

      return {
        success: true,
        identity: data.identity,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      return {
        success: false,
        error: `Authentication failed: ${msg}. Please verify connection to workstation server.`,
      };
    }
  },

  async logout(): Promise<void> {
    try {
      const token = this.getStoredToken();
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      this.clearStoredSession();
    }
  },

  async checkSession(): Promise<SessionResult> {
    const token = this.getStoredToken();
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        this.clearStoredSession();
        return { authenticated: false };
      }

      const data = await res.json().catch(() => ({}));
      if (data.authenticated && data.identity) {
        return { authenticated: true, identity: data.identity };
      }

      this.clearStoredSession();
      return { authenticated: false };
    } catch {
      // If server check fails, fall back to checking if we have a locally stored session
      // (in case running without full network in offline test)
      const cached = this.getStoredIdentity();
      if (cached && token) {
        return { authenticated: true, identity: cached };
      }
      return { authenticated: false };
    }
  },
};
