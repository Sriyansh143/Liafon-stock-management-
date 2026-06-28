# Liafon Stock Management

> A complete auto spare-parts shop management system — inventory, sales,
> purchases, multi-currency, role-based auth, daily auto-backups,
> WhatsApp department alerts, customer/supplier directory, audit log,
> print-ready invoices, CSV exports and PWA install. Built with Next.js 16,
> React 19, Prisma, and shadcn/ui.

---

## ✨ Highlights

- **🔐 Secure auth** — bcrypt-hashed passwords, HttpOnly + SameSite cookies,
  role-based access control (owner / admin / manager / staff), per-request
  session validation against the database.
- **⚡️ Race-free stock operations** — sales and purchases run inside Prisma
  `$transaction` blocks so stock can never go negative even under
  concurrent requests.
- **🧾 Auto-generated invoice numbers** — every sale gets a human-readable
  invoice number like `INV-20260620-28374`, printable as a polished
  A5 receipt (HTML → browser print → save as PDF).
- **📊 Activity audit log** — every login, logout, create, update, delete,
  backup, restore and import is recorded with user, IP, timestamp, and
  metadata. Filterable from the new Activity Log page.
- **👥 Customer & supplier directory** — separate models + APIs for
  customers and suppliers with phone, email, address, GST number (for
  suppliers). Seeded with 5 demo records each.
- **📥 CSV exports** — export the current sales or inventory view to CSV
  with one click (UTF-8 BOM included so Excel opens it correctly).
- **🛡️ Input validation everywhere** — Zod schemas on every POST/PUT/DELETE
  route. Friendly error messages instead of opaque 500s.
- **🎨 Polished UX** — light/dark/system theme, `⌘K` command palette,
  keyboard shortcuts (press `1`–`9` to jump pages, `N` to add a part),
  animated transitions, optimistic UI, focus-trapped dialogs, and
  reduced-motion friendly skeletons.
- **📦 Portable backups** — daily auto-backup to `./backups` (JSON + Excel),
  missed-backup detection on next startup, transactional restore.
- **💬 WhatsApp integration** — share a sale / purchase / low-stock alert
  with a single click to any department. Auto-falls back to `wa.me` deep
  links if OpenWA isn't configured.
- **🌐 Multi-currency** — 20+ currencies (INR, USD, EUR, GBP, AED, SAR, JPY,
  CNY, KWD, QAR, OMR, BHD, PKR, BDT, LKR, NPR, MYR, SGD, THB, AUD).
- **📈 Inventory valuation dashboard** — see total stock units, cost value,
  retail value, and potential profit at a glance.
- **📱 PWA installable** — manifest + theme-color + Apple touch icon. Add
  to home screen and run as a standalone app. Deep links like
  `/?page=sales&action=new` jump straight into a New Sale dialog.
- **🖨️ Print-ready** — sales invoices and reports render cleanly when printed.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18.18+** (or **Bun** 1.1+ for faster installs)
- **SQLite** — bundled, no separate install needed

### Install & Run (dev)

```bash
# 1. Install dependencies
npm install        # or: bun install

# 2. Configure environment
cp .env.example .env
# Edit .env to set DATABASE_URL, DEFAULT_CURRENCY, etc.

# 3. Initialize the database
npx prisma db push     # creates the SQLite DB + tables
# (Optional) seed sample data + mock users
curl -X POST http://localhost:3000/api/seed   # after starting the server

# 4. Start the dev server
npm run dev
# → http://localhost:3000
```

### Production Build

```bash
npm install
npm run build
npm start
# → http://localhost:3000
```

Or use the bundled start scripts:

```bash
# Linux / macOS
./start.sh

# Windows
start.bat
```

The script auto-installs dependencies, creates `.env` from `.env.example`,
runs the build if needed, and starts the standalone server.

---

## 🔑 Default Login Credentials

After running `curl -X POST http://localhost:3000/api/seed` (or clicking
**Load Data** in the header on first run), these demo accounts are available:

