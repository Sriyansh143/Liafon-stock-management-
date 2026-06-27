# Architecture

Codebase structure, data flow, and security model.

---

## Directory structure

```
liafon-vercel/
├── docs/                    ← All documentation (this file lives here)
│   ├── PROJECT_REPORT.md    ← High-level overview
│   ├── INSTALL.md           ← Step-by-step deployment
│   ├── FEATURES.md          ← Feature reference
│   ├── API.md               ← API endpoint reference
│   ├── ARCHITECTURE.md      ← This file
│   └── ROADMAP.md           ← What's planned + out of scope
├── prisma/
│   └── schema.prisma        ← Database schema (PostgreSQL)
├── public/                  ← Static assets (icons, manifest)
├── scripts/
│   ├── baileys-server.js    ← External WhatsApp gateway (for Vercel)
│   ├── voice-gateway.js     ← External voice gateway (for Vercel)
│   ├── generate-icons.js    ← PWA icon generator
│   └── manage-license.js    ← CLI license manager
├── src/
│   ├── app/                 ← Next.js App Router
│   │   ├── api/             ← All API routes (route handlers)
│   │   ├── layout.tsx       ← Root layout
│   │   ├── page.tsx         ← Home page (renders Home component)
│   │   ├── globals.css      ← Tailwind globals
│   │   ├── loading.tsx      ← Loading skeleton
│   │   └── not-found.tsx    ← 404 page
│   ├── components/
│   │   ├── pages/           ← Page-level components (dashboard, inventory, etc.)
│   │   ├── phase4/          ← New UI components (analysis, UPI, 2FA, WhatsApp)
│   │   ├── ui/              ← shadcn/ui primitives (Button, Card, Dialog, etc.)
│   │   ├── home-page.tsx    ← Main app shell (nav + page router)
│   │   ├── login-page.tsx   ← Login + first-run setup
│   │   ├── license-lock-screen.tsx
│   │   ├── notifications-bell.tsx
│   │   ├── command-palette.tsx
│   │   ├── theme-provider.tsx + theme-toggle.tsx
│   │   └── error-boundary.tsx
│   ├── hooks/
│   │   ├── use-fetch.ts     ← Fetch wrapper with timeout
│   │   ├── use-toast.ts     ← Toast notifications
│   │   ├── use-license-check.ts
│   │   ├── use-mobile.ts
│   │   └── use-session-expiry.ts
│   ├── lib/                 ← Business logic (framework-agnostic)
│   │   ├── db.ts            ← Prisma client (singleton, Supabase-aware)
│   │   ├── auth.ts          ← Session + password + role helpers
│   │   ├── api-utils.ts     ← Error helpers + guards + retry
│   │   ├── activity.ts      ← Activity log + IP extraction
│   │   ├── audit-retention.ts
│   │   ├── gst.ts           ← Indian GST calculation
│   │   ├── upi.ts           ← UPI QR generation + decoding
│   │   ├── product-analysis.ts  ← Restock recommendation engine
│   │   ├── totp.ts          ← 2FA TOTP
│   │   ├── baileys-whatsapp.ts  ← Free WhatsApp
│   │   ├── voice-call.ts    ← FreeSWITCH/Jitsi
│   │   ├── barcode.ts       ← bwip-js wrapper
│   │   ├── pdf.ts           ← PDF report generation
│   │   ├── email.ts         ← SMTP (generic + Gmail fallback)
│   │   ├── supabase-storage.ts  ← Backup persistence
│   │   ├── redis-rate-limit.ts  ← Distributed rate limiting
│   │   ├── rate-limit.ts    ← In-memory rate limiting (fallback)
│   │   ├── inventory-digest.ts  ← Daily low-stock + expiry alerts
│   │   ├── permissions.ts   ← Customization types
│   │   ├── plan-limits.ts   ← License tier limits
│   │   ├── currency.ts      ← Multi-currency helpers
│   │   ├── print.ts         ← Print helpers
│   │   ├── screenshot.ts    ← html2canvas wrapper
│   │   ├── seed.ts          ← Demo data seeder
│   │   ├── utils.ts         ← cn() + formatCurrency + debounce + safeJsonParse
│   │   ├── validations.ts   ← Zod schemas (DRY helpers)
│   │   ├── whatsapp.ts      ← Legacy OpenWA wrapper (deprecated)
│   │   └── app-bundle.ts    ← License bundling
│   └── store/
│       └── app-store.ts     ← Zustand store (active page, user, currency)
├── .env.example             ← All env vars documented
├── .gitignore
├── components.json          ← shadcn/ui config
├── eslint.config.mjs
├── next-env.d.ts            ← Next.js type declarations
├── next.config.ts           ← Next.js config (Vercel-aware)
├── package.json
├── postcss.config.mjs
├── README.md                ← Short project intro
├── server.js                ← Self-hosted standalone server (ignored on Vercel)
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json              ← Vercel config (crons, regions, function timeouts)
```

