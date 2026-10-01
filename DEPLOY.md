# Deploying mrh.lol (Coolify)

The site is a static bundle served by nginx. Coolify builds the `Dockerfile` (Node 22 builds, `nginx:1.30-alpine`
serves) and the container listens on **port 80**. nginx also proxies one URL, `/api/roblox-presence`, to Roblox.

## 1. Coolify click-path

1. **Projects** → your project → environment → **+ New Resource**.
2. Pick the source:
   - **Public Repository**: URL `https://github.com/Makogai/mrh.lol`, or
   - **Private Repository (with GitHub App)** / **(with Deploy Key)**: repository `git@github.com:Makogai/mrh.lol.git`.
3. **Branch** `main` · **Build Pack: Dockerfile** · Base Directory `/` · Dockerfile Location `/Dockerfile` → **Continue**.
4. Resource → **Configuration → General**:
   - **Ports Exposes**: `80`
   - **Domains**: `https://mrh.lol` (type `https://mrh.lol,https://www.mrh.lol` to serve both).
     For the www redirect, set the domain **Direction** to *Redirect to non-www* (wording varies by Coolify version).
   - DNS: `A` records for `mrh.lol` and `www` pointing at the Coolify server. Coolify's proxy issues the certificate.
5. **Configuration → Environment Variables** → add both, tick **Build Variable** on each, **Save**:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` (from `.env.local`) |
   | `VITE_SUPABASE_ANON_KEY` | the publishable/anon key (from `.env.local`) |

   Vite inlines `VITE_*` and `scripts/gen-data.mjs` fetches projects with them, both during `docker build`, so a
   runtime-only variable does nothing. Without them the site still builds: the form is hidden and the project grid uses the
   fallback in `src/config/site.ts`. Never put the `service_role` key anywhere.
6. **Configuration → Health Check** → enable, path `/healthz`, port `80` (the image's own `HEALTHCHECK` hits the same URL).
7. **Deploy**. The build runs `npm run build` (typecheck + the 150 KB gzip JS budget), so a failure there fails the deploy
   before anything is served.

TLS ends at Coolify's proxy, which is why `nginx.conf` sets `absolute_redirect off`.

## 2. Verify

```bash
curl -sI https://mrh.lol/              # 200, cache-control: no-cache
curl -s  https://mrh.lol/healthz       # ok
curl -sI https://mrh.lol/nope          # 404 + the branded "This trace leads nowhere." page
curl -sI -H 'Accept-Encoding: gzip' https://mrh.lol/assets/<some>.js
                                       # cache-control: public, max-age=31536000, immutable + content-encoding: gzip
curl -s  https://mrh.lol/api/roblox-presence
                                       # {"userPresences":[{"userPresenceType":...}]}
curl -sI https://mrh.lol/api/roblox-presence
                                       # 200, cache-control: no-store, no set-cookie, no strict-transport-security
curl -sI -X POST https://mrh.lol/api/roblox-presence    # 403: GET only
curl -sI https://mrh.lol/roblox/avatar.json             # cache-control: no-cache
curl -sI -H 'Accept-Encoding: gzip' https://mrh.lol/roblox/avatar.<hash>.bin
                                       # immutable + gzip (the hash is in avatar.json, "bin.url")
