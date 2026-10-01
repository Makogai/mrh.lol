// mrh.lol status relay. One in-memory snapshot merged from three sources, served as JSON and SSE.
// Contract: src/status/types.ts in the site repo (mirrored, `v: 1`). A null source = unavailable. Never emits ids or tokens.
import { existsSync } from 'node:fs';
import http from 'node:http';

// .env for local runs (Coolify injects real env). Node's built-in parser: no dotenv dependency, nothing is ever logged.
if (existsSync('.env')) process.loadEnvFile('.env');

const { startDiscord } = await import('./discord.js');
const { startRoblox } = await import('./roblox.js');
const { startSteam } = await import('./steam.js');

const env = process.env;
const flag = (name, def) => (env[name] === undefined || env[name] === '' ? def : /^(1|true|yes|on)$/i.test(env[name]));
const show = {
  discord: flag('STATUS_SHOW_DISCORD', true),
  activity: flag('STATUS_SHOW_ACTIVITY', true),
  custom: flag('STATUS_SHOW_CUSTOM', true),
  spotify: flag('STATUS_SHOW_SPOTIFY', false), // privacy: off unless explicitly enabled
  robloxGame: flag('STATUS_SHOW_ROBLOX_GAME', true),
  steam: flag('STATUS_SHOW_STEAM', true),
};

// Each source owns one slot and calls set(value|null) when it changes.
const parts = { discord: null, roblox: null, steam: null };
const clients = new Set();
let lastJson = '';
let lastChange = new Date().toISOString();

const snapshot = () => ({ v: 1, updatedAt: lastChange, discord: parts.discord, roblox: parts.roblox, steam: parts.steam });

function set(key, value) {
  parts[key] = value;
  const body = JSON.stringify({ ...snapshot(), updatedAt: '' });
  if (body === lastJson) return; // identical content: no event
  lastJson = body;
  lastChange = new Date().toISOString();
  const frame = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) res.write(frame);
}

startDiscord({ env, show, set: (v) => set('discord', v) });
startRoblox({ env, show, set: (v) => set('roblox', v) });
startSteam({ env, show, set: (v) => set('steam', v) });

const ALLOWED = new Set(['https://mrh.lol', ...(env.STATUS_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)]);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // public data, so dev origins are fine in production too

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const headers = { 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (origin && (ALLOWED.has(origin) || LOCAL.test(origin))) headers['Access-Control-Allow-Origin'] = origin;
  const path = (req.url ?? '/').split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600' }).end();
  } else if (req.method !== 'GET') {
    res.writeHead(405, headers).end();
  } else if (path === '/healthz') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok\n');
  } else if (path === '/v1/status') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(snapshot()));
  } else if (path === '/v1/stream') {
    res.writeHead(200, {
      ...headers,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell nginx/Traefik not to buffer the stream
    });
    res.write(`retry: 5000\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else {
    res.writeHead(404, headers).end();
  }
});

setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25_000).unref();

const port = Number(env.PORT) || 3000;
server.listen(port, () => console.log(`status relay listening on :${port}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
