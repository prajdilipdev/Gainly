# Deploying Gainly for free: Neon + Render + Vercel

This is the exact path for a single-owner deployment at $0/month: **Neon** (Postgres),
**Render** (API, free web service), **Vercel** (frontend). No credit card required
for any of the three.

> **One tradeoff to accept:** Render's free web service "spins down" after 15
> minutes with no traffic and takes ~30–50s to wake back up on the next
> request. The price-alert scheduler only runs while the API is awake, so
> alerts are evaluated in real time while you're using the app, and catch up
> shortly after it wakes rather than firing every minute around the clock.
> See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) if you later want a
> genuinely always-on free option (Oracle Cloud's Always Free VM).

Do these in order — each step needs something from the previous one.

---

## 1. Neon (database)

1. Go to [neon.tech](https://neon.tech) → sign up (GitHub login is fine) → **New Project**.
2. Name it anything (e.g. `gainly`), pick any region close to you, Postgres version 16+.
3. On the project dashboard, copy the **connection string** shown for the
   **default branch**. Use the plain **"Direct connection"** string (not the
   "Pooled connection" one) — Render runs a normal always-on Node process
   (when awake), not serverless functions, so it doesn't need PgBouncer
   pooling; Prisma manages its own pool.
4. It looks like:
   ```
   postgresql://<user>:<password>@<host>.neon.tech/<database>?sslmode=require
   ```
   Keep this tab open — you'll paste it into Render as `DATABASE_URL`.

---

## 2. Render (API)

1. Go to [render.com](https://render.com) → sign up (GitHub login) → **New** → **Web Service**.
2. Connect your GitHub account, select the `Gainly` repo.
3. Fill in these exact fields:

   | Field | Value |
   |---|---|
   | **Name** | `gainly-api` (or anything) |
   | **Region** | any (closest to you) |
   | **Branch** | `main` |
   | **Root Directory** | *(leave blank — repo root)* |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install --include=dev && npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build --workspace apps/api` |
   | **Start Command** | `npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js` |
   | **Instance Type** | `Free` |

   > Why root directory is blank and the commands reference `apps/api/...`
   > explicitly: this is an npm-workspaces monorepo. Running `npm install`
   > from the true repo root (not inside `apps/api`) is what makes the
   > committed root `package-lock.json` resolve the exact same dependency
   > versions this app was built and tested with — the same command shape
   > used throughout local development. Render doesn't need a Root
   > Directory override for this to work.

   > Why `--include=dev` is not optional: `NODE_ENV=production` (set in the
   > next step, and needed at runtime so auth cookies are marked `Secure`)
   > is also visible during the build. npm skips `devDependencies` whenever
   > it sees production mode — and `@nestjs/cli`, which provides the `nest`
   > command that compiles this API, is a devDependency. Without the flag
   > the build fails with `sh: 1: nest: not found` / `npm error code 127`.

4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(the Neon direct connection string from step 1)* |
   | `JWT_ACCESS_SECRET` | *(generate below — never reuse the ones in this doc)* |
   | `JWT_REFRESH_SECRET` | *(generate below — different from access secret)* |
   | `COOKIE_SECRET` | *(generate below)* |
   | `CORS_ORIGINS` | `http://localhost:3000` *(you'll update this in step 4, after Vercel gives you a real URL)* |

   Generate your own secrets — **don't reuse example values from any doc**.
   Run this once locally and paste the three outputs in:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Run it three separate times for three different values (access secret,
   refresh secret, cookie secret — each must be unique).

   Leave `REDIS_URL` unset — the API automatically falls back to an
   in-memory cache when Redis isn't configured (see
   [`apps/api/src/cache/cache.service.ts`](../apps/api/src/cache/cache.service.ts)).
   Fine for a single-owner app; nothing to configure.

5. Click **Create Web Service**. First deploy takes a few minutes (installs
   the whole monorepo, builds the API, applies Prisma migrations against
   your fresh Neon database).
6. Once live, copy the URL Render gives you, e.g.
   `https://gainly-api.onrender.com`. You need this for step 3.

**Optional shortcut:** a [`render.yaml`](../render.yaml) Blueprint file is
included at the repo root with these exact settings pre-filled (secrets
excluded — Render will prompt you for those). In Render, you can use
**New** → **Blueprint** instead of **Web Service** to apply it in one step.
If Render's Blueprint schema has changed since this was written and the
import fails, just use the manual **Web Service** steps above instead —
they're the reliable fallback either way.

---

## 3. Vercel (frontend)

1. Go to [vercel.com](https://vercel.com) → sign up (GitHub login) → **Add New** → **Project**.
2. Import the `Gainly` repo.
3. In the import screen, set:

   | Field | Value |
   |---|---|
   | **Root Directory** | `apps/web` (click Edit next to it, select this folder) |
   | **Framework Preset** | Next.js *(auto-detected)* |
   | **Build/Install/Output Commands** | leave all as default — Vercel's monorepo support handles the workspace root automatically once Root Directory is set |

4. Expand **Environment Variables** and add just one:

   | Key | Value |
   |---|---|
   | `API_URL` | *(the Render URL from step 2, e.g. `https://gainly-api.onrender.com`)* |

   You do **not** need to set `NEXT_PUBLIC_SITE_URL` — the app automatically
   detects Vercel's own production URL at build time (see
   [`apps/web/src/lib/site-url.ts`](../apps/web/src/lib/site-url.ts)). Only
   set it manually later if you attach a custom domain and want that domain
   in metadata/sitemap instead of the `*.vercel.app` one.

5. Click **Deploy**. A couple of minutes later you'll get a URL like
   `https://gainly.vercel.app`.

---

## 4. Close the loop: connect CORS back to Vercel

Now that you know your real Vercel URL:

1. Go back to Render → your `gainly-api` service → **Environment**.
2. Update `CORS_ORIGINS` to your actual Vercel URL, e.g.:
   ```
   https://gainly.vercel.app
   ```
   (Comma-separate multiple origins if you later add a custom domain:
   `https://gainly.vercel.app,https://yourdomain.com`.)
3. Save — Render redeploys automatically with the new value.

> Note: this CORS setting is a defense-in-depth measure, not strictly load
> bearing for normal use. The browser never talks to Render directly — all
> `/api/v1/*` calls go to your Vercel domain, and Next.js's server-side
> rewrite (`apps/web/next.config.ts`) proxies them to Render behind the
> scenes. That's also why the httpOnly refresh-token cookie works correctly
> without any cross-site cookie configuration.

---

## 5. Verify it actually works

1. Open your Vercel URL, register an account, confirm login works.
2. Create a portfolio, add a transaction, confirm live prices load (proves
   Vercel → Render → Neon + Yahoo Finance are all connected correctly).
3. Create a price alert, and note that Render will be "asleep" if you've
   been idle — the first request after idle time takes ~30–50s while it
   wakes up. That's expected on the free tier, not a bug.

---

## Redeploying after future code changes

Both Vercel and Render auto-redeploy on every `git push` to `main` — that's
the entire point of connecting them to GitHub instead of uploading
manually. Just:

```bash
git add -A
git commit -m "your change"
git push
```

Both platforms pick it up within seconds and rebuild automatically.
