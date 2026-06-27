# Liafon Stock Management — Project Report

**Version:** 5.0.0 (Production-Ready)
**License:** Proprietary (Liafon Software)
**Stack:** Next.js 16 · React 19 · TypeScript · Prisma 6 · PostgreSQL (Supabase) · Tailwind 4 · shadcn/ui
**Deployment:** Vercel (serverless) + Supabase (database + storage) + Upstash Redis (rate limiting)
**Last updated:** 2026-06-27

---

## 1. What this app is

Liafon Stock Management is a multi-tenant, multi-shop inventory + billing system built for **Indian auto-parts shops**. It combines GST-compliant invoicing, UPI payments, free WhatsApp messaging, predictive restock analysis, and PDF reporting — all deployable on free-tier infrastructure (Vercel Hobby + Supabase Free + Upstash Free + Railway Free for WhatsApp gateway).

It is NOT a generic POS. It is purpose-built for the workflows of an Indian auto-parts retailer: OEM cross-referencing, HSN-coded GST invoices, CGST/SGST/IGST auto-split, customer credit tracking, batch/expiry tracking, multi-branch stock transfers.

---

## 2. What it CAN do (feature matrix)

### Inventory
| Feature | Status | Notes |
|---|---|---|
| Parts catalog (part #, brand, category, vehicle model) | ✅ | Multi-currency |
| Multi-shop / multi-branch | ✅ | Each shop has its own inventory + sales |
| Cursor-based pagination | ✅ | O(1) on Postgres, scales to 50k+ parts |
| CSV/XLSX import (10k rows max) | ✅ | Batched in 500-row chunks |
| Excel export (inventory + sales) | ✅ | via `xlsx` |
| Batch / serial / expiry tracking | ✅ | Auto-created on PO receive |
| Item alternatives (OEM cross-ref) | ✅ | M2M self-referential |
| Low-stock alerts (in-app) | ✅ | Notifications bell |
| Low-stock WhatsApp/email digest | ✅ | Daily via Vercel Cron |
| Near-expiry batch alerts | ✅ | Configurable window (`EXPIRY_ALERT_DAYS`) |
| Product analysis w/ restock recommendation | ✅ | 6-level recommendation + suggested qty + priority |
| Per-shop + unified analysis view | ✅ | Branch-wise comparison table |
| Dead stock detection | ✅ | 90-day no-sale heuristic |
| Profitability per part | ✅ | Margin + total potential profit |
| Barcode generation (Code128/EAN-13/QR) | ✅ | via `bwip-js` |

### Sales & Invoicing
| Feature | Status | Notes |
|---|---|---|
| Sales ledger w/ auto invoice numbers | ✅ | `INV-YYYYMMDD-00001` |
| GST calculation (CGST+SGST / IGST auto) | ✅ | Based on shop + customer GSTIN state codes |
| HSN code support | ✅ | Per sale + per TaxRate |
| Per-category tax rate catalog | ✅ | Auto-lookup if no explicit rate |
| Discounts (flat + percentage) | ✅ | Applied before tax |
| Customer credit limits + enforcement | ✅ | Pre-flight check on outstanding balance |
| Payment tracking (paid/partial/unpaid) | ✅ | Multiple payments per sale |
| UPI QR generation | ✅ | Works with PhonePe/GPay/Paytm/BHIM |
| UPI QR scanning (customer image upload) | ✅ | Decoded via `jsqr` |
| UPI VPA + phone validation | ✅ | Live form validation |
| Sale receipt email | ✅ | HTML email with line items + totals |
| Print invoices (browser) | ✅ | PWA-friendly |
| WhatsApp invoice sending | ✅ | Free via Baileys |
| Below-cost sale guard | ✅ | Requires explicit `allowBelowCost: true` |

### Purchases & Procurement
| Feature | Status | Notes |
|---|---|---|
| Purchase ledger (retroactive) | ✅ | For historical data |
| Purchase Order workflow | ✅ | draft → approved → received (with auto Batch creation) |
| Stock transfers between shops | ✅ | pending → shipped → received (auto-creates dest part) |
| Supplier directory | ✅ | With GST numbers |
| Supplier-part cross-reference | ✅ | Via `Batch.supplierId` |

### Customers
| Feature | Status | Notes |
|---|---|---|
| Customer directory | ✅ | With GST number + state |
| Credit limit + outstanding tracking | ✅ | Enforced on sale |
| Customer payment history | ✅ | Via `Payment` model |
| Multiple payments per sale | ✅ | Installments supported |

### Reporting
| Feature | Status | Notes |
|---|---|---|
| Dashboard KPIs | ✅ | Revenue, COGS, low-stock, recent activity |
| Sales/purchases date-range reports | ✅ | Tables |
| PDF P&L statement | ✅ | via `pdfkit` |
| PDF GSTR-1 style summary | ✅ | Per-invoice tax breakup |
| PDF inventory valuation | ✅ | Category-wise breakdown |
| Excel export | ✅ | All reports |

### Auth & Security
| Feature | Status | Notes |
|---|---|---|
| Bcrypt-12 password hashing | ✅ | OWASP 2023 minimum |
| Legacy SHA-256 hash migration | ✅ | Auto-upgrade on login |
| 2FA TOTP (Google Authenticator compatible) | ✅ | With 8 backup codes |
| Password reset via email | ✅ | 30-min token expiry |
| Session invalidation on password change | ✅ | Via `iat` timestamp check |
| Login rate limiting (2-tier) | ✅ | In-memory + Upstash Redis |
| Tamper-evident activity log | ✅ | SHA-256 hash chain + pepper |
| Path traversal protection | ✅ | Backup filename regex validation |
| IP-based duplicate account prevention | ✅ | SHA-256 hashed (configurable pepper) |
| Role-based access (owner/admin/manager/user) | ✅ | Page-level + field-level |
| Field-level customization per role | ✅ | Owner can hide costPrice/profit from staff |
| HTTP security headers | ✅ | X-Frame-Options, CSP, Referrer-Policy, etc. |

### Integrations
| Feature | Status | Notes |
|---|---|---|
| WhatsApp (free, no Twilio) | ✅ | via `@whiskeysockets/baileys` (MIT) |
| Voice calls (free, no Twilio) | ✅ | via FreeSWITCH/Asterisk gateway |
| Video calls (free) | ✅ | via Jitsi Meet |
| Generic SMTP email | ✅ | Outlook/SendGrid/SES/Mailgun/Zoho |
| Gmail (legacy compat) | ✅ | App password |
| Supabase Storage (persistent backups) | ✅ | Signed URLs for download |

### Operations
| Feature | Status | Notes |
|---|---|---|
| Daily auto-backup (Vercel Cron) | ✅ | Full backup per owner → Supabase Storage |
| Audit log retention policy | ✅ | Default 365 days, configurable |
| Missed-backup detection | ✅ | UI flag if daily backup didn't run |
| Factory reset (owner-only) | ✅ | Requires "DELETE" confirmation |
| PWA installable | ✅ | Manifest + icons |
| Dark mode | ✅ | System preference detection |
| Command palette (Cmd+K) | ✅ | Quick navigation |
| Mobile-responsive | ✅ | Drawer nav on mobile |

---

## 3. What it CANNOT do (honest limitations)

### Hard limitations (architectural)
- **Persistent scheduled jobs on Vercel Hobby** — Vercel Hobby cron runs at most once/day. For sub-daily jobs (e.g. hourly low-stock checks), upgrade to Pro or use an external cron service.
- **Long-running WebSocket on Vercel** — Baileys WhatsApp + FreeSWITCH voice gateway must run on a separate VPS/Railway/Render. Vercel serverless can't hold persistent sockets.
- **Heavy transactions on Vercel** — Hobby caps function execution at 60s. Backups of 50k+ parts may timeout. Pro allows 300s.

### Functional gaps (not yet implemented)
- **e-Invoice / e-Way Bill via NIC GST API** — Indian government's IRP integration is ~1000+ LOC and requires GSTIN registration. Not in this release.
- **GSTR-2B/3B reconciliation** — Matching purchase-side input credit against the government's auto-populated data. Schema-ready, code not written.
- **Multiple UOM + conversion** — Buying per-box but selling per-piece. Schema-ready, code not written.
- **Custom fields per category** — Snipe-IT-style fieldsets. Schema-ready, code not written.
- **Physical stock-count sheet + variance** — Periodic stocktaking workflow. Not yet built.
- **Barcode scanner component (camera)** — Server-side barcode generation works; the client-side camera-scanning React component is not included. Use `@zxing/browser` to add it.
- **FEFO pick suggestion on sale screen** — When fulfilling an item with batches, the system doesn't yet auto-suggest the earliest-expiry batch on the sale form. (The data is there; UI not built.)
- **Preloaded HSN-code master** — Currently free-text. ERPNext ships 12,000+ HSN codes as a CSV. Not yet imported.
- **Bulk CSV import/export for products** — Single-file import exists; bulk multi-file import does not.

### Performance considerations
- **No read replicas** — Single Supabase primary. Heavy reports could slow live writes on the free tier.
- **No full-text search** — Parts search uses `LIKE` / `contains`. Works fine for <5k parts; for 100k+ consider Postgres `tsvector`.
- **No Prisma Accelerate** — Each serverless function opens its own Prisma client. For very high-traffic sites, consider Prisma Accelerate.

### Business limitations
- **No multi-currency FX conversion** — Multi-currency labels exist (per-part), but no live FX rates. Each part's currency is just a label.
- **No B2B portal** — Customers can't self-serve invoices/payments via a portal.
- **No loyalty program** — No points/rewards tracking.
- **No e-commerce storefront** — This is backend-only. Pair with Shopify / Medusa / Saleor if you need a storefront.
- **No accounting export (Tally/QuickBooks)** — Excel export only. No native Tally XML or QBO format.

---

## 4. Tech stack (everything open source or free-tier)

| Layer | Technology | License | Why |
|---|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | MIT | Best React framework, Vercel-native |
| UI | React 19 + Tailwind 4 + shadcn/ui | MIT | Modern, accessible, themeable |
| Language | TypeScript 5 | Apache 2.0 | Type safety |
| ORM | Prisma 6 | Apache 2.0 | Type-safe DB queries + migrations |
| Database | PostgreSQL (Supabase) | PostgreSQL License | Free tier 500 MB, PgBouncer pooling |
| Object storage | Supabase Storage | Apache 2.0 | Free 1 GB for backups |
| Rate limiting | Upstash Redis | MIT | Free 10k commands/day |
| WhatsApp | @whiskeysockets/baileys | MIT | Free WhatsApp Web, no Twilio |
| Voice | FreeSWITCH / Asterisk | MIT / GPL | Self-hosted, no per-minute fees |
| Video | Jitsi Meet | Apache 2.0 | Free public instance |
| 2FA | otplib | MIT | TOTP standard, Google Auth compatible |
| PDF | pdfkit | MIT | Pure JS, no headless browser |
| QR codes | qrcode + jsqr | MIT | Generate + decode |
| Barcodes | bwip-js | MIT | Code128/EAN-13/UPC |
| Email | nodemailer | MIT | Any SMTP provider |
| Hosting | Vercel | Proprietary | Free Hobby tier sufficient |
| Charts | recharts | MIT | Dashboard visualizations |
| Forms | react-hook-form + zod | MIT | Type-safe validation |

**No paid APIs. No Twilio. No SendGrid. No Authy. No AWS SNS.**

---

## 5. Installation (5-step quickstart)

> **⚠️ If you're upgrading from an older version** and seeing errors like
> `"The column StockLog.shopId does not exist"`, run the migration scripts
> in order:
> 1. `scripts/migrate-v1-to-v5.sql` — adds Phase 1-5 schema (shopId, GST, 2FA, etc.)
> 2. `scripts/migrate-v5-to-v6.sql` — adds Phase 6 schema (UOM, HSN master, custom fields, stock count)
> 3. `scripts/seed-hsn-codes.sql` — preloads ~80 common HSN codes for auto-parts
>
> Run all three in your Supabase SQL Editor. See `docs/INSTALL.md` § "Upgrading from v1-v4" for details.

### Step 1: Supabase project
1. Create a project at https://supabase.com (free tier)
2. Pick a region close to your users (Mumbai → Vercel `bom1`)
3. Save the database password somewhere safe
4. Project Settings → Database → copy BOTH connection strings:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`
   - **Direct connection** (port 5432) → `DIRECT_URL`

### Step 2: Push code to GitHub
```bash
git init
git add -A
git commit -m "Liafon Stock Management v5.0"
git branch -M main
git remote add origin https://github.com/<you>/liafon.git
git push -u origin main
```

### Step 3: Apply schema to Supabase (one-time)
```bash
# Create .env locally with DATABASE_URL + DIRECT_URL
npm install
npx prisma db push
```

Verify in Supabase → Table Editor: ~14 tables should exist.

### Step 4: Connect Vercel
1. https://vercel.com/new → import the GitHub repo
2. Add env vars (see `docs/INSTALL.md` for the full checklist)
3. Deploy

### Step 5: First-run setup
1. Visit the Vercel URL → "Create Owner Account"
2. Login → Dashboard

**Done.** See `docs/INSTALL.md` for the complete step-by-step with screenshots references + troubleshooting.

---

## 6. Documentation map

All documentation lives in `docs/`:

| File | Purpose |
|---|---|
| `docs/PROJECT_REPORT.md` | **This file** — high-level overview, what it can/cannot do |
| `docs/INSTALL.md` | Step-by-step Vercel + Supabase deployment guide |
| `docs/FEATURES.md` | Every feature explained with usage examples |
| `docs/API.md` | Every API endpoint documented with request/response examples |
| `docs/ARCHITECTURE.md` | Codebase structure, data flow, security model |
| `docs/ROADMAP.md` | What's planned + what's deliberately out of scope |

Plus:
- `.env.example` — every env var documented inline
- `README.md` — short project intro (links to docs/)

---

## 7. Build verification

```
✓ Compiled successfully in 11.8s
✓ Finished TypeScript in 10.7s
✓ Generating static pages (46/46)
Total routes: 49 (1 static + 48 dynamic API routes)
```

---

## 8. Support & licensing

- **License:** Proprietary — Liafon Software. Source code is provided for the owner's use.
- **Commercial use:** Allowed for the licensed owner.
- **Redistribution:** Not allowed without explicit written permission.
- **Warranty:** As-is, no warranty. Back up your data regularly.

For issues, contact your developer (the `LIAFON_DEV_KEY` holder).
