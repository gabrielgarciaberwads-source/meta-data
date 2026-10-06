import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createDbPool, closeDbPool } from './db.mjs';
import { createDashboardApi } from './dashboard-api.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(currentDir, '..');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

function securityHeaders(contentType) {
  return {
    'content-type': contentType,
    'cache-control': contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
  };
}

export function createHttpServer({ api, staticDir }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://dashboard.internal');
      if (url.pathname.startsWith('/api/')) {
        const result = await api({ method: request.method, url: url.toString() });
        response.writeHead(result.status, { ...securityHeaders('application/json; charset=utf-8'), ...result.headers });
        response.end(result.body);
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, securityHeaders('text/plain; charset=utf-8'));
        response.end('Method not allowed');
        return;
      }

      const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = path.resolve(staticDir, `.${requested}`);
      if (filePath !== staticDir && !filePath.startsWith(`${staticDir}${path.sep}`)) {
        response.writeHead(400, securityHeaders('text/plain; charset=utf-8'));
        response.end('Invalid path');
        return;
      }

      const content = await readFile(filePath);
      const contentType = mimeTypes[path.extname(filePath)] ?? 'application/octet-stream';
      response.writeHead(200, securityHeaders(contentType));
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(404, securityHeaders('text/plain; charset=utf-8'));
      response.end('Not found');
    }
  });
}

export async function startServer({ env = process.env } = {}) {
  const pool = await createDbPool({ env });
  const api = createDashboardApi({ db: pool });
  const staticDir = path.resolve(projectDir, 'dist');
  const server = createHttpServer({ api, staticDir });
  const port = Number(env.PORT ?? 4178);
  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDbPool(pool);
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  return { server, pool, port, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().then(({ port }) => console.log(`meta-raw-dashboard listening on ${port}`));
}
