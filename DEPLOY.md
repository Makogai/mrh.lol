# Deploying mrh.lol (Coolify)

The site is a static bundle served by nginx. Coolify builds the `Dockerfile` (Node 22 builds, `nginx:1.30-alpine`
serves), and the container listens on **port 80**.

## 1. Coolify settings that matter

| Setting | Value |
|---|---|
| Build Pack | **Dockerfile** |
| Dockerfile location | `/Dockerfile` |
| Ports Exposes | **80** |
| Domains | `https://mrh.lol` (optionally add `https://www.mrh.lol` and let Coolify redirect it to the apex) |
| Health check | path `/healthz`, port `80` (or rely on the image's own `HEALTHCHECK`, which hits the same URL) |

TLS ends at Coolify's proxy. `nginx.conf` sets `absolute_redirect off` for that reason: an absolute redirect would
point visitors back at `http://`.

### Environment variables

| Variable | Needed at | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | **build** | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **build** | the *publishable* / anon key. Public by design: row-level security and the RPC do the guarding |

Tick **"Build Variable"** on both. Vite inlines `VITE_*` into the bundle and `scripts/gen-data.mjs` uses them to
fetch projects, and both happen during `docker build`, not when the container runs. A runtime-only variable has no
effect.

Without them the site still builds: the contact form is hidden and the project grid uses the fallback in
`src/config/site.ts`.

## 2. Supabase

1. Create a project. Copy the **Project URL** and the **publishable (anon) key** (Settings → API) into the two
   build variables above. Never use the `service_role` key anywhere in this repo or in Coolify.
2. SQL Editor → run **every file in `supabase/migrations/`, in numeric order**, one paste per file. Both are idempotent,
   so re-running is safe.
   - `0001_init.sql` creates `public.messages`, `public.projects`, the `public.submit_contact(...)` RPC (validation,
     per-IP rate limit, honeypot) and the private settings table.
   - `0002_discord_embed.sql` replaces `private.notify_discord()` with the rich embed version and seeds the
     `site_url`, `inbox_url`, `discord_avatar_url` and `discord_buttons` settings. Skip it and Discord notifications
     stay on the plain 0001 format.

   Verify that 0002 is live (should return 3 rows):

   ```sql
   select key from private.settings where key in ('site_url', 'inbox_url', 'discord_buttons');
   ```

   Nothing in the repo records which migrations a given Supabase project has had applied, so re-run this check after
   restoring or recreating a project.
3. **Read messages:** Table Editor → `public.messages`. Anonymous visitors can insert through the RPC but can never
   read anything back. Toggle `is_read` as you go.
4. **Add a project:** Table Editor → `public.projects` → insert a row with `published = true`, then trigger a
   rebuild (section 3). Only published rows are readable by the anon key.
5. **Tune limits** in `private.settings`, and get a Discord ping for each message by inserting a `discord_webhook_url`
   row there. The `private` schema is not exposed to the API, so use the SQL Editor (the exact statement is in a comment
   in the migration).

## 3. Rebuilding when data changes

Projects are fetched **at build time** and baked into the bundle: there is deliberately no runtime fetch. So adding
a project in the dashboard changes nothing until the site is rebuilt.

In Coolify open the resource → **Webhooks** → copy the *Deploy Webhook URL*, then create an API token
(Keys & Tokens → API tokens) with the **deploy** permission only.

```bash
curl -fsS "https://<your-coolify-host>/api/v1/deploy?uuid=<resource-uuid>&force=true" \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

**Always use `force=true` for data refreshes.** Docker layer caching works against you here: when the repository is
unchanged, `COPY . .` and the `RUN npm run build` layer are cache hits, so a plain redeploy reuses the old bundle
and never runs the Supabase fetch. `force=true` rebuilds without the cache.

### Optional: rebuild automatically

Supabase → Database → Webhooks → Create:

- Table `public.projects`, events **Insert, Update, Delete**
- Type **HTTP Request**, method **GET**
- URL `https://<your-coolify-host>/api/v1/deploy?uuid=<resource-uuid>&force=true`
- HTTP header `Authorization: Bearer <deploy-scoped token>`

The token lives in Supabase's webhook config, which is why it should be deploy-scoped and nothing more.

## 4. Verify a deploy

```bash
curl -sI https://mrh.lol/              # 200, cache-control: no-cache
curl -s  https://mrh.lol/healthz       # ok
curl -sI https://mrh.lol/nope          # 404, and the body is the branded "This trace leads nowhere." page
curl -s  https://mrh.lol/ | grep -o 'property="og:image" content="[^"]*"'   # absolute https://mrh.lol/og.png
curl -sI -H 'Accept-Encoding: gzip' https://mrh.lol/assets/<some>.js
                                       # cache-control: public, max-age=31536000, immutable + content-encoding: gzip
curl -sI https://mrh.lol/og.png        # 200 image/png
curl -s  https://mrh.lol/robots.txt https://mrh.lol/sitemap.xml
```

(`<some>.js` is the `/assets/index-….js` URL referenced in the page source.)

Then: paste the URL into a share debugger (Discord, LinkedIn Post Inspector, or opengraph.xyz) to see the OG card, and
run Lighthouse in mobile mode against the live URL. Targets are 95 performance and 100 for accessibility, best
practices and SEO.

## 5. Run it locally

```bash
docker build -t mrh-lol . && docker run --rm -p 8080:80 mrh-lol     # then open http://localhost:8080
# or, build + run + assert everything in section 4 against the container:
npm run qa:docker                  # add -- --keep to leave it running
npm run qa:lighthouse              # mobile + desktop against http://localhost:8080
```

`docker build` runs `npm run build`, which includes the typecheck and the 150 KB gzip JavaScript budget; a failure
in either fails the deploy before anything is served.
