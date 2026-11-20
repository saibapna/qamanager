import { app } from '../functions/api/[[path]].js';
import { assets } from './generated-assets.mjs';
export { ProjectLive } from './project-live.js';

type BindingEnv = {
  HYPERDRIVE?: { connectionString: string };
  PROJECT_LIVE?: DurableObjectNamespace;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
};

const mimeMap: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', ico: 'image/x-icon', webp: 'image/webp',
  woff: 'font/woff', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8',
};
const assetKey = (path: string): string => path === '/' ? '/index.html' : path;
function assetResponse(path: string, method: string): Response {
  const requestedKey = assetKey(path);
  const assetFiles = assets as Record<string, string>;
  const servedKey = assetFiles[requestedKey] !== undefined
    ? requestedKey
    : (path.startsWith('/assets/') ? undefined : '/index.html');
  if (servedKey === undefined || assetFiles[servedKey] === undefined) {
    return new Response('Not found', { status: 404 });
  }
  const entry = assetFiles[servedKey];
  const ext = servedKey.slice(servedKey.lastIndexOf('.') + 1);
  const headers = new Headers({
    'Content-Type': mimeMap[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': servedKey.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
  });
  if (method === 'HEAD') return new Response(null, { headers });
  const bytes = Uint8Array.from(atob(entry), ch => ch.charCodeAt(0));
  return new Response(bytes, { headers });
}

export default {
  fetch(request: Request, env: BindingEnv, ctx: ExecutionContext): Response | Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/')) return app.fetch(request, env, ctx);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
    return assetResponse(path, request.method);
  },
};
