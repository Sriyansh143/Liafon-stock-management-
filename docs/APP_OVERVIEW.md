# Liafon Stock Management — Complete App Overview

> **Version**: 3.19.0 | **Updated**: June 2026 | **License**: Multi-tenant SaaS

---

## 📋 WHAT THE APP CAN DO

### ✅ Core Features (Working)

| Feature | Description |
|---------|-------------|
| **Multi-Tenant Architecture** | Multiple owners, each with isolated data via `ownerId`. Sub-users share owner's license. |
| **Inventory Management** | Full CRUD for spare parts with low-stock alerts, category filtering, barcode field, multi-currency |
| **Sales System** | Atomic stock transactions (race-condition safe), auto invoice numbers (INV-YYYYMMDD-NNNNN), below-cost guard, A5 print-ready invoices |
| **Purchase Management** | Supplier linking, stock increment, cost price update, auto invoice numbers (PUR-YYYYMMDD-NNNNN) |
| **Stock Adjustments** | Manual stock corrections with reason logging, full audit trail in StockLog |
| **Customer Directory** | CRUD for customers with phone, email, address, notes |
| **Supplier Directory** | CRUD for suppliers with GST number, phone, email, address |
| **Department Management** | WhatsApp departments (Sales Counter, Warehouse, etc.) with phone numbers |
| **Dashboard** | KPIs, hourly bar chart (today), area chart (date ranges), top-selling parts, category distribution, inventory valuation |
| **Reports** | Daily sales, category distribution, profit analysis, low-stock list — all with CSV export |
| **Activity Log** | Tamper-evident audit trail (SHA-256 hashed) with date-range filtering, user/action/entity filters |
| **Backup & Restore** | JSON + Excel backups, transactional restore via `createMany`, optional AES-256-GCM encryption |
| **CSV Import** | Bulk import parts from Excel/CSV (10k row cap, batch insert, per-row validation) |
| **Multi-Currency** | 20+ currencies with Indian (Cr/L) and Western (M/K) numbering systems |
| **WhatsApp Integration** | OpenWA API + wa.me fallback for sale/purchase/low-stock/daily-report alerts |
| **PWA Installable** | Manifest + icons, works offline, add to home screen, deep links |
| **Print Invoices** | A5 HTML invoices with GST, discount, tax breakdown, amount in words |
| **Notifications Bell** | Live low-stock + activity feed with search, auto-refresh (paused when tab hidden) |
| **Command Palette** | ⌘K shortcuts for navigation, actions, theme switching |
| **Dark/Light/System Theme** | Full theme support with next-themes |
| **Role-Based Access** | Owner, Admin, Manager, User — with customizable field visibility per role |

### ✅ Security Features (Working)

| Feature | Description |
|---------|-------------|
| **bcrypt 12 rounds** | OWASP 2023 compliant password hashing |
| **Session invalidation** | `passwordChangedAt` check — changing password/role kills old sessions |
| **Rate limiting** | Login (10/5min), password reset (5/hour), WhatsApp (30/5min), test email (5/hour) |
| **IP duplicate detection** | SHA-256 hashed IP + pepper — blocks multiple owner accounts from same IP |
| **Storage limits** | Free tier: 50 parts, 100 sales/mo, 50 customers. Pro: unlimited |
| **CSP header** | Content-Security-Policy restricts scripts/styles to self |
| **Security headers** | X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| **Error leak prevention** | No `error.message` returned to clients — generic messages only |
| **Below-cost guard** | Staff/manager can't sell below cost — only owner/admin can override |
| **Tamper-evident logs** | SHA-256 hash on every ActivityLog entry with `ACTIVITY_LOG_PEPPER` |
| **Backup encryption** | AES-256-GCM encryption when `BACKUP_ENCRYPTION_KEY` is set |
| **Path-traversal safe** | Backup filename validation with strict regex |
| **Zod validation** | Input validation on every API route |
| **SecurityMonitor** | Real-time logging of brute-force + privilege escalation attempts |
| **Health endpoint** | `/api/health` for uptime monitoring |

### ✅ License System (Working)