| Role    | Email                | Password     | Access |
|---------|----------------------|--------------|--------|
| Owner   | owner@liafon.com     | owner123     | All pages + user management |
| Admin   | admin@liafon.com     | admin123     | All pages except user management |
| Manager | manager@liafon.com   | manager123   | Dashboard, inventory, sales, purchases, reports |
| Staff   | user@liafon.com      | user123      | Dashboard, inventory, sales |

> ⚠️ Change these passwords immediately in production via the Users page
> (Owner only).

---

## 🆕 First-Run Setup (Fresh Database)

If you start with an empty database (no users yet), the login screen
automatically switches to **Setup Mode** and shows a "Create Owner
Account" form. This breaks the chicken-and-egg problem where you can't
login (no users) and can't register (registration normally requires
owner auth).

**Setup flow:**
1. Open the app for the first time → login page detects `firstRun: true`
   via `GET /api/setup`
2. Fill in your name, email, and password → click **Create Owner Account**
3. The first user is automatically promoted to **owner** role regardless
   of what role was selected (security: only the first registration is
   unauthenticated; subsequent registrations require owner auth)
4. After creation, you're auto-signed-in and redirected to the dashboard
5. If the database has users but no parts, a **Load Demo Data** button
   appears on the login screen — click it to seed 20 sample parts, 5
   departments, 5 customers, and 5 suppliers

The setup endpoint is locked out as soon as the first user exists, so
it cannot be abused to create unauthorized admin accounts later.

---

## 🗂️ Project Structure

