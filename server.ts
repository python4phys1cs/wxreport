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

/**
 * GET /api/observations/archive
 * Downloads the current 15-day observation archive as a JSON file attachment.
 */
app.get('/api/observations/archive', (req, res) => {
  const archive = defaultObservationStore.exportArchive();
  const latestDate =
    archive.metadata.dates.length > 0
      ? archive.metadata.dates[archive.metadata.dates.length - 1]
      : 'empty';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="wxops_archive_${latestDate}.json"`);
  res.status(200).send(JSON.stringify(archive, null, 2));
});

/**
 * POST /api/observations/archive
 * Restores/imports or synchronizes the 15-day observation archive.
 */
app.post('/api/observations/archive', (req, res) => {
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
});

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
