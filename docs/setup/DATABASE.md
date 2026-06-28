# Liafon Stock Management — Complete Reference

> **Version**: 3.8.0
> **Last updated**: 2026-06-21
> **Tech stack**: Next.js 16, React 19, Prisma, SQLite, Tailwind CSS 4, shadcn/ui

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Database](#database)
3. [User Accounts & Credentials](#user-accounts--credentials)
4. [Features](#features)
5. [API Endpoints](#api-endpoints)
6. [Environment Variables](#environment-variables)
7. [Third-Party Integrations](#third-party-integrations)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# 3. Initialize the database
npx prisma db push

# 4. Start the dev server
npm run dev
# → http://localhost:3000
```

On first visit, the login page will show a **"Create Owner Account"** form (since no users exist). Fill in your name, email, and password to create the first owner. After that, you'll be auto-signed-in.

To load demo data (sample parts, customers, suppliers, sales), click **"Load Data"** in the header (owner only), or use the **"Load Demo Data"** button on the login page.

---

## Database

- **Engine**: SQLite (default) — no separate install needed
- **Location**: `data/liafon.db` (auto-created on first `prisma db push`)
- **ORM**: Prisma 6.x
- **Schema file**: `prisma/schema.prisma`

### Tables

| Table | Purpose |
|-------|---------|
| `User` | User accounts (owner, admin, manager, user) |
| `SparePart` | Inventory items |
| `Sale` | Sales transactions |
| `Purchase` | Purchase transactions |
| `StockLog` | Stock movement audit trail |
| `Department` | WhatsApp department contacts |
| `Customer` | Customer directory |
| `Supplier` | Supplier directory |
| `ActivityLog` | Audit log of all actions |
| `AppSetting` | Key-value app settings |

### Resetting the Database

```bash
# Stop the server, then:
rm data/liafon.db
npx prisma db push
# Start the server again — first-run setup will appear
npm run dev
```

### Switching to PostgreSQL / MySQL

1. Edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"  // or "mysql"
     url      = env("DATABASE_URL")
   }
   ```
2. Update `.env`:
   ```
   DATABASE_URL=postgresql://user:pass@localhost:5432/liafon
   ```
3. Run `npx prisma db push`

---

## User Accounts & Credentials

### Role Hierarchy

| Role | Access Level |
|------|-------------|
| **Owner** | Everything + user management. Only ONE owner per installation. |
| **Admin** | Everything except user management. |
| **Manager** | Dashboard, inventory, sales, purchases, reports. |
| **User** (Staff) | Dashboard, inventory, sales only. |

### Demo Accounts (created by `/api/seed`)

These are created when the owner clicks **"Load Data"** or calls `/api/seed`. They use well-known weak passwords and should **never** be used in production.

| Role | Email | Password |
|------|-------|----------|
| Owner | `owner@liafon.com` | `owner123` |
| Admin | `admin@liafon.com` | `admin123` |
| Manager | `manager@liafon.com` | `manager123` |
| Staff | `user@liafon.com` | `user123` |

> **Note**: If you created your own owner account during first-run setup, the demo `owner@liafon.com` will NOT be created (to avoid having two owners). The other 3 demo accounts (admin, manager, staff) will still be created.

> **Note**: Demo users are only created in development mode (`NODE_ENV != production`). To override in production, set `LIAFON_ALLOW_MOCK_USERS_IN_PROD=1` (not recommended).

### Password Security

- Passwords are hashed with **bcrypt** (10 rounds)
- Legacy SHA-256 hashes are transparently upgraded to bcrypt on next login
- Minimum password length: 6 characters
- No maximum length restriction

### Changing Passwords

**Self-service** (any logged-in user):
1. Go to **Settings → Account** tab
2. Enter current password + new password + confirm
3. Click "Change Password"
4. You'll be signed out — sign in with the new password

**Owner resets for others**:
1. Sign in as Owner
2. Go to **Users** page
3. Click edit (pencil icon) on the user
4. Enter a new password in the password field (leave blank to keep current)
5. Click "Update User"

### Forgot Password

There is no email-based password reset (the app doesn't run an email server). Instead:

- **If you're not the owner**: Ask the owner to reset your password via the Users page.
- **If you ARE the owner and forgot your password**: You must reset the database:
  ```bash
  rm data/liafon.db
  npx prisma db push
  npm run dev
  # → First-run setup will appear, create a new owner account
  ```

### Registering a New Owner

Only ONE owner can exist per installation. The "Register as Owner" link on the login page:
- If no users exist → shows the first-run setup form
- If users exist → shows "An owner account is already registered. Only one owner can exist per installation."

---

## Features

### Core Features

| Feature | Description | Where |
|---------|-------------|-------|
| **Inventory Management** | CRUD for spare parts with stock levels, min-stock alerts, categories, brands, vehicle models | Sidebar → Inventory |
| **Sales** | Record sales with automatic stock decrement, invoice numbers, print receipts | Sidebar → Sales |
| **Purchases** | Record purchases with automatic stock increment, supplier linking | Sidebar → Purchases |
| **Dashboard** | KPIs, sales trend chart, category breakdown, top-selling parts, recent activity | Sidebar → Dashboard |
| **Reports** | Daily / Category / Profit / Low-stock reports with CSV export | Sidebar → Reports |
| **Activity Log** | Audit trail of every action (login, create, update, delete, backup, etc.) | Sidebar → Activity |
| **User Management** | Owner can create/edit/deactivate users | Sidebar → Users |
| **Settings** | Change password, Excel import, backup/restore, WhatsApp config | Sidebar → Settings |

### Inventory Features

- Search by name, part number, brand, vehicle model
- Filter by category
- Low-stock filter (compares `currentStock` vs `minStockLevel`)
- Stock adjustment dialog (manager+)
- CSV export
- Mobile card view
- Add/edit/delete with confirmation dialogs

### Sales Features

- Sequential invoice numbers (`INV-YYYYMMDD-NNNNN`)
- Atomic stock decrement (can't oversell)
- Print invoice (A5 format, GST/tax fields, amount-in-words)
- WhatsApp share to departments
- CSV export
- Date range filter
- Search by invoice number, customer, part

### Purchase Features

- Sequential invoice numbers (`PUR-YYYYMMDD-NNNNN`)
- Atomic stock increment
- Auto-updates part cost price
- WhatsApp share
- Date range filter

### Backup & Restore

- **Manual backup**: Settings → Backup → Create Backup (full / inventory / sales / purchases)
- **Auto-backup**: Daily at `DAILY_BACKUP_HOUR` (default 23:00)
- **Missed backup**: If the system was off at backup time, fires on next Settings page visit
- **Restore**: Transactional — if anything fails, DB rolls back
- **Excel export**: Full/inventory backups also produce `.xlsx` files
- **Delete**: Individual backups can be deleted (with confirmation)

### WhatsApp Integration

- **OpenWA** (optional): Send messages directly via API
- **wa.me fallback**: If OpenWA isn't configured, opens WhatsApp Web with pre-filled message
- **Department alerts**: Share sales/purchases/low-stock alerts to department WhatsApp numbers
- **Test message**: Send a test message from the Departments page

### Notifications

- **Bell icon** in header (top right)
- Shows low-stock alerts, recent activity, today's sales summary
- Auto-refreshes every 60 seconds
- Click-through to inventory / activity / sales pages

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open command palette |
| `1`–`9` | Jump to Nth sidebar page |
| `N` | Add new part (when on Inventory) |
| `/` | Focus the search box |
| `Esc` | Close dialog / command palette |

### Deep Links

- `/?page=sales` — jump to Sales
- `/?page=inventory&action=new` — open Add Part dialog
- `/?page=sales&action=new` — open New Sale dialog
- `/?login=1` — force login screen
- `/?login=1&expired=1` — show "session expired" message

### PWA

- Installable on mobile/desktop
- Manifest: `/public/manifest.json`
- Works offline (system fonts, no external CDN)

---

## API Endpoints

All endpoints are under `/api/` and require authentication unless noted.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api` | None | Health check (DB status, version, stats) |
| GET | `/api/setup` | None | First-run status + `hasDemoUsers` flag |
| POST | `/api/setup` | None | Seed demo data (only when no parts exist) |
| POST | `/api/seed` | Owner | Full re-seed (including mock users) |
| GET | `/api/auth` | None | Check current session |
| POST | `/api/auth` | None | Login / logout / change_password / unlock |
| GET | `/api/users` | Owner | List all users |
| POST | `/api/users` | None (first-run) / Owner | Create user |
| PUT | `/api/users` | Owner | Update user (name, email, role, isActive, password) |
| DELETE | `/api/users?id=X` | Owner | Deactivate user (soft delete) |
| GET | `/api/parts` | Any | List parts (search, filter, pagination) |
| POST | `/api/parts` | Any | Create part |
| GET | `/api/parts/[id]` | Any | Get single part with sales/purchase history |
| PUT | `/api/parts/[id]` | Any | Update part |
| DELETE | `/api/parts/[id]` | Any | Deactivate part (soft delete) |
| GET | `/api/sales` | Any | List sales (search, date filter, pagination) |
| POST | `/api/sales` | Any | Create sale (atomic stock decrement) |
| GET | `/api/purchases` | Manager+ | List purchases |
| POST | `/api/purchases` | Manager+ | Create purchase (atomic stock increment) |
| GET | `/api/stock` | Any | Dashboard summary (KPIs, charts, low-stock) |
| POST | `/api/stock` | Manager+ | Manual stock adjustment |
| GET | `/api/reports?type=X&days=N` | Manager+ | Reports (daily/category/profit/lowstock) |
| GET | `/api/departments` | Manager+ | List WhatsApp departments |
| POST | `/api/departments` | Manager+ | Create department |
| GET | `/api/departments/[id]` | Manager+ | Get single department |
| PUT | `/api/departments/[id]` | Manager+ | Update department |
| DELETE | `/api/departments/[id]` | Manager+ | Deactivate department |
| GET | `/api/customers` | Any | List customers |
| POST | `/api/customers` | Any | Create customer |
| GET | `/api/suppliers` | Manager+ | List suppliers |
| POST | `/api/suppliers` | Manager+ | Create supplier |
| GET | `/api/activity` | Admin+ | Activity log (paginated, filterable) |
| GET | `/api/notifications` | Any | Unified notifications feed |
| GET | `/api/backup` | Admin+ | List backups |
| POST | `/api/backup` | Admin+ | Create backup or restore |
| DELETE | `/api/backup?filename=X` | Admin+ | Delete a backup file |
| POST | `/api/import` | Admin+ | Excel/CSV import (multipart upload) |
| POST | `/api/whatsapp/send` | Any | Send WhatsApp message (OpenWA or wa.me) |
| GET | `/api/whatsapp/status` | Any | Check OpenWA connection status |

---

## Environment Variables

All configuration lives in `.env`. See `.env.example` for the full reference.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./data/liafon.db` | Prisma connection string |
| `APP_NAME` | `Liafon Stock Management` | App name |
| `APP_PASSWORD` | `liafon@2024` | Legacy developer unlock password |
| `BACKUP_DIR` | `./backups` | Where backups are written |
| `DAILY_BACKUP_HOUR` | `23` | Hour (0-23) for auto-backup |
| `DEFAULT_CURRENCY` | `INR` | Default currency for new parts |
| `OPENWA_API_URL` | _(empty)_ | Optional OpenWA server URL |
| `OPENWA_API_KEY` | _(empty)_ | Optional OpenWA API key |
| `OPENWA_SESSION` | `default` | OpenWA session name |
| `NODE_ENV` | `development` | `production` enables Secure cookies |
| `PORT` | `3000` | Server port |
| `HOSTNAME` | `0.0.0.0` | Server bind address |
| `IMPORT_MAX_MB` | `5` | Max Excel/CSV import file size |
| `LIAFON_ALLOW_MOCK_USERS_IN_PROD` | _(unset)_ | Set to `1` to allow demo users in production |
| `LIAFON_DEV_ORIGIN` | _(empty)_ | Custom dev-server origin for LAN access |

---

## Third-Party Integrations

### OpenWA (WhatsApp API)

- **Website**: https://github.com/openwa/openwa
- **Purpose**: Send WhatsApp messages directly from the app
- **Setup**:
  1. Install Docker: https://docs.docker.com/get-docker/
  2. Clone and start OpenWA:
     ```bash
     git clone https://github.com/openwa/openwa.git
     cd openwa
     docker compose -f docker-compose.dev.yml up -d
     ```
  3. Scan the QR code at `http://localhost:2785`
  4. Copy the API key into your `.env`:
     ```
     OPENWA_API_URL=http://localhost:2785/api
     OPENWA_API_KEY=your-api-key-here
     OPENWA_SESSION=default
     ```
- **Without Docker**: If Docker isn't available, you can run OpenWA directly with Node.js:
  ```bash
  git clone https://github.com/openwa/openwa.git
  cd openwa
  npm install
  npm start
  ```
- **Fallback**: If OpenWA isn't configured, the app falls back to `wa.me` deep links (opens WhatsApp Web with the message pre-filled — user still clicks "Send")

### SheetJS (xlsx)

- **Website**: https://cdn.sheetjs.com/
- **Purpose**: Excel import/export
- **Installed from**: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (not npm — the npm version is unmaintained and has known vulnerabilities)

### Prisma

- **Website**: https://www.prisma.io/
- **Purpose**: Database ORM
- **Version**: 6.x

### shadcn/ui

- **Website**: https://ui.shadcn.com/
- **Purpose**: UI component library (Radix UI + Tailwind)

### Other Dependencies

| Package | Purpose |
|---------|---------|
| `next` 16 | Web framework |
| `react` 19 | UI library |
| `tailwindcss` 4 | CSS framework |
| `framer-motion` | Animations |
| `recharts` 3 | Charts |
| `react-hook-form` + `zod` | Forms + validation |
| `zustand` | State management |
| `bcryptjs` | Password hashing |
| `lucide-react` | Icons |
| `date-fns` | Date utilities |

---

## Troubleshooting

### "Stuck on Initializing…" page

The loading screen has a 12-second timeout for auth-check and a 15-second hard fallback. If you're stuck:
1. Wait 15 seconds — it should auto-bail to login
2. Check the dev server console for errors
3. Hard-refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R`)
4. Delete `.next` folder and restart: `rm -rf .next && npm run dev`

### "Failed to execute 'fetch' on 'Window': Illegal invocation"

This was a bug in v3.6.0 (fixed in v3.6.1+). The `useSessionExpiry` hook now correctly binds `fetch` to `window`. If you still see this, hard-refresh your browser to clear cached chunks.

### Demo logins don't work

Demo users are only created when `/api/seed` is called. If they don't exist:
1. Sign in as the owner
2. Click **"Load Data"** in the header (or go to Settings → click "Load Demo Data")
3. The seed will create demo users (admin, manager, staff) alongside your real owner
4. The login page will now show "Quick Demo Login" buttons with the correct passwords

### "docker is not recognized"

Docker is not installed on your machine. To use OpenWA you have three options:
1. **Install Docker**: https://docs.docker.com/get-docker/
2. **Run OpenWA with Node.js** (without Docker):
   ```bash
   git clone https://github.com/openwa/openwa.git
   cd openwa
   npm install
   npm start
   ```
3. **Skip OpenWA entirely** — the app falls back to `wa.me` deep links automatically. You can still share sales/purchases via WhatsApp, you just have to click "Send" manually in WhatsApp Web.

### React Hooks error ("Rendered more hooks than during the previous render")

This was a bug in `sales-page.tsx` where `useCallback` was called after an early return. Fixed in v3.8.0 — the `handleExportCSV` callback is now called before the `if (loading) return` check.

### Database has old/wrong data

```bash
# Stop the server, then:
rm data/liafon.db
npx prisma db push
npm run dev
# → First-run setup will appear
```

### Cannot access from another device on LAN

The dev server binds to `0.0.0.0` by default. From your phone, open `http://<your-computer-ip>:3000`. If HMR is blocked, set `LIAFON_DEV_ORIGIN=192.168.x.x` in `.env` and restart.

### Port 3000 already in use

```bash
# Find what's using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Or use a different port
PORT=3001 npm run dev
```

---

## Credits

Built by **Liafon Software**. Powered by Next.js, Prisma, shadcn/ui, and the open-source community.
