# mrh.lol status relay

Merges Discord presence (two accounts), the owner's Roblox presence and two Steam profiles into one snapshot.

- `GET /v1/status` JSON snapshot (`v: 1`, contract in `src/status/types.ts` of the site)
- `GET /v1/stream` SSE: full snapshot on change, `: ping` every 25s
- `GET /healthz` `ok`

A source that is unavailable or not configured is `null`; the site shows that as PARTIAL, never as a fake "offline".
Privacy: Spotify is off unless `STATUS_SHOW_SPOTIFY=1`; Steam persona names, user ids and tokens are never emitted.

## Run locally

```bash
cd services/status
npm install
cp env.example .env     # (rename env.example to .env.example in git); fill DISCORD_TOKEN if you want Discord
PORT=3000 npm start     # no DISCORD_TOKEN = Roblox + Steam only
```

## Deploy (Coolify)

1. **+ New Resource**, same repository, branch `main`, **Build Pack: Dockerfile**.
2. **Base Directory** `/services/status`, Dockerfile `/Dockerfile`, **Ports Exposes** `3000`.
3. **Domains** `https://status.mrh.lol` (DNS `A` record to the Coolify server).
4. **Environment Variables** (runtime, not build): `DISCORD_TOKEN`, `DISCORD_GUILD_ID` (optional if the bot is in one server),
   `DISCORD_WATCH=makogai,mrharold01`, plus any `STATUS_*` from `.env.example`.
5. **Health Check** path `/healthz`, port `3000`.
6. Developer Portal, Bot tab: enable **Presence Intent** and **Server Members Intent**. Both watched accounts must be in the server.

Coolify's Traefik proxy streams SSE as-is (the relay sends `X-Accel-Buffering: no`). The site reads this from
`VITE_STATUS_URL` (default `https://status.mrh.lol`).

## Verify

```bash
curl -s https://status.mrh.lol/v1/status
curl -sN https://status.mrh.lol/v1/stream     # first frame immediately, then on change
```