---

## Data flow

### Request lifecycle (Vercel serverless)

```
Browser
  ↓ HTTPS request
Vercel Edge Network
  ↓ Routes to serverless function
Next.js App Router (route.ts)
  ↓
guardAuth / guardAdmin / guardOwner (src/lib/api-utils.ts)
  ↓ Reads session cookie
getSessionUser (src/lib/auth.ts)
  ↓ Verifies against DB
Prisma Client (src/lib/db.ts)
  ↓ Connection via PgBouncer (port 6543)
Supabase PostgreSQL
  ↓ Returns rows
Route handler builds response
  ↓
JSON / PDF / redirect (to Supabase Storage signed URL)
  ↓
Vercel Edge → Browser
```

### Database connection (Supabase + PgBouncer)

```
DATABASE_URL (port 6543, ?pgbouncer=true)  ← Runtime API routes
DIRECT_URL   (port 5432)                    ← Prisma migrations only
```

- Each Vercel serverless function gets its own Prisma client instance
- PgBouncer pools the actual Postgres connections (max 200 on Supabase free)
- `connection_limit=1` per Prisma client prevents pool exhaustion
- `prepare=false` avoids prepared-statement conflicts across PgBouncer transactions

### Daily cron flow

```
Vercel Cron (23:00 UTC)
  ↓
GET /api/cron/backup?secret=<CRON_SECRET>
  ↓
1. For each owner: handleBackupCronInternal('full')
     → Write to /tmp/liafon-backups/  (Vercel ephemeral)
     → Upload to Supabase Storage     (persistent)
     → Update AppSetting 'last_backup'
2. runAuditRetention()
     → Delete activity logs older than AUDIT_RETENTION_DAYS
3. sendDailyDigests()
     → For each owner: find low-stock parts + near-expiry batches
     → Try WhatsApp (if connected) → fall back to email
  ↓
Log summary to ActivityLog
```

---

## Security model

### Authentication
- Passwords hashed with bcrypt-12 (OWASP 2023 minimum)
- Legacy SHA-256 hashes auto-upgrade on next successful login
- Session cookies: `HttpOnly` + `SameSite=Lax` + `Secure` (on HTTPS)
- 7-day expiry, with `iat` timestamp for password-change invalidation
- 2FA TOTP (RFC 6238) optional per user, with 8 backup codes (SHA-256 hashed)

### Authorization
- 4 roles: `owner`, `admin`, `manager`, `user`
- Page-level access: hardcoded in `ROLE_ACCESS` (src/lib/auth.ts + src/store/app-store.ts)
- Field-level access: owner-configurable via `/api/customization` (e.g. hide `costPrice` from staff)
- Multi-tenant: `ownerId` on every table; every query filtered by `user.ownerId`
- Multi-shop: `User.shopId` filters staff to their shop's data (owner/admin see all)

### Rate limiting (2-tier)
- Tier 1: in-memory `Map` (per-instance, fast, no network)
- Tier 2: Upstash Redis (cross-instance, catches distributed attacks)
- Login: 10 attempts per 5-min window per IP+email
- Falls back to in-memory only if Redis not configured (logged warning)

