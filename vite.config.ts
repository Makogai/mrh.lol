import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { site } from './src/config/site.ts';

// MRH_PKG=<package> isolates parallel implementers sharing one checkout (own outDir + own dep-optimizer cache).
// Unset in Docker / for the lead → plain dist/.
const pkg = process.env.MRH_PKG;
const outDir = pkg ? `dist-${pkg}` : 'dist';

// The hero name (LCP) is set in Mona Sans' width axis. Preloading the hashed file means the swap from the
// metric-matched fallback usually happens before first paint. Vite never preloads fonts on its own.
function preloadDisplayFont(): Plugin {
  return {
    name: 'mrh:preload-display-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /mona-sans-site-[\w-]+\.woff2$/.test(f));
        if (!file) return [];
        return [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' }, injectTo: 'head' }];
      },
    },
  };
}

/**
 * Minifies `*.glsl?raw`. The shaders are ~10 KB of commented source; comments and indentation would cost real gzip
 * bytes in a chunk with a 12 KB budget. Preprocessor lines (#ifdef...) must stay on their own line, everything else
 * can be joined.
 */
function glslMinify(): Plugin {
  return {
    name: 'mrh:glsl-minify',
    enforce: 'post', // after Vite's own ?raw loader, which has already produced `export default "<json string>"`
    transform(code, id) {
      if (!id.endsWith('.glsl?raw')) return null;
      const json = code.slice('export default '.length).replace(/;\s*$/, '');
      const src = (JSON.parse(json) as string).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const out: string[] = [];
      let line = '';
      for (const raw of src.split(/\r?\n/)) {
        const l = raw.trim();
        if (!l) continue;
        if (l[0] === '#') {
          if (line) out.push(line);
          line = '';
          out.push(l);
        } else line += l + ' ';
      }
      if (line) out.push(line);
      // No spaces stripped around + and - on purpose: "a - -b" and "a + +b" must not fuse into "--" / "++".
      const min = out.join('\n').replace(/[ \t]+/g, ' ').replace(/ ?([{}();,=*/<>?:[\]]) ?/g, '$1');
      return { code: `export default ${JSON.stringify(min)};`, map: null };
    },
  };
}

// Dev/preview twin of the nginx `location = /api/roblox-presence` block: Roblox's presence API has no CORS headers, so
// the browser can only reach it same-origin. Same contract as nginx: GET only, fixed body for the one configured
// user (never anything from the client), 45 s cache, stale value on upstream failure, `no-store` towards the browser.
// The userId comes from site.roblox.userId here and is hardcoded in nginx.conf: keep the two in sync by hand.
const PRESENCE_UPSTREAM = 'https://presence.roblox.com/v1/presence/users';
const PRESENCE_TTL_MS = 45_000;
function robloxPresenceDev(): Plugin {
  let cached: { at: number; body: string } | null = null;
  let inflight: Promise<string> | null = null;
  const refresh = (): Promise<string> =>
    (inflight ??= fetch(PRESENCE_UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ userIds: [site.roblox.userId] }),
      signal: AbortSignal.timeout(4000),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`presence upstream ${res.status}`);
        const body = await res.text();
        cached = { at: Date.now(), body };
        return body;
      })
      .finally(() => { inflight = null; }));

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
    let body = cached && Date.now() - cached.at < PRESENCE_TTL_MS ? cached.body : null;
    if (body === null) {
      try { body = await refresh(); } catch { body = cached?.body ?? null; }
    }
    if (body === null) { res.statusCode = 502; res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  }

  const mount = (server: { middlewares: { use(path: string, fn: (req: IncomingMessage, res: ServerResponse) => void): unknown } }) => {
    // Exact path only: connect's prefix match would also catch /api/roblox-presence/anything.
    server.middlewares.use(site.roblox.presenceEndpoint, (req, res) => {
      // connect strips the mount path, so an exact hit leaves '/' (+ query).
      if (req.url && req.url.split('?')[0] !== '/') { res.statusCode = 404; res.end(); return; }
      void handle(req, res);
    });
  };
  return { name: 'mrh:roblox-presence-dev', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), preloadDisplayFont(), glslMinify(), robloxPresenceDev()],
  cacheDir: pkg ? `node_modules/.vite-${pkg}` : 'node_modules/.vite',
  build: { outDir: isSsrBuild ? `${outDir}-ssr` : outDir, sourcemap: false },
}));