| Feature | Description |
|---------|-------------|
| **Per-owner license** | Each owner gets their own `License` record with key, status, expiry, plan |
| **7-day free trial** | Auto-created on registration — no credit card required |
| **License key activation** | Users can enter key during registration OR on the lock screen |
| **Auto-expiry** | License checks every 5 min — locks app when expired |
| **Lock screen with key input** | Users can enter license key to restore access without developer help |
| **Plan tiers** | Free (limited), Pro (₹999/mo, unlimited), Business (₹2,999/mo, API), Lifetime (₹9,999 once) |
| **Developer controls** | Deactivate/set expiry via `LIAFON_DEV_KEY` or `manage-license.js` script |

---

## ❌ WHAT THE APP CANNOT DO (Yet)

| Missing Feature | Status | Plan |
|-----------------|--------|------|
| **Supabase Auth (Gmail OAuth)** | ❌ Not implemented | Phase 3 — replace bcrypt with Supabase Auth |
| **Firebase Firestore** | ❌ Not implemented | Phase 3 — migrate app data to Firestore |
| **Separate databases per owner** | ❌ Single DB with `ownerId` filtering | Phase 3 — Firestore collections per owner |
| **Razorpay payment integration** | ❌ Not implemented | Next sprint — ₹999/mo subscription |
| **Barcode scanner** | ❌ Field exists, no scanner | Phase 1 roadmap |
| **Bin location management** | ❌ Not implemented | Phase 1 roadmap |
| **Auto purchase orders** | ❌ Not implemented | Phase 2 roadmap |
| **Serial/batch tracking** | ❌ Not implemented | Phase 3 roadmap |
| **Dead stock / FSN analysis** | ❌ Not implemented | Phase 2 roadmap |
| **Multi-warehouse** | ❌ Single location only | Future |
| **Accounting integration** | ❌ No QuickBooks/Tally sync | Future |
| **E-commerce sync** | ❌ No Shopify/Amazon sync | Future |
| **SMS notifications** | ❌ WhatsApp only | Future |

---

## 🏗️ ARCHITECTURE — Multi-Tenant Model

### Current Architecture (Option C — Shared Database with ownerId)

```
┌─────────────────────────────────────────────────────┐
│  Supabase PostgreSQL (Single Database)               │
│                                                       │
│  User Table                                           │
│  ├── Owner A (ownerId: "owner-a-id")                 │
│  │   ├── Sub-user 1 (ownerId: "owner-a-id")          │
│  │   └── Sub-user 2 (ownerId: "owner-a-id")          │
│  ├── Owner B (ownerId: "owner-b-id")                 │
│  │   └── Sub-user 3 (ownerId: "owner-b-id")          │
│  └── Owner C (ownerId: "owner-c-id")                 │
│                                                       │
│  License Table                                        │
│  ├── Owner A: license_key="LIAFON-XXX", plan="pro"   │
│  ├── Owner B: license_key="LIAFON-YYY", plan="free"  │
│  └── Owner C: license_key="LIAFON-ZZZ", plan="life"  │
│                                                       │
│  SparePart Table (ALL parts, filtered by ownerId)    │
│  ├── Owner A's parts (ownerId: "owner-a-id")         │
│  ├── Owner B's parts (ownerId: "owner-b-id")         │
│  └── Owner C's parts (ownerId: "owner-c-id")         │
│                                                       │
│  Sale, Purchase, StockLog, etc. — ALL filtered by    │
│  ownerId. Each owner only sees their own data.        │
└─────────────────────────────────────────────────────┘
```

### How Multi-Tenant Works

| Concept | Implementation |
|---------|---------------|
| **Data isolation** | Every API route filters by `user.ownerId` — Owner A cannot see Owner B's data |
| **License per owner** | Each owner has their own `License` record — if Owner A's license expires, Owner B is unaffected |
| **Sub-users** | Owner creates sub-users (admin/manager/staff) — they inherit the owner's `ownerId` and license |
| **License cascade** | If owner's license expires → ALL sub-users under that owner are locked out |
| **IP detection** | Prevents same IP from creating multiple owner accounts (1 owner per IP by default) |
| **Storage limits** | Free tier: 50 parts, 100 sales/mo. Pro: unlimited. Enforced per owner. |

### Registration Flow