### Audit log (tamper-evident)
- Every mutation logged with: user, action, entity, summary, metadata, IP
- Each log entry has a `logHash` (SHA-256 of previous hash + content + secret pepper)
- Deleting or modifying a log entry breaks the chain — detectable on audit
- Auto-cleanup after `AUDIT_RETENTION_DAYS` (default 365)

### Path traversal protection
- Backup filenames validated against strict regex: `^backup_[a-z]+_\d{4}-\d{2}-\d{2}T...\.json$`
- `path.basename()` applied before any filesystem operation
- Rejects `../`, absolute paths, and any non-matching filename

### Input validation
- All API routes use Zod schemas (`src/lib/validations.ts`)
- DRY helpers (`stringSchema`, `positiveNumber`, etc.) ensure consistent validation
- File uploads capped at `IMPORT_MAX_MB` (default 5 MB; Vercel Hobby caps at 4.5 MB)
- Row imports capped at 10,000 per request

---

## Multi-tenant model

Every table has `ownerId` (default `""` for legacy compatibility). The `SessionUser` always carries `ownerId`, and every Prisma query filters by it:

```ts
const parts = await db.sparePart.findMany({
  where: { ownerId: user.ownerId, ... }
})
```

This means:
- Owner A's data is invisible to Owner B (even if both share the same Supabase project)
- The `ownerId` is set from the session cookie, never from the request body
- New records get `ownerId` from `user.ownerId` (set by `requireAuth`)

### Multi-shop within a tenant
- `shopId` is optional on most tables
- `User.shopId` assigns staff to a specific shop
- API routes filter: `where: { ownerId: user.ownerId, ...(user.shopId ? { shopId: user.shopId } : {}) }`
- Owner/admin (no `shopId`) see all shops

---

## Deployment modes

### Mode A: Vercel (recommended for most users)
- Vercel hosts the Next.js app
- Supabase hosts PostgreSQL + Storage
- Upstash hosts Redis (rate limiting)
- Railway/Render hosts the Baileys WhatsApp gateway (separate small Node.js process)
- VPS hosts the FreeSWITCH voice gateway (optional, only if voice needed)
- Vercel Cron triggers daily backups + digests

### Mode B: Self-hosted (VPS)
- `node server.js` runs the Next.js standalone server
- Same Supabase + Upstash + Railway dependencies
- Baileys runs in-process (no separate gateway needed)
- Use a process manager (PM2 / systemd) for uptime
- Set up your own cron via `crontab -e`

The codebase auto-detects mode via `process.env.VERCEL`:
- `VERCEL=1` → use `/tmp` for backups, route WhatsApp through external gateway
- otherwise → use `BACKUP_DIR` env var, run Baileys in-process

---

## Build pipeline

```
npm install
  ↓ triggers postinstall: prisma generate
npm run build
  ↓ runs: prisma generate && next build
  ↓ Next.js 16 Turbopack compiles
  ↓ TypeScript strict type-check
  ↓ Static page generation (46 pages)
  ↓ Output to .next/
```

On Vercel:
- `postinstall` runs after `npm install`
- `next build` runs as the build command
- Each API route becomes a serverless function (max 60s on Hobby, 300s on Pro)
- Static pages served from Vercel's CDN edge

---

## Performance characteristics

- **Cold start**: ~500ms (Prisma client init + Supabase pooler handshake)
- **Warm request**: ~50-150ms (typical API route with 1 DB query)
- **Cursor pagination**: O(1) on Postgres (vs O(N) for OFFSET)
- **Bulk import**: 10,000 rows in ~30s (batched in 500-row chunks)
- **PDF report**: ~1-3s for 100-invoice GSTR-1
- **Daily cron**: ~30-120s per owner (depends on data volume + backup size)

---

## Error handling

- Every API route wrapped in `try/catch`
- Errors logged via `logApiError()` (single-line format for log aggregation)
- Internal error details NEVER returned to client (only generic message)
- Prisma error codes (`P2002` for unique violation, `P2034` for tx conflict) translated to user-friendly messages
- `withRetry()` for transient DB errors (P2034, P1001) with exponential backoff