```
liafon-stock-management/
├── prisma/
│   └── schema.prisma          # DB models: User, SparePart, Sale, Purchase,
│                              # StockLog, Department, Customer, Supplier,
│                              # ActivityLog, AppSetting
├── src/
│   ├── app/
│   │   ├── api/               # REST API routes (all auth-guarded, Zod-validated)
│   │   │   ├── auth/          # Login / logout / session check
│   │   │   ├── parts/         # CRUD for spare parts
│   │   │   ├── sales/         # Sales (atomic $transaction + invoice #)
│   │   │   ├── purchases/     # Purchases (atomic $transaction)
│   │   │   ├── stock/         # Dashboard summary + stock adjustments
│   │   │   ├── reports/       # Daily / category / profit reports
│   │   │   ├── departments/   # WhatsApp departments CRUD
│   │   │   ├── customers/     # Customer directory CRUD
│   │   │   ├── suppliers/     # Supplier directory CRUD (manager+)
│   │   │   ├── activity/      # Audit log query (admin+)
│   │   │   ├── users/         # User management (owner only)
│   │   │   ├── backup/        # JSON + Excel backup & restore
│   │   │   ├── import/        # Excel/CSV import (admin+)
│   │   │   ├── seed/          # Demo data seeding (owner only, after first run)
│   │   │   └── whatsapp/      # WhatsApp send + OpenWA status
│   │   ├── globals.css        # Tailwind + theme tokens
│   │   ├── layout.tsx         # Root layout + ThemeProvider + manifest + Toaster
│   │   ├── loading.tsx        # Route-level loading skeleton
│   │   ├── not-found.tsx      # 404 page
│   │   ├── global-error.tsx   # Global error boundary
│   │   └── page.tsx           # Home page (renders <HomePage/>)
│   ├── components/
│   │   ├── ui/                # shadcn/ui primitives
│   │   ├── pages/             # One file per app page (dashboard, inventory,
│   │   │                      # sales, purchases, departments, reports,
│   │   │                      # activity, settings, users)
│   │   ├── home-page.tsx      # App shell: sidebar, header, theme toggle, command palette
│   │   ├── login-page.tsx     # Login form with quick-demo login
│   │   ├── command-palette.tsx# ⌘K palette: navigation, actions, theme, account
│   │   ├── theme-provider.tsx # next-themes wrapper
│   │   ├── theme-toggle.tsx   # Light / Dark / System dropdown
│   │   └── error-boundary.tsx # React error boundary with reset button
│   ├── hooks/
│   │   ├── use-fetch.ts       # useFetch (cache + dedup + retry) + useMutation + useDebounce
│   │   ├── use-mobile.ts
│   │   └── use-toast.ts
│   ├── lib/
│   │   ├── auth.ts            # bcrypt, session cookies, requireAuth/requireRole
│   │   ├── api-utils.ts       # guardAuth / guardOwner / guardAdmin / guardManager helpers
│   │   ├── validations.ts     # Zod schemas for every API endpoint
│   │   ├── activity.ts        # Activity logger + IP helper
│   │   ├── print.ts           # Invoice print + CSV / JSON export utilities
│   │   ├── db.ts              # Prisma singleton with graceful disconnect
│   │   ├── currency.ts        # 20+ currency formatter
│   │   ├── whatsapp.ts        # wa.me URL builder + message templates
│   │   └── utils.ts           # cn() class merger
│   └── store/
│       └── app-store.ts       # Zustand store: active page, sidebar, user, currency
├── public/
│   ├── logo.svg               # App logo (also used as PWA icon)
│   ├── manifest.json          # PWA manifest with shortcuts
│   └── robots.txt
├── backups/                   # JSON + Excel backups (auto-created)
├── data/                      # SQLite DB (auto-created)
├── installer/
│   └── install.ps1            # Windows one-click installer (Node + Bun + service)
├── scripts/
│   ├── build-package.sh       # Build distributable zip
│   └── package.sh
├── .env.example               # Copy to .env and edit
├── next.config.ts
├── package.json
├── prisma/schema.prisma
├── start.sh                   # Linux/macOS quick-start script
├── start.bat                  # Windows quick-start script
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🎹 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open command palette |
| `1` – `9` | Jump to Nth sidebar page |
| `N` | Add new part (when on Inventory) |
| `/` | Focus the search box on the current page |
| `Esc` | Close dialog / command palette |

## 🔗 Deep Links

The app supports URL deep links for direct navigation and actions:

- `/?page=sales` — jump straight to the Sales page
- `/?page=inventory` — jump straight to the Inventory page
- `/?page=sales&action=new` — open the New Sale dialog on load
- `/?page=inventory&action=new` — open the Add Part dialog on load
- `/?login=1` — force the login screen (clears the session)

These power the PWA shortcuts (long-press the home-screen icon on mobile)
and external integrations.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript 5 (strict) |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Radix UI, Framer Motion |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| State | Zustand + TanStack Query |
| Database | Prisma + SQLite (default) — switchable to Postgres/MySQL |
| Auth | bcryptjs + HttpOnly session cookies |
| Excel | SheetJS (xlsx) |
| Icons | Lucide React |
| Fonts | Geist Sans / Geist Mono |

---

## 🔧 Configuration

All configuration lives in `.env`. See `.env.example` for the full reference.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./data/liafon.db` | Prisma connection string |
| `DEFAULT_CURRENCY` | `INR` | Default currency for new parts |
| `BACKUP_DIR` | `./backups` | Where backups are written |
| `DAILY_BACKUP_HOUR` | `23` | Local hour for auto-backup |
| `OPENWA_API_URL` | _(empty)_ | Optional OpenWA server URL |
| `OPENWA_API_KEY` | _(empty)_ | Optional OpenWA API key |
| `OPENWA_SESSION` | `default` | OpenWA session name |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | `production` enables Secure cookies |

---

## 📊 Database Schema

