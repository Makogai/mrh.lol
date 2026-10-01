// Builds the production image, runs it and checks what a real deploy must get right (BUILD_PLAN §13.2).
//   node scripts/qa/docker-smoke.mjs [--keep] [--port 8080] [--no-build]
// --keep leaves the container running afterwards (for `npm run qa:lighthouse`, which targets http://localhost:8080).
//
// The image is built exactly as Coolify builds it: `npm ci` + `npm run build` (typecheck + budget gate) inside Docker,
// then nginx. Supabase build variables are forwarded only when they are already present in this process's environment —
// the script never reads .env files, and `--build-arg NAME` (no value) means the value is never printed.
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const keep = flag('--keep');
const port = Number(option('--port', '8080'));
const IMAGE = 'mrh-lol:qa';
const NAME = 'mrh-lol-qa';
const NET = 'mrh-lol-qa-net';
const base = `http://127.0.0.1:${port}`;

const docker = (a, opts = {}) => spawnSync('docker', a, { stdio: 'inherit', ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Raw GET without transparent decompression, so `content-encoding` and byte sizes are what the wire carried. */
function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}${path}`, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let body = Buffer.concat(chunks);
        const wire = body.length;
        if (res.headers['content-encoding'] === 'gzip') body = gunzipSync(body);
        resolve({ status: res.statusCode, headers: res.headers, body, wire });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error(`timeout on ${path}`)));
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function cleanup() {
  if (keep) return;
  docker(['rm', '-f', NAME], { stdio: 'ignore' });
  docker(['network', 'rm', NET], { stdio: 'ignore' });
}

if (spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) {
  console.error('docker is not available (is Docker Desktop running?)');
  process.exit(2);
}

if (!flag('--no-build')) {
  const buildArgs = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => process.env[k]).flatMap((k) => ['--build-arg', k]);
  console.log(`> docker build -t ${IMAGE} ${buildArgs.join(' ')} .`);
  const built = docker(['build', '-t', IMAGE, ...buildArgs, '.']);
  if (built.status !== 0) {
    console.error('\ndocker build FAILED. The build runs `npm run build`, which includes the full typecheck — a failure in another package\'s files is reported in the output above.');
    process.exit(1);
  }
}

docker(['rm', '-f', NAME], { stdio: 'ignore' }); // a previous --keep run
// A user-defined network, like Coolify's: only there does Docker's embedded DNS (127.0.0.11, the first resolver in
// nginx.conf's presence proxy) exist. On the default bridge it refuses connections and presence lookups fail.
docker(['network', 'create', NET], { stdio: 'ignore' });
const run = docker(['run', '-d', '--name', NAME, '--network', NET, '-p', `${port}:80`, IMAGE], { stdio: ['ignore', 'pipe', 'inherit'] });
if (run.status !== 0) {
  console.error(`docker run failed (is port ${port} already in use?)`);
  process.exit(1);
}

try {
  // Wait for nginx to answer.
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await get('/healthz')).status === 200; } catch { await sleep(500); }
  }
  if (!up) {
    check('container answers on /healthz within 30 s', false);
    docker(['logs', NAME]);
    throw new Error('container did not come up');
  }

  const health = await get('/healthz');
  check('GET /healthz → 200 "ok"', health.status === 200 && health.body.toString().trim() === 'ok', `${health.status} ${JSON.stringify(health.body.toString().trim())}`);
  check('/healthz is no-store', health.headers['cache-control'] === 'no-store', health.headers['cache-control']);

  const root = await get('/', { 'Accept-Encoding': 'gzip' });
  const html = root.body.toString();
  check('GET / → 200 text/html', root.status === 200 && /text\/html/.test(root.headers['content-type'] ?? ''), `${root.status} ${root.headers['content-type']}`);
  check('/ is no-cache (always revalidated)', root.headers['cache-control'] === 'no-cache', root.headers['cache-control']);
  check('/ is gzipped', root.headers['content-encoding'] === 'gzip', `${root.wire} bytes on the wire`);
  check('prerendered <h1> is in the HTML (not an empty #root)', /<h1[\s>]/.test(html));
  check('seo-head and app-html markers were replaced', !html.includes('<!--seo-head-->') && !html.includes('<!--app-html-->'));
  check('canonical link', html.includes('<link rel="canonical" href="https://mrh.lol/"'));
  check('og:image is absolute', /property="og:image" content="https:\/\/mrh\.lol\/og\.png"/.test(html));
  check('twitter:card summary_large_image', html.includes('name="twitter:card" content="summary_large_image"'));
  check('icon links declared', ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/site.webmanifest'].every((p) => html.includes(`href="${p}"`)));
  let ld = null;
  try { ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''); } catch { /* reported below */ }
  const types = (ld?.['@graph'] ?? []).map((n) => n['@type']);
  check('JSON-LD parses and has WebSite, ProfilePage, Person', ['WebSite', 'ProfilePage', 'Person'].every((t) => types.includes(t)), types.join(', '));

  for (const [header, expected] of [
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
  ]) check(`header ${header}`, root.headers[header] === expected, root.headers[header]);

  // A fingerprinted asset: must be immutable and gzipped.
  const jsPath = /(?:src|href)="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!jsPath) check('found a /assets/*.js reference in the HTML', false);
  else {
    const js = await get(jsPath, { 'Accept-Encoding': 'gzip' });
    check(`GET ${jsPath} → 200 immutable`, js.status === 200 && /immutable/.test(js.headers['cache-control'] ?? '') && /max-age=31536000/.test(js.headers['cache-control'] ?? ''), `${js.status} ${js.headers['cache-control']}`);
    check('  … and gzipped', js.headers['content-encoding'] === 'gzip', `${js.wire} bytes on the wire for ${js.body.length} raw`);
  }
  const cssPath = /href="(\/assets\/[^"]+\.css)"/.exec(html)?.[1];
  if (cssPath) {
    const css = await get(cssPath, { 'Accept-Encoding': 'gzip' });
    check(`GET ${cssPath} → immutable + gzip`, css.status === 200 && /immutable/.test(css.headers['cache-control'] ?? '') && css.headers['content-encoding'] === 'gzip');
  }

  const nope = await get('/nope');
  const nopeHtml = nope.body.toString();
  check('GET /nope → 404', nope.status === 404, String(nope.status));
  check('404 is the branded page', /This trace leads nowhere/.test(nopeHtml) && /noindex/.test(nopeHtml));
  check('404 ships no JS', !/<script[^>]*type="module"/.test(nopeHtml));
  check('404 is not cached', /no-cache/.test(nope.headers['cache-control'] ?? ''), nope.headers['cache-control']);

  for (const [path, type] of [
    ['/og.png', /^image\/png/],
    ['/favicon.ico', /^image\/(x-icon|vnd\.microsoft\.icon)/],
    ['/favicon.svg', /^image\/svg\+xml/],
    ['/apple-touch-icon.png', /^image\/png/],
    ['/site.webmanifest', /^application\/manifest\+json/],
    ['/robots.txt', /^text\/plain/],
    ['/sitemap.xml', /xml/],
  ]) {
    const r = await get(path);
    check(`GET ${path} → 200 ${type.source.replace(/\\/g, '')}`, r.status === 200 && type.test(r.headers['content-type'] ?? ''), `${r.status} ${r.headers['content-type']} ${r.body.length} B`);
  }

  // 3D avatar assets and the presence proxy (nginx.conf; docs/PLAYER_INTEGRATION.md §5).
  const manifest = await get('/roblox/avatar.json', { 'Accept-Encoding': 'gzip' });
  check('/roblox/avatar.json → no-cache', manifest.status === 200 && manifest.headers['cache-control'] === 'no-cache', `${manifest.status} ${manifest.headers['cache-control']}`);
  let binUrl = null;
  try { binUrl = JSON.parse(manifest.body.toString()).bin.url; } catch { /* reported below */ }
  if (!binUrl) check('avatar.json names a .bin', false);
  else {
    const bin = await get(`/roblox/${binUrl}`, { 'Accept-Encoding': 'gzip' });
    check(`/roblox/${binUrl} → immutable + gzip`, bin.status === 200 && /immutable/.test(bin.headers['cache-control'] ?? '') && bin.headers['content-encoding'] === 'gzip', `${bin.wire} B on the wire for ${bin.body.length} B`);
  }
  const tex = /"url":"(tex\/[^"]+)"/.exec(manifest.body.toString())?.[1];
  if (tex) {
    const t = await get(`/roblox/${tex}`);
    check(`/roblox/${tex} → immutable`, t.status === 200 && /immutable/.test(t.headers['cache-control'] ?? ''), t.headers['cache-control']);
  }
  const poster = await get('/roblox/fallback/avatar-300x440.avif');
  check('/roblox/fallback/* → 200, default (1 day) cache', poster.status === 200 && poster.headers['cache-control'] === 'public, max-age=86400', `${poster.status} ${poster.headers['cache-control']}`);

  const pres = await get('/api/roblox-presence');
  let presJson = null;
  try { presJson = JSON.parse(pres.body.toString()); } catch { /* may be offline */ }
  // 200 with Roblox's payload when the container has internet; a 502/504 (no stale copy yet) is acceptable offline.
  check('/api/roblox-presence → no-store, Roblox payload or 5xx', pres.headers['cache-control'] === 'no-store' && (pres.status === 200 ? Array.isArray(presJson?.userPresences) : pres.status >= 500), `${pres.status} ${pres.headers['cache-control']}`);
  check('/api/roblox-presence keeps the security headers (no add_header in its location)', pres.headers['x-content-type-options'] === 'nosniff' && pres.headers['x-frame-options'] === 'DENY');
  check('/api/roblox-presence sends no Set-Cookie', !pres.headers['set-cookie']);
  const post = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/roblox-presence`, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end('{"userIds":[1]}');
  });
  check('POST /api/roblox-presence is refused (GET only)', post === 403, String(post));
  if (pres.status === 200) {
    const again = await get('/api/roblox-presence?userIds=1');
    check('second request is served from the nginx cache (same body, query ignored)', again.status === 200 && again.body.equals(pres.body), String(again.status));
  }

  const inspect = spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', NAME], { encoding: 'utf8' });
  console.log(`\ncontainer health (image HEALTHCHECK, interval 30 s): ${inspect.stdout.trim() || 'unknown'}`);
} catch (err) {
  console.error(err.message);
  check('smoke run completed', false);
} finally {
  cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.${keep ? `  Container "${NAME}" left running on ${base} (docker rm -f ${NAME} to stop).` : ''}`);
process.exit(failed.length ? 1 : 0);
