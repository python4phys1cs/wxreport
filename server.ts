/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { defaultObservationStore } from './src/engine/observationStore.ts';
import {
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
  extractSessionToken,
} from './src/server/authService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(express.json({ limit: '10mb' }));

/**
 * Authentication Endpoints
 */
app.post('/api/auth/login', (req, res) => {
  const { identity, password } = req.body || {};
  const check = verifyCredentials(identity, password);

  if (!check.valid || !check.identity) {
    return res.status(401).json({
      success: false,
      error: check.error || 'Invalid meteorological workstation credentials.',
    });
  }

  const token = createSessionToken(check.identity);
  res.setHeader(
    'Set-Cookie',
    `wxops_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
  );

  return res.status(200).json({
    success: true,
    identity: check.identity,
    token,
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    'wxops_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/session', (req, res) => {
  const token = extractSessionToken(req.headers);
  if (!token) {
    return res.status(401).json({ authenticated: false, error: 'No session token provided.' });
  }

  const check = verifySessionToken(token);
  if (!check.valid || !check.identity) {
    return res.status(401).json({ authenticated: false, error: check.error || 'Invalid session.' });
  }

  return res.status(200).json({ authenticated: true, identity: check.identity });
});

import statusHandler from './api/observations/status.ts';
import observationsHandler from './api/observations/index.ts';
import ingestHandler from './api/observations/ingest.ts';
import updateHandler from './api/observations/update.ts';
import syncHandler from './api/observations/sync.ts';
import archiveHandler from './api/observations/archive.ts';

/**
 * Shared PostgreSQL & In-Memory Observation Endpoints
 */
app.get('/api/observations/status', (req, res) => statusHandler(req, res));
app.get('/api/observations', (req, res) => observationsHandler(req, res));
app.delete('/api/observations', (req, res) => observationsHandler(req, res));
app.post('/api/observations/ingest', (req, res) => ingestHandler(req, res));
app.post('/api/observations/update', (req, res) => updateHandler(req, res));
app.post('/api/observations/sync', (req, res) => syncHandler(req, res));
app.get('/api/observations/archive', (req, res) => archiveHandler(req, res));
app.post('/api/observations/archive', (req, res) => archiveHandler(req, res));

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WXOps operational server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

// Only launch when run as main entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error('Failed to start WXOps server:', err);
    process.exit(1);
  });
}
