import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { defaultObservationStore } from './src/engine/observationStore.ts';
import {
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
  extractSessionToken,
} from './src/server/authService.ts';

import statusHandler from './api/observations/status.ts';
import ingestHandler from './api/observations/ingest.ts';
import syncHandler from './api/observations/sync.ts';
import updateHandler from './api/observations/update.ts';
import archiveHandler from './api/observations/archive.ts';
import indexHandler from './api/observations/index.ts';

function adaptHandler(handler: (req: any, res: any) => Promise<any> | any) {
  return (req: any, res: any) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch {
          req.body = body;
        }
      } else {
        req.body = {};
      }

      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data: any) => {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
        }
        return res;
      };
      res.send = (data: any) => {
        if (!res.headersSent) {
          res.end(data);
        }
        return res;
      };

      Promise.resolve(handler(req, res)).catch((err: unknown) => {
        if (!res.headersSent) {
          const msg = err instanceof Error ? err.message : String(err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: msg }));
        }
      });
    });
  };
}

function wxopsApiPlugin(): Plugin {
  return {
    name: 'wxops-api-plugin',
    configureServer(server) {
      // POST /api/auth/login
      server.middlewares.use('/api/auth/login', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Allow', 'POST');
          res.end(JSON.stringify({ error: `Method ${req.method} Not Allowed` }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const { identity, password } = JSON.parse(body || '{}');
            const check = verifyCredentials(identity, password);

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            if (!check.valid || !check.identity) {
              res.statusCode = 401;
              res.end(
                JSON.stringify({
                  success: false,
                  error: check.error || 'Invalid meteorological workstation credentials.',
                })
              );
              return;
            }

            const token = createSessionToken(check.identity);
            res.setHeader(
              'Set-Cookie',
              `wxops_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
            );
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                success: true,
                identity: check.identity,
                token,
              })
            );
          } catch (err: unknown) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ success: false, error: 'Invalid request payload' }));
          }
        });
      });

      // POST /api/auth/logout
      server.middlewares.use('/api/auth/logout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Allow', 'POST');
          res.end(JSON.stringify({ error: `Method ${req.method} Not Allowed` }));
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Set-Cookie',
          'wxops_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
        );
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: 'Logged out successfully.' }));
      });

      // GET /api/auth/session
      server.middlewares.use('/api/auth/session', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Allow', 'GET');
          res.end(JSON.stringify({ error: `Method ${req.method} Not Allowed` }));
          return;
        }

        const token = extractSessionToken(req.headers);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!token) {
          res.statusCode = 401;
          res.end(JSON.stringify({ authenticated: false, error: 'No session token provided.' }));
          return;
        }

        const check = verifySessionToken(token);
        if (!check.valid || !check.identity) {
          res.statusCode = 401;
          res.end(JSON.stringify({ authenticated: false, error: check.error || 'Invalid session.' }));
          return;
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ authenticated: true, identity: check.identity }));
      });

      // Specific /api/observations routes
      server.middlewares.use('/api/observations/status', adaptHandler(statusHandler));
      server.middlewares.use('/api/observations/ingest', adaptHandler(ingestHandler));
      server.middlewares.use('/api/observations/update', adaptHandler(updateHandler));
      server.middlewares.use('/api/observations/sync', adaptHandler(syncHandler));
      server.middlewares.use('/api/observations/archive', adaptHandler(archiveHandler));
      server.middlewares.use('/api/observations', (req, res, next) => {
        const pathPart = req.url?.split('?')[0];
        if (pathPart === '/' || pathPart === '') {
          return adaptHandler(indexHandler)(req, res);
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), wxopsApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
