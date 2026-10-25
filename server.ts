/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import loginHandler from './api/auth/login.ts';
import logoutHandler from './api/auth/logout.ts';
import sessionHandler from './api/auth/session.ts';

import statusHandler from './api/observations/status.ts';
import observationsHandler from './api/observations/index.ts';
import ingestHandler from './api/observations/ingest.ts';
import updateHandler from './api/observations/update.ts';
import syncHandler from './api/observations/sync.ts';
import archiveHandler from './api/observations/archive.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(express.json({ limit: '10mb' }));

/**
 * Route handler wrapper for async execution and standard error propagation
 */
function route(handler: (req: any, res: any) => Promise<any> | any) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/**
 * Workstation Authentication Endpoints
 */
app.post('/api/auth/login', route(loginHandler));
app.post('/api/auth/logout', route(logoutHandler));
app.get('/api/auth/session', route(sessionHandler));

/**
 * Shared PostgreSQL & In-Memory Observation Endpoints
 */
app.get('/api/observations/status', route(statusHandler));
app.get('/api/observations', route(observationsHandler));
app.delete('/api/observations', route(observationsHandler));
app.post('/api/observations/ingest', route(ingestHandler));
app.post('/api/observations/update', route(updateHandler));
app.post('/api/observations/sync', route(syncHandler));
app.get('/api/observations/archive', route(archiveHandler));
app.post('/api/observations/archive', route(archiveHandler));

export async function startServer() {
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
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  return new Promise((resolve) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`WXOps operational server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
      resolve(server);
    });
  });
}

// Start when executed as primary entry point
const isDirectRun =
  Boolean(process.argv[1]) &&
  (process.argv[1] === __filename ||
    path.resolve(process.argv[1]) === __filename ||
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start WXOps server:', err);
    process.exit(1);
  });
}