```
User visits app → Clicks "Create Account"
    │
    ├── Is this the first user ever?
    │   ├── YES → Become Owner A (ownerId = self)
    │   │         → 7-day trial license auto-created
    │   │         → Can create sub-users later
    │   │
    │   └── NO → Is user authenticated as an existing owner?
    │       ├── YES → Creating a sub-user (inherits owner's ownerId)
    │       │         → Check plan's user limit
    │       │
    │       └── NO → Public registration → New Owner B
    │                 → Check IP duplicate (max 1 owner per IP)
    │                 → 7-day trial license auto-created
    │                 → Gets own ownerId, own data, own license
```

---

## 🚀 HOW TO DEPLOY TO VERCEL

### Prerequisites
- Vercel account (free)
- Supabase account (free — 500MB PostgreSQL)
- GitHub account (private repo)

### Step-by-Step

```powershell
# 1. Download and extract the app

# 2. Edit .env — set DATABASE_URL to your Supabase connection string
#    DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres

# 3. Push schema to Supabase (creates all tables)
npx prisma db push

# 4. Generate Prisma client
npx prisma generate

# 5. Initialize git and push to GitHub
git init
git add .
git commit -m "Liafon Stock Management v3.19"
git remote add origin https://github.com/YOUR_USERNAME/liafon-stock-management.git
git push -u origin main

# 6. Deploy to Vercel (from the project directory, NOT home folder)
cd C:\path\to\Liafon-Stock-Management
vercel --prod

# 7. Set env vars in Vercel dashboard:
#    DATABASE_URL = postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres
#    LIAFON_DEV_KEY = (your 32+ char random key)
#    BACKUP_ENCRYPTION_KEY = (your 32+ char random key)
#    ACTIVITY_LOG_PEPPER = (your 32+ char random key)
#    REGISTRATION_PEPPER = (your 32+ char random key)
#    MAX_OWNERS_PER_IP = 1
#    NODE_ENV = production

# 8. Redeploy with env vars
vercel --prod

# 9. Open your Vercel URL → Create owner account → App is live!
```

### After Deployment

```powershell
# Activate a license (run locally with Supabase DATABASE_URL)
$env:DATABASE_URL = "postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres"
node scripts/manage-license.js activate LIAFON-MYSHOP-2026 "My Shop" 365
```

---

## 💰 PRICING MODEL

| Plan | Price | Apps | Storage | Users | Features |
|------|-------|------|---------|-------|----------|
| **Free Trial** | ₹0 | 1 app | 50 parts, 100 sales/mo | 1 | Basic features, watermarked invoices |
| **Pro** | ₹999/mo | All 5 apps | Unlimited | 5 | No watermark, exports, imports, WhatsApp |
| **Business** | ₹2,999/mo | All 5 apps | Unlimited | 10 | API access, advanced analytics, priority support |
| **Lifetime** | ₹9,999 once | All 5 apps | Unlimited | Unlimited | Forever, no monthly fees |

---

## 📱 MOBILE ACCESS

1. Open your Vercel URL on phone browser
2. Log in
3. Install as PWA: Chrome menu → Add to Home Screen
4. Works from anywhere — no WiFi needed
5. Deep links: `https://your-app.vercel.app/?page=sales&action=new`

---

## 🔧 ENVIRONMENT VARIABLES

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Supabase) |
| `LIAFON_DEV_KEY` | ✅ | Developer key for license management (min 16 chars) |
| `ACTIVITY_LOG_PEPPER` | ✅ | Pepper for tamper-evident log hashes |
| `REGISTRATION_PEPPER` | ✅ | Pepper for IP duplicate detection |
| `BACKUP_ENCRYPTION_KEY` | Optional | AES-256-GCM key for backup encryption |
| `MAX_OWNERS_PER_IP` | Optional | Max owner accounts per IP (default: 1) |
| `DEFAULT_CURRENCY` | Optional | Default: INR |
| `GMAIL_USER` | Optional | For password reset emails |
| `GMAIL_APP_PASSWORD` | Optional | Gmail app password |
| `OPENWA_API_URL` | Optional | WhatsApp API server URL |
| `OPENWA_API_KEY` | Optional | WhatsApp API key |
| `CLOUD_LICENSE_URL` | Optional | Cloud license validation server |

---

*Last updated: June 2026*