```prisma
model User         { id, name, email, password, role, isActive, lastLogin, createdAt, updatedAt, activityLogs[] }
model SparePart    { id, partNumber, name, category, brand, vehicleModel, description, costPrice,
                     sellingPrice, currentStock, minStockLevel, location, isActive, currency,
                     barcode, createdAt, updatedAt, sales[], purchases[], stockLogs[] }
model Department   { id, name, phone, role, email, isActive, createdAt, updatedAt }
model Customer     { id, name, phone, email, address, notes, isActive, createdAt, updatedAt, sales[] }
model Supplier     { id, name, phone, email, address, gstNumber, notes, isActive, createdAt, updatedAt, purchases[] }
model Sale         { id, partId, quantity, unitPrice, totalPrice, customerName, customerPhone,
                     notes, currency, invoiceNumber, date, createdAt, part, customerId?, customer? }
model Purchase     { id, partId, quantity, unitCost, totalCost, supplierName, supplierPhone,
                     notes, currency, invoiceNumber, date, createdAt, part, supplierId?, supplier? }
model StockLog     { id, partId, type, quantity, previousStock, newStock, referenceId,
                     notes, date, createdAt, part }
model ActivityLog  { id, userId?, action, entityType, entityId, summary, metadata, ipAddress,
                     createdAt, user? }
model AppSetting   { id, key, value, updatedAt }
```

---

## 🔄 Backups & Restore

1. **Automatic**: every day at `DAILY_BACKUP_HOUR`, a full JSON backup is
   written to `BACKUP_DIR`. If the system was off at that hour, the next
   time someone hits the Settings page the missed backup fires immediately.
2. **Manual**: open **Settings → Backup** and click **Create Backup**.
   Choose `full`, `inventory`, `sales`, or `purchases`.
3. **Restore**: from the same page, pick a previous backup file and click
   **Restore**. The restore runs inside a Prisma transaction — if anything
   fails, the database is rolled back to its previous state.
4. **Excel export**: every full / inventory backup also produces an
   `.xlsx` file with the inventory sheet (and a sales sheet for full backups).

---

## 💬 WhatsApp Setup (optional)

The app can send messages directly via an OpenWA server, or fall back to
`wa.me` deep links (which open WhatsApp Web with the message pre-filled).

### OpenWA Setup

```bash
# 1. Run OpenWA via Docker
git clone https://github.com/openwa/openwa
cd openwa
docker compose -f docker-compose.dev.yml up -d

# 2. Scan the QR at http://localhost:2785

# 3. Copy the API key into your .env
OPENWA_API_URL=http://localhost:2785/api
OPENWA_API_KEY=your-api-key-here
OPENWA_SESSION=default
```

Without OpenWA configured, clicking the WhatsApp icon next to a sale still
opens WhatsApp Web with the formatted message — the user just has to hit
"Send" manually.

---

## 🧪 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build (output: `.next/standalone`) |
| `npm start` | Start the standalone production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run db:push` | Push schema changes to the database |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create + apply a new migration |
| `npm run db:reset` | Drop & recreate the database (destructive!) |

---

## 🛡️ Security Notes

- Passwords are hashed with **bcrypt** (10 rounds). Legacy SHA-256 hashes
  from older installs are transparently upgraded on the next successful
  login.
- Session cookies are `HttpOnly` + `SameSite=Lax` (+ `Secure` in
  production / HTTPS).
- Every API route verifies the session cookie **against the database** on
  each request, so deactivated users or role changes take effect
  immediately — no stale sessions.
- Role-based access control is enforced on every route via the
  `guardAuth` / `guardManager` / `guardAdmin` / `guardOwner` helpers.
- Backups filenames are validated against a strict regex before restore
  to prevent path traversal.
- File uploads are capped at 5 MB and the file type is checked.
- **`xlsx`** is installed from the official SheetJS CDN
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) — the npm
  registry version is unmaintained and has known vulnerabilities. This
  keeps `npm audit` clean.
- A `postcss` override forces `>=8.5.10` to silence the bundled-postcss
  XSS advisory that ships with Next.js's dev tooling.

---

## 🧯 Troubleshooting

### Login screen takes a long time to appear
On the very first dev-server request, Turbopack needs to compile the
entire bundle (~10–15 s). Subsequent loads are instant. If you're
accessing the dev server from another device on your LAN, add the host
to `allowedDevOrigins` in `next.config.ts` (it already includes
private-network ranges by default).

### `npm audit` shows vulnerabilities
The project ships with `overrides.postcss` to force `>=8.5.10` and
installs `xlsx` from the SheetJS CDN instead of the unmaintained npm
package. After `npm install` you should see `found 0 vulnerabilities`.
If you still see warnings, run `npm audit` to inspect — anything left is
typically a Next.js bundled dev-only dependency that doesn't ship to
production.

### `Next.js inferred your workspace root` warning
This happens when there's another lockfile in a parent directory (e.g.
`C:\Users\You\bun.lock`). The `next.config.ts` already sets
`turbopack.root: __dirname` to silence this. If you still see it, delete
the stray parent lockfile.

### Cross-origin HMR blocked (e.g. `192.168.x.x`)
The dev server only allows HMR from `localhost` by default. The included
`next.config.ts` adds `allowedDevOrigins` for the private-network ranges
(`10.x`, `172.16–31.x`, `192.168.x`). Add your specific host if needed.

### 404 for `/icon-192.png` / `/icon-512.png`
Older versions of the manifest referenced PNG icons that weren't bundled.
The current `manifest.json` only references `/logo.svg` (with
`"sizes": "any"`), which is crisp at any resolution.

### Database reset
To start fresh: stop the server, delete `data/liafon.db`, then run
`npx prisma db push`. On next owner login the demo data will be re-seeded.

### "Network error. Please try again." on login
This message appears when the `/api/auth` request fails or returns a
non-JSON response. Common causes:
- **First install with empty database**: the demo users haven't been
  seeded yet. The login page should auto-detect this and show a
  "Create Owner Account" setup form. If it doesn't, visit
  `http://localhost:3000/api/setup` to check the first-run status.
