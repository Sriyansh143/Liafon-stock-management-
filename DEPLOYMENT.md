# Deploying Liafon Stock Management to Vercel + Supabase

This guide walks you through deploying the app on **Vercel** (hosting) with **Supabase** (PostgreSQL database). It assumes you have already pushed the patched code to GitHub.

---

## 0. What was patched (summary)

The following files were modified to make the app Vercel + Supabase compatible. If you have local changes, merge carefully.

| File | Change | Why |
|---|---|---|
| `next.config.ts` | `output: "standalone"` is now conditional — skipped when `VERCEL=1` | Vercel uses zero-config serverless; `standalone` produces an unused directory that bloats deployments |
| `prisma/schema.prisma` | Added `directUrl = env("DIRECT_URL")` | Prisma migrations must bypass PgBouncer; runtime client uses the pooler URL |
| `package.json` | Added `postinstall: "prisma generate"` and `db:migrate:deploy`; `build` now runs `prisma generate && next build` | Vercel's build pipeline does NOT auto-run `prisma generate`; without this, `@prisma/client` is missing and the build fails |
| `src/lib/db.ts` | Auto-injects `?pgbouncer=true&connection_limit=1&prepare=false` if the URL is a Supabase pooler (port 6543) and missing the flags | Prevents the most common Vercel+Supabase footgun: prepared-statement leaks crash Prisma |
| `src/app/api/backup/route.ts` | Falls back to `/tmp/liafon-backups` when `VERCEL=1` | Vercel's filesystem is read-only except `/tmp` |
| `src/app/api/reset-database/route.ts` | Same `/tmp` fallback for backup deletion | Same reason |
| `.env.example` | Removed the SQLite default (schema is PG-only); clarified pooler vs direct URL | The previous example was misleading |
| `vercel.json` (new) | Explicit regions, 60s function timeout for API routes | Default Vercel Hobby is 10s — too short for backup/import |

---

## 1. Create the Supabase project

1. Sign in at https://supabase.com and create a new project.
2. Pick a region close to your users. Vercel + Supabase region pairings (lowest latency):
   - **Mumbai (ap-south-1)** → Vercel `bom1`
   - **Singapore (ap-southeast-1)** → Vercel `sin1`
   - **Frankfurt (eu-central-1)** → Vercel `fra1`
   - **Washington DC (us-east-1)** → Vercel `iad1`
3. Set a strong database password and **save it somewhere safe** — Supabase won't show it again.
4. Wait ~2 minutes for the project to provision.

---

## 2. Get the two connection strings

In Supabase: **Project Settings → Database → Connection string**

You need **both**:

| Env var | Source | Port | Use |
|---|---|---|---|
| `DATABASE_URL` | "Transaction pooler" / "Session pooler" | **6543** | Runtime Prisma client (used by API routes) |
| `DIRECT_URL` | "Direct connection" | **5432** | Prisma migrations (`prisma migrate deploy` at build time) |

They look like this (the `xxxxxx` is your project ref, `PASSWORD` is the DB password you set in step 1):

```bash
DATABASE_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&prepare=false
DIRECT_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

> **Tip:** If you forget the `?pgbouncer=true&connection_limit=1&prepare=false` query string on `DATABASE_URL`, the app auto-appends them and logs a warning. But set them explicitly to silence the warning.

---

## 3. Push the patched code to GitHub

```bash
# From the patched project root
git add -A
git commit -m "Vercel + Supabase compatibility patches"
git push origin main
```

---

## 4. Create the schema (one-time, run locally)

You only need to do this **once** per Supabase project. Run it from your local machine with the same env vars:

```bash
# Create a .env file locally (do NOT commit it)
cat > .env <<EOF
DATABASE_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&prepare=false
DIRECT_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
EOF

# Push the schema to Supabase
npm install
npx prisma db push
```

Verify in Supabase: **Table Editor** — you should see ~12 tables (`User`, `License`, `SparePart`, `Sale`, `Purchase`, etc.).

> **Why `db push` and not `migrate dev`?** The repo doesn't ship a `prisma/migrations/` directory, so `prisma migrate dev` would create one from scratch. `db push` is simpler for an initial deploy. Once live, switch to `prisma migrate dev` for schema changes so you get proper migration history.

---

## 5. Connect the GitHub repo to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repo (`Sriyansh143/Liafon-stock-management-for` — make sure it's set to **Public**, or grant Vercel private-repo access)
3. Vercel auto-detects Next.js — keep the defaults
4. **Before clicking Deploy**, expand "Environment Variables" and add **all** of these:

### Required env vars (Vercel → Settings → Environment Variables)

| Key | Value | Environments |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.xxxxxx:PASSWORD@...supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&prepare=false` | Production, Preview, Development |
| `DIRECT_URL` | `postgresql://postgres.xxxxxx:PASSWORD@...supabase.com:5432/postgres` | Production, Preview, Development |
| `NODE_ENV` | `production` | Production only |
| `APP_BASE_URL` | `https://your-app.vercel.app` (use your Vercel domain) | Production |
| `LIAFON_DEV_KEY` | Output of `openssl rand -hex 32` (run locally) | Production, Preview |
| `ACTIVITY_LOG_PEPPER` | Output of `openssl rand -hex 32` | Production, Preview |
| `REGISTRATION_PEPPER` | Output of `openssl rand -hex 32` | Production, Preview |

