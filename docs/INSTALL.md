# Installation Guide

Complete step-by-step guide to deploy Liafon Stock Management on Vercel + Supabase (free tier). Total time: ~30 minutes.

---

## Prerequisites

- A GitHub account (free)
- A Supabase account (free — https://supabase.com)
- A Vercel account (free — https://vercel.com)
- Node.js 18.18+ installed locally (for one-time schema push)

---

## Step 1: Create the Supabase project

1. Sign in at https://supabase.com and click **New Project**
2. Pick a name (e.g. "liafon-prod")
3. Generate a strong database password — **save it somewhere safe** (Supabase won't show it again)
4. Pick a region close to your users:
   - **Mumbai (ap-south-1)** → Vercel `bom1` (best for India)
   - **Singapore (ap-southeast-1)** → Vercel `sin1`
   - **Frankfurt (eu-central-1)** → Vercel `fra1`
   - **Washington DC (us-east-1)** → Vercel `iad1`
5. Wait ~2 minutes for provisioning

### Get the connection strings

In Supabase: **Project Settings → Database → Connection string**

You need BOTH:

| Env var | Source | Port | Use |
|---|---|---|---|
| `DATABASE_URL` | "Transaction pooler" | **6543** | Runtime Prisma client (API routes) |
| `DIRECT_URL` | "Direct connection" | **5432** | Prisma migrations (`prisma db push`) |

Example values (replace `xxxxxx` and `PASSWORD`):
```
DATABASE_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&prepare=false
DIRECT_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

### Create the Storage bucket (for persistent backups)

1. Supabase dashboard → **Storage → New bucket**
   - Name: `liafon-backups`
   - Public: **NO** (contains customer data!)
   - File size limit: 50 MB
2. **Project Settings → API** → copy the **service_role** key (NOT anon)

---

## Step 2: Push code to GitHub

```bash
cd liafon-vercel
git init
git add -A
git commit -m "Liafon Stock Management v5.0"
git branch -M main
git remote add origin https://github.com/<your-username>/liafon.git
git push -u origin main
```

---

## Step 3: Apply schema to Supabase (one-time, run locally)

```bash
# Create .env locally — copy from .env.example and fill in DATABASE_URL + DIRECT_URL
cp .env.example .env
# Edit .env with your Supabase pooler + direct URLs

npm install
npx prisma db push
```

Verify in Supabase → **Table Editor**: you should see ~14 tables (`User`, `License`, `SparePart`, `Shop`, `Sale`, `Purchase`, `Batch`, `Payment`, `TaxRate`, `PurchaseOrder`, `StockTransfer`, `PartAlternative`, `ActivityLog`, `AppSetting`, etc.).

---

## Step 4: Connect Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Vercel auto-detects Next.js — keep defaults
4. **Before clicking Deploy**, expand "Environment Variables" and add ALL of these:

### Required env vars

| Key | Value | Environments |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.xxxxxx:PASSWORD@...supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&prepare=false` | Production, Preview, Development |
| `DIRECT_URL` | `postgresql://postgres.xxxxxx:PASSWORD@...supabase.com:5432/postgres` | Production, Preview, Development |
| `NODE_ENV` | `production` | Production only |
| `APP_BASE_URL` | `https://your-app.vercel.app` (use your Vercel domain) | Production |
| `LIAFON_DEV_KEY` | Output of `openssl rand -hex 32` (run locally) | Production, Preview |
| `ACTIVITY_LOG_PEPPER` | Output of `openssl rand -hex 32` | Production, Preview |
| `REGISTRATION_PEPPER` | Output of `openssl rand -hex 32` | Production, Preview |
| `CRON_SECRET` | Output of `openssl rand -hex 32` | Production |

### Required for persistent backups

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `ey...` (from Project Settings → API → service_role) |
| `SUPABASE_BUCKET_NAME` | `liafon-backups` |

### Required for distributed rate limiting (recommended)

1. Create a free Upstash Redis database: https://upstash.com
2. Copy the **REST URL** + **token** from the database dashboard

| Key | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | `https://xxxxxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | `xxxxxx` |

### Optional (email — pick Gmail OR generic SMTP)

**Option A: Gmail (legacy)**
| Key | Value |
|---|---|
| `GMAIL_USER` | `your-email@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-char Google App Password (https://myaccount.google.com/apppasswords) |

**Option B: Generic SMTP (recommended — works with any provider)**

| Key | Outlook | SendGrid | SES | Mailgun | Zoho |
|---|---|---|---|---|---|
| `SMTP_HOST` | smtp.office365.com | smtp.sendgrid.net | email-smtp.us-east-1.amazonaws.com | smtp.mailgun.org | smtp.zoho.com |
| `SMTP_PORT` | 587 | 587 | 587 | 587 | 465 |
| `SMTP_USER` | your@email.com | apikey | your-smtp-user | postmaster@your-domain | your@zoho.com |
| `SMTP_PASS` | your-password | SG.xxxxxx | your-smtp-pass | your-mailgun-key | your-password |
| `SMTP_SECURE` | false | false | false | false | true |

### Optional (WhatsApp — for Vercel)

WhatsApp on Vercel requires a separate Baileys gateway server (Vercel can't hold WebSockets). Free options: Railway / Render / Fly.io / your VPS.

1. Deploy `scripts/baileys-server.js` to Railway (free 500 hrs/month)
2. Set `BAILEYS_API_KEY` env var on Railway (run `openssl rand -hex 32`)
3. Add to Vercel:

| Key | Value |
|---|---|
| `BAILEYS_SERVER_URL` | `https://your-app.up.railway.app` |
| `BAILEYS_API_KEY` | (same key as Railway) |

### Optional (voice calls — for Vercel)

Same pattern as WhatsApp: deploy `scripts/voice-gateway.js` to a VPS with FreeSWITCH installed.

| Key | Value |
|---|---|
| `VOICE_GATEWAY_URL` | `https://your-vps.example.com:3001` |
| `VOICE_GATEWAY_API_KEY` | (your shared secret) |

### Optional (other)

| Key | Default | Purpose |
|---|---|---|
| `DEFAULT_CURRENCY` | `INR` | Default for new parts |
| `DAILY_BACKUP_HOUR` | `23` | Hour (0-23) for daily backup |
| `AUDIT_RETENTION_DAYS` | `365` | Days to keep activity logs |
| `EXPIRY_ALERT_DAYS` | `30` | Days before expiry to alert |
| `IMPORT_MAX_MB` | `5` | Max upload size for CSV import |
| `JITSI_SERVER_URL` | `https://meet.jit.si` | Self-hosted Jitsi (optional) |

5. Click **Deploy**. First build takes ~2-3 minutes.

---

## Step 5: Verify the deployment

1. Visit your Vercel URL (e.g. `https://liafon.vercel.app`)
2. You should see the login page with a "Create Owner Account" prompt (first-run state)
3. Create the owner account → dashboard loads
4. Test core flows:
   - Add a spare part → check it shows in inventory
   - Make a sale → check stock decrements + invoice generated
   - Run a backup → file uploaded to Supabase Storage
5. Visit `/api/cron/backup?secret=<your-cron-secret>` manually once to verify it works (should return JSON with backup count)

---

## Step 6: Pair WhatsApp (optional but recommended)

1. In the app: Settings → Connections → WhatsApp Pairing
2. Click "Show QR"
3. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
4. Scan the QR
5. Status changes to "Connected as +91XXXXXXXXXX"

Now you can send invoices + low-stock alerts via WhatsApp from the app.

---

## Troubleshooting

### `Error: prepared statement "s1" does not exist`
You're using a direct URL (port 5432) for `DATABASE_URL` instead of the pooler URL. Swap them. The pooler URL needs `?pgbouncer=true&connection_limit=1&prepare=false`.

### `Error: P1001: Can't reach database server at ...:5432`
You put the direct URL (port 5432) in `DATABASE_URL` instead of the pooler URL. Vercel serverless can't reliably reach Supabase's direct port — only the pooler.

### `Error: P1001: Can't reach database server at ...:6543`
Supabase free-tier project is paused (1 week of inactivity). Go to the Supabase dashboard and click "Restore". Consider upgrading to Supabase Pro ($25/mo) for always-on.

### Build fails with `@prisma/client did not initialize yet`
The `postinstall` script didn't run. Verify `package.json` has:
```json
"postinstall": "prisma generate || true"
```

### Login works locally but not on Vercel
Check `APP_BASE_URL` — password-reset links use it. If it's still `http://localhost:3000`, fix it to your Vercel URL.

Also check that cookies aren't being blocked: the app sets `HttpOnly; SameSite=Lax` cookies. On Vercel (HTTPS), the `Secure` flag is auto-added by the `isHttps()` helper via the `x-forwarded-proto` header.

### Backups disappear on Vercel
You haven't configured Supabase Storage. The `/api/backup` GET response will include `persistenceWarning` telling you to set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_NAME`.

### WhatsApp doesn't pair
On Vercel, you must run `scripts/baileys-server.js` on a separate VPS/Railway/Render. Set `BAILEYS_SERVER_URL` + `BAILEYS_API_KEY`. Without it, the QR code endpoint returns an error.

### Cron job doesn't run
Vercel Hobby only runs crons once per day. Check Vercel dashboard → Project → Cron Jobs to verify the schedule. The endpoint is `/api/cron/backup` and requires `?secret=<CRON_SECRET>`.

---

## Updating the schema after first deploy

When you change `prisma/schema.prisma`:

```bash
# Locally, with .env containing both DATABASE_URL and DIRECT_URL
npx prisma db push
git add -A
git commit -m "schema: <change>"
git push
```

Vercel will redeploy. The `postinstall` script regenerates the Prisma client automatically.

---

## Local development

```bash
cp .env.example .env
# Fill in DATABASE_URL + DIRECT_URL (you can use the same Supabase project for dev + prod)

npm install
npm run dev    # http://localhost:3000
```

The first user you create becomes the owner.

---

## Upgrading from v1-v4 (schema drift fix)

If you deployed an earlier version (v1, v2, v3, or v4) and you're now seeing errors like:

```
The column `StockLog.shopId` does not exist in the current database
The column `SparePart.shopId` does not exist in the current database
```

...your Supabase database has the OLD schema. The v5 code expects new columns (`shopId` on multiple tables) + new tables (`Shop`, `Batch`, `PurchaseOrder`, `StockTransfer`, `Payment`, `TaxRate`, `PartAlternative`) + new fields on `Sale` (GST, discount, payment tracking) + new fields on `User` (2FA, shopId) + new fields on `Customer` (creditLimit, gstNumber, state).

### Fix: Run the migration script

1. Open: https://supabase.com/dashboard/project/<your-project>/sql/new
2. Open the file `scripts/migrate-v1-to-v5.sql` from this repo
3. Copy the ENTIRE file contents, paste into the Supabase SQL Editor
4. Click **Run** (Ctrl+Enter)
5. Wait for "Success. No rows returned."
6. Restart your Next.js dev server (`Ctrl+C` then `npm run dev`)
7. Refresh your app — the column errors should be gone

### What the script does

- Creates 7 new tables: `Shop`, `Batch`, `PurchaseOrder`, `StockTransfer`, `Payment`, `TaxRate`, `PartAlternative`
- Adds the `shopId` column to: `SparePart`, `Sale`, `Purchase`, `StockLog`, `Customer`, `Supplier`
- Adds GST/discount/payment fields to `Sale`
- Adds 2FA + shopId fields to `User`
- Adds creditLimit/gstNumber/state to `Customer`
- Adds UPI fields to `Payment`
- Adds all foreign key constraints (idempotent — safe to re-run)
- Backfills existing sales as `paymentStatus: 'paid'` + `amountPaid: totalPrice`

The script is **idempotent** — uses `IF NOT EXISTS` everywhere, so re-running is safe.

### Verify the migration worked

After running, in Supabase SQL Editor:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

You should see ~21 tables including: `Shop`, `Batch`, `PurchaseOrder`, `StockTransfer`, `Payment`, `TaxRate`, `PartAlternative`.

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Sale' AND column_name IN ('shopId', 'taxRate', 'amountPaid', 'paymentStatus');
```

Should return 4 rows.