curl -s  https://mrh.lol/ | grep -o 'property="og:image" content="[^"]*"'   # absolute https://mrh.lol/og.png
```

(`<some>.js` is any `/assets/index-….js` URL from the page source.) If `/api/roblox-presence` answers 502, the card
and the Contact tile show the neutral "Main · Roblox" label and nothing breaks: check that the container can resolve
`presence.roblox.com` (`docker exec <container> nslookup presence.roblox.com`).

Then paste the URL into a share debugger (Discord, LinkedIn Post Inspector, opengraph.xyz) and run Lighthouse in
mobile mode against the live URL. Targets: 95 performance, 100 for accessibility, best practices and SEO.

## 3. Supabase

1. Create a project. Copy the **Project URL** and the **publishable (anon) key** (Settings → API) into the two build
   variables above.
2. SQL Editor → run **every file in `supabase/migrations/`, in numeric order, one paste per file: `0001_init.sql`, then
   `0002_discord_embed.sql`.** Both are idempotent, so re-running is safe, but **never re-run 0001 on its own after 0002**:
   0002 replaces `private.notify_discord()` with the rich-embed version and 0001 would put the plain format back.
   - `0001_init.sql` creates `public.messages`, `public.projects`, the `public.submit_contact(...)` RPC (validation,
     per-IP rate limit, honeypot) and the private settings table.
   - `0002_discord_embed.sql` seeds the `site_url`, `inbox_url`, `discord_avatar_url` and `discord_buttons` settings.

   Verify that 0002 is live (should return 3 rows):

   ```sql
   select key from private.settings where key in ('site_url', 'inbox_url', 'discord_buttons');
   ```

   Nothing in the repo records which migrations a project has had applied, so re-run this check after restoring or
   recreating one.
3. **Read messages:** Table Editor → `public.messages` (anonymous visitors can insert through the RPC, never read). Toggle `is_read`.
4. **Add a project:** Table Editor → `public.projects` → insert a row with `published = true`, then rebuild (section 4).
5. **Tune limits** in `private.settings`; for a Discord ping per message, insert a `discord_webhook_url` row there. The
   `private` schema is not exposed to the API, so use the SQL Editor (the statement is in a comment in the migration).

## 4. Rebuild when Supabase data changes (webhook)

Projects are fetched **at build time** and baked in; adding a project changes nothing until the site is rebuilt.

1. Coolify → resource → **Webhooks** → copy the *Deploy Webhook URL*. **Keys & Tokens → API tokens** → create one with
   the **deploy** permission only.
2. Manual rebuild:

   ```bash
   curl -fsS "https://<your-coolify-host>/api/v1/deploy?uuid=<resource-uuid>&force=true" \
     -H "Authorization: Bearer $COOLIFY_TOKEN"
   ```

   **Always `force=true` for data refreshes.** With an unchanged repo, `COPY . .` and `RUN npm run build` are Docker
   cache hits, so a plain redeploy reuses the old bundle and never runs the Supabase fetch.
3. Automatic: Supabase → Database → Webhooks → Create → table `public.projects`, events **Insert, Update, Delete**,
   type **HTTP Request**, method **GET**, URL `https://<your-coolify-host>/api/v1/deploy?uuid=<resource-uuid>&force=true`,
   header `Authorization: Bearer <deploy-scoped token>`. The token lives in Supabase's webhook config, so keep it deploy-scoped.

## 5. The Roblox pieces

- **Presence** (`/api/roblox-presence`): nginx sends a fixed POST for one user id to `presence.roblox.com` and caches the
  answer for 45 s. The id is hardcoded in `nginx.conf` and must match `site.roblox.userId` in `src/config/site.ts` (dev and
  preview read the config). What is shown (`'status'` / `'game'` / `'off'`) is `site.roblox.presence`.
- **Avatar assets** (`public/roblox/`) are committed. To change the outfit, see "Refreshing the 3D avatar" in the README.
- nginx needs working DNS for the proxy: it resolves through Docker's embedded DNS (`127.0.0.11`, present on Coolify's
  user-defined networks) with `1.1.1.1` as a backstop, and still boots if DNS is down.

## 6. Run it locally

```bash
docker network create mrh && docker run --rm --network mrh -p 8080:80 "$(docker build -q .)"   # http://localhost:8080
# or build + run + assert section 2's checks against a container:
npm run qa:docker                  # add -- --keep to leave it running
npm run qa:lighthouse -- --runs 5   # 5x mobile + desktop against http://localhost:8080 (worst run is gated)
```

The user-defined network matters only for the presence proxy: on Docker's default bridge there is no `127.0.0.11`, so
presence lookups can fail (the card then shows the neutral label).
