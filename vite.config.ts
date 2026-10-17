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

      // /api/observations/archive
      server.middlewares.use('/api/observations/archive', (req, res) => {
        if (req.method === 'GET') {
          const archive = defaultObservationStore.exportArchive();
          const latestDate =
            archive.metadata.dates.length > 0
              ? archive.metadata.dates[archive.metadata.dates.length - 1]
              : 'empty';

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="wxops_archive_${latestDate}.json"`);
          res.statusCode = 200;
          res.end(JSON.stringify(archive, null, 2));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const result = defaultObservationStore.restoreArchive(parsed);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              if (!result.success) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: result.error }));
                return;
              }
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  success: true,
                  datesRestored: result.datesRestored,
                  stationCount: result.stationCount,
                })
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Invalid JSON';
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ success: false, error: msg }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.setHeader('Allow', 'GET, POST');
        res.end(JSON.stringify({ error: `Method ${req.method} Not Allowed` }));
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