- **Dev server not running**: confirm `npm run dev` is still running
  and the console shows `Ready in Xms`.
- **Database not initialized**: run `npx prisma db push` to create
  the SQLite database and tables.
- **Prisma client not generated**: run `npx prisma generate` then
  restart the dev server.
- **Server-side error**: check the dev server console — the actual
  error message will be printed there. The login form now shows the
  HTTP status code in the error message to help diagnose.

### Where is the register button?
There is no public registration. The first user creates themselves via
the **First-Run Setup** flow (see above). After that, only the owner can
add new users from the **Users** page (sidebar → Users → Add User).

### Accessing from another device on the LAN (e.g. phone)
The dev script (`npm run dev`) already binds to `0.0.0.0` and the
`next.config.ts` includes `allowedDevOrigins` for all private network
ranges. So you can access the app from any device on the same Wi-Fi:

1. Find your computer's LAN IP (e.g. `192.168.29.209`)
2. From your phone, open `http://192.168.29.209:3000`
3. If HMR is blocked, set `LIAFON_DEV_ORIGIN=192.168.29.209` in `.env`
   and restart the dev server.

For production, the standalone server (`npm start`) also binds to
`0.0.0.0` via the `HOSTNAME` env var in `.env.example`.

### White page after creating owner
This was caused by a Next.js 16 + Turbopack bug with `global-error.tsx`
importing app components, which slowed every request to 30–90 seconds
and caused the auth check to time out. Fixed in v3.3 by removing
`global-error.tsx` entirely (Next.js has built-in error handling) and
in v3.4 by increasing the auth fetch timeout to 60s and the loading
screen's "slow" threshold to 30s. If you still see a white page:

1. Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. Check the dev server console for errors
3. Open browser DevTools → Console tab for client-side errors
4. Delete `.next` folder and restart `npm run dev`

### "Could not find the module ... global-error.tsx" error
This was a bug in v3.0–v3.2 where `global-error.tsx` imported app
components, triggering a React Server Components manifest error.
Fixed in v3.3+ by removing the file. If you're upgrading from an
older version, delete `src/app/global-error.tsx` and the `.next`
folder, then restart the dev server.

---

## 📦 Packaging for Distribution

```bash
./scripts/build-package.sh
# → produces liafon-stock-management-<version>.zip in dist/
# (without node_modules — recipients run `npm install` themselves)
```

---

## 🤝 Credits

Built by **Liafon Software**. Powered by Next.js, Prisma, shadcn/ui, and
the open-source community.