### Optional env vars (only if you use these features)

| Key | Value |
|---|---|
| `GMAIL_USER` | Your Gmail address (for password-reset emails) |
| `GMAIL_APP_PASSWORD` | 16-char Google App Password (https://myaccount.google.com/apppasswords) |
| `OPENWA_API_URL` | OpenWA server URL (only if you want automated WhatsApp) |
| `OPENWA_API_KEY` | OpenWA API key |
| `CLOUD_LICENSE_URL` | Your cloud license validator URL |
| `CLOUD_LICENSE_KEY` | Cloud license server key |
| `MAX_OWNERS_PER_IP` | `1` (default) |
| `DAILY_BACKUP_HOUR` | `23` (default — 11pm local time) |
| `IMPORT_MAX_MB` | `4.5` for Vercel Hobby, up to `50` for Pro |

5. Click **Deploy**. First build takes ~2-3 minutes.

---

## 6. Verify the deployment

1. Visit your Vercel URL (e.g. `https://liafon-stock-management.vercel.app`)
2. You should see the login page with a "Create Owner Account" prompt (first-run state)
3. Create the owner account → you'll be taken to the dashboard
4. Test core flows:
   - Add a spare part → check it shows in inventory
   - Make a sale → check stock decrements
   - Run a backup → it'll be saved to `/tmp/liafon-backups` (download it immediately — see "Important caveats" below)

If you see a `PrismaClientInitializationError`, double-check that:
- `DATABASE_URL` uses port **6543** with `?pgbouncer=true`
- `DIRECT_URL` uses port **5432** without `pgbouncer`
- The Supabase project isn't paused (free tier pauses after 1 week of inactivity)

---

## 7. Important caveats on Vercel

### 7.1 Backups are ephemeral

Vercel's filesystem is **read-only** except for `/tmp`, and `/tmp` is wiped when the serverless function's container is recycled (every few minutes of inactivity, or on every cold start).

**What this means in practice:**
- When you click "Create Backup" in Settings, the JSON + Excel files are written to `/tmp/liafon-backups`.
- You **must download them immediately** via the UI's download button. They will disappear on the next cold start.
- The "List Backups" page will show an empty list after a cold start.

**Recommended long-term fix:** Integrate with **Supabase Storage** or **Vercel Blob** for persistent backups. This is a TODO in the codebase — see `src/app/api/backup/route.ts` for the integration point.

### 7.2 In-memory rate limiter is per-instance

The login rate limiter (`src/lib/rate-limit.ts` and the one in `src/app/api/auth/route.ts`) uses an in-memory `Map`. On Vercel, each serverless function instance has its own memory, so a determined attacker could spread login attempts across multiple cold starts and bypass the limit.

**For a real production app:** swap the in-memory limiter for **Upstash Redis** (Vercel has a one-click integration). The relevant code is clearly marked in both files.

### 7.3 API route timeouts

Vercel Hobby plan caps function execution at **10 seconds** by default. The included `vercel.json` bumps this to **60 seconds** for `/api/*` routes (the Vercel max for Hobby). If you're on the Pro plan, you can go up to 300 seconds — change `maxDuration` in `vercel.json`.

Heavy operations that may exceed 60s:
- Full backup with 50k+ parts
- CSV/XLSX import with 10k+ rows (the code already batches to 500 to mitigate this)

### 7.4 `server.js`, `start.sh`, `Caddyfile`, `installer/` are unused

These files exist for self-hosted deployments (the `node server.js` standalone path). Vercel ignores them — Vercel uses Next.js's own serverless runtime. Safe to leave them in the repo; they don't affect the Vercel build.

### 7.5 Background jobs don't exist

Code that uses `setInterval` (in `rate-limit.ts` and `/api/auth/route.ts`) for periodic cleanup is **dead code on Vercel** — serverless functions don't have a long-running process. This is harmless but the cleanup never runs. The rate-limit entries simply vanish when the container is recycled.

The "daily backup at hour 23" feature also doesn't fire automatically on Vercel — there's no scheduler. To get this back, add a Vercel Cron Job that POSTs to `/api/backup` with a service token. See Vercel Cron docs: https://vercel.com/docs/cron-jobs

---

## 8. Updating the schema after first deploy

Once you've made changes to `prisma/schema.prisma`:

```bash
# Locally, with .env containing both DATABASE_URL and DIRECT_URL
npx prisma migrate dev --name your_change_name
git add prisma/migrations
git commit -m "schema: your_change_name"
git push
```

Vercel will redeploy. The build script runs `prisma generate` (via `postinstall`) but does **NOT** automatically run `prisma migrate deploy`. If you want migrations applied at build time, change `package.json`'s `build` script to:

```json
"build": "prisma generate && prisma migrate deploy && next build"
```

But be cautious — if a migration fails, the build fails, and your production deploy is blocked. Most teams prefer to run migrations manually via `npx prisma migrate deploy` from a CI step or local machine.

---

## 9. Troubleshooting

### `Error: prepared statement "s1" does not exist`

You're using a pooler URL without `pgbouncer=true&prepare=false`. Either:
- Add `?pgbouncer=true&connection_limit=1&prepare=false` to `DATABASE_URL` in Vercel, OR
- Let the app auto-patch it (it will, but logs a warning)

### `Error: Can't reach database server at ...:5432`

You put the direct URL (port 5432) in `DATABASE_URL` instead of the pooler URL. Swap them. Vercel serverless can't reliably reach Supabase's direct port — only the pooler.

### `Error: P1001: Can't reach database server at ...:6543`

Supabase free-tier project is paused (1 week of inactivity). Go to the Supabase dashboard and click "Restore". Consider upgrading to Supabase Pro ($25/mo) for always-on.

### `prisma migrate deploy` fails with `relation already exists`

You previously used `prisma db push` (step 4 above) which doesn't create migration history. Either:
- Continue using `prisma db push` for schema updates (simpler, no migration files), OR
- Run `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` to generate a baseline migration, then `prisma migrate resolve --applied <name>` to mark it as applied.

### Login works locally but not on Vercel

Check `APP_BASE_URL` — password-reset links use it. If it's still `http://localhost:3000`, fix it to your Vercel URL.

Also check that cookies aren't being blocked: the app sets `HttpOnly; SameSite=Lax` cookies. On Vercel (HTTPS), the `Secure` flag is auto-added by the `isHttps()` helper in `src/lib/auth.ts` via the `x-forwarded-proto` header.

### Build fails with `@prisma/client did not initialize yet`

The `postinstall` script didn't run. Verify `package.json` has:
```json
"postinstall": "prisma generate || true"
```
And that Vercel's install step uses `npm install` (not `npm ci --omit=dev`). The `|| true` is intentional — `prisma generate` fails harmlessly if `prisma/schema.prisma` isn't reachable.

---

## 10. Quick reference: env var checklist

```
DATABASE_URL           ✓ Supabase pooler URL (port 6543 + ?pgbouncer=true)
DIRECT_URL             ✓ Supabase direct URL (port 5432, no pgbouncer)
NODE_ENV               ✓ production
APP_BASE_URL           ✓ https://your-app.vercel.app
LIAFON_DEV_KEY         ✓ openssl rand -hex 32 (min 16 chars)
ACTIVITY_LOG_PEPPER    ✓ openssl rand -hex 32
REGISTRATION_PEPPER    ✓ openssl rand -hex 32
GMAIL_USER             (optional — for password reset emails)
GMAIL_APP_PASSWORD     (optional)
OPENWA_API_URL         (optional — for WhatsApp)
OPENWA_API_KEY         (optional)
```

---

## 11. File-by-file diff summary

For your reference when merging into your own branch:

```diff
# next.config.ts
- output: "standalone",
+ ...(isVercel ? {} : { output: "standalone" as const }),

# prisma/schema.prisma
  datasource db {
-   provider = "postgresql"
-   url      = env("DATABASE_URL")
+   provider  = "postgresql"
+   url       = env("DATABASE_URL")
+   directUrl = env("DIRECT_URL")
  }

# package.json
  "scripts": {
-   "build": "next build",
+   "build": "prisma generate && next build",
+   "postinstall": "prisma generate || true",
+   "db:migrate:deploy": "prisma migrate deploy",
    ...
  }

# src/lib/db.ts
+ function normalizeDatabaseUrl(url: string | undefined): string | undefined {
+   // auto-append pgbouncer=true, connection_limit=1, prepare=false
+   // for Supabase pooler URLs (port 6543)
+ }

# src/app/api/backup/route.ts
+ import os from 'os'
+ function getBackupDir(): string {
+   if (process.env.VERCEL === '1') {
+     return path.join(os.tmpdir(), 'liafon-backups')  // Vercel: /tmp
+   }
+   // self-hosted: BACKUP_DIR or ./backups as before
+ }

# src/app/api/reset-database/route.ts
+ import os from 'os'
+ const backupDir = process.env.VERCEL === '1'
+   ? path.join(os.tmpdir(), 'liafon-backups')
+   : (process.env.BACKUP_DIR || './backups')

# .env.example
- DATABASE_URL=file:./data/liafon.db   ← removed (schema is PG only)
+ DATABASE_URL=postgresql://postgres.xxxxxx:PASSWORD@...:6543/postgres?pgbouncer=true&connection_limit=1&prepare=false
+ DIRECT_URL=postgresql://postgres.xxxxxx:PASSWORD@...:5432/postgres

# vercel.json (new file)
+ { "framework": "nextjs", "regions": ["bom1"], "functions": { "src/app/api/**/route.ts": { "maxDuration": 60 } } }
```
