# Roadmap

What's planned, what's deliberately out of scope, and what's blocked on external dependencies.

---

## ✅ Implemented (v5.0)

### Phase 1 — Vercel + Supabase compatibility
- Conditional `output: "standalone"` (skipped on Vercel)
- Prisma `directUrl` for migrations through PgBouncer
- `postinstall: prisma generate` in package.json
- Auto-inject `?pgbouncer=true&connection_limit=1&prepare=false` if missing
- `/tmp` fallback for backups on Vercel (read-only filesystem)
- `vercel.json` with 60s function timeouts + daily cron

### Phase 2 — Business features
- GST calculation (CGST+SGST/IGST auto)
- Discounts (flat + percentage)
- Cursor-based pagination on `/api/parts`
- PDF reports (P&L, GSTR-1, inventory valuation)
- Audit log retention policy
- Generic SMTP email support
- Supabase Storage integration (persistent backups)
- Vercel Cron daily auto-backup
- Upstash Redis distributed rate limiting
- Customer credit limit tracking (schema + payment model)

### Phase 3 — Free alternatives + advanced features
- Free WhatsApp via Baileys (replaces Twilio)
- Free voice calls via FreeSWITCH/Asterisk (replaces Twilio Voice)
- Free video calls via Jitsi Meet
- UPI payments with QR generation + image-upload decoding
- 2FA TOTP (Google Authenticator compatible)
- Product analysis with restock recommendations
- Multi-shop / multi-branch (Shop model + shopId everywhere)
- Purchase Order workflow (draft → approve → receive)
- Stock transfers between shops
- Batch / serial / expiry tracking
- Customer credit limit enforcement
- Barcode generation (Code128/EAN-13/QR)
- Generic SMTP email (Outlook/SendGrid/SES/Mailgun/Zoho)

### Phase 4 — Refactoring + UI + competitor-inspired quick wins
- Qwen Coder refactoring: `api-utils.ts`, `utils.ts`, `validations.ts` (DRY helpers, type safety)
- 2FA wired into login flow (`requiresTwoFactor: true` response)
- Customer credit limit enforcement in `/api/sales`
- ProductAnalysisDashboard component (full UI for analysis)
- UpiPaymentModal component (3-tab QR/VPA/phone)
- TwoFactorSetup component (4-step wizard + disable flow)
- WhatsAppPairing component (QR-based linking)
- Daily low-stock + near-expiry WhatsApp/email digest
- Item alternatives (interchangeable OEM part numbers)

### Phase 5 — Production hardening (this release)
- Removed dead files (Windows .bat scripts, clean-reset scripts, Caddyfile, outdated docs)
- Consolidated documentation into unified `docs/` structure (6 files)
- Wired Phase 4 UI components into the main app (Analysis nav item)
- Fixed `customerGstin` TODO in PDF reports (now uses Customer.gstNumber)
- Upgraded `/api/auth` login to use two-tier rate limiting (in-memory + Redis)
- Master `PROJECT_REPORT.md` with full feature matrix + honest limitations

---

## 🚧 Planned (next releases)

### High priority
- **Multiple UOM + conversion** (~160 LOC) — Buy per-box, sell per-piece. Schema-ready.
- **Preloaded HSN-code master** (~70 LOC) — 12,000+ HSN codes as a CSV seed. Replaces free-text.
- **Bulk CSV import/export for products** (~150 LOC) — Single-file import exists; bulk multi-file doesn't.
- **FEFO pick suggestion on sale screen** (~80 LOC) — Auto-suggest earliest-expiry batch on sale form.

### Medium priority
- **Custom fields per category** (~180 LOC, Snipe-IT-style fieldsets) — "Brake Pads" category auto-gets Pad Material / Vehicle Fitment fields.
- **Physical stock-count sheet + variance** (~190 LOC) — Periodic stocktaking workflow.
- **Barcode / bin-label printing** (~130 LOC) — Printable PDF labels with part SKU + name + bin location.
- **Barcode scanner React component** (~100 LOC) — Client-side camera scanning via `@zxing/browser`.

### Low priority (nice to have)
- **Tally XML / QuickBooks export** (~150 LOC) — For accounting handoff.
- **Customer self-service portal** (~500 LOC) — View invoices + pay online.
- **Loyalty program** (~300 LOC) — Points per sale, redeem for discount.
- **GSTR-2B/3B reconciliation** (~400 LOC) — Match purchase-side input credit.
- **e-Invoice / e-Way Bill via NIC GST API** (~1000+ LOC) — Indian government IRP integration. Requires GSTIN registration.
- **Read replicas via Prisma Accelerate** (~1 day config) — Supabase free tier doesn't include read replicas.

---

## ❌ Out of scope (deliberately)

These features are intentionally NOT planned because they don't fit the target user (Indian auto-parts SMB):

- **E-commerce storefront** — Pair with Shopify / Medusa / Saleor if you need one. Liafon is backend-only.
- **Manufacturing / BOM / MRP** — This is inventory + billing, not a manufacturing ERP. Use Odoo / ERPNext for that.
- **HR / Payroll** — Out of scope. Use a dedicated HR tool.
- **Project management** — Out of scope.
- **CRM (sales pipeline)** — Out of scope. The Customer model is for invoicing, not lead tracking.
- **Multi-language UI** — English only for now. The data model supports any language (UTF-8), but the UI strings are English.
- **Mobile native apps (iOS/Android)** — PWA installable instead. Native apps would duplicate 90% of the codebase for marginal benefit.
- **Plugin system** — InvenTree-style. Adds complexity without enough demand from the target user.
- **Double-entry stock moves refactor** — Odoo-style. Huge refactor (~2000+ LOC) for marginal benefit over the current single-row stock model.

---

## 🔒 Blocked on external dependencies

- **e-Invoice / e-Way Bill** — Requires GSTIN registration with the Indian government's IRP portal. Each owner needs their own credentials. Not a code problem — a business + compliance problem.
- **WhatsApp Business API (official)** — Meta requires business verification + a BSP (Business Solution Provider). Baileys works as a free alternative but technically violates WhatsApp ToS for automated messaging. Use only for transactional alerts (invoices, low-stock) — NOT bulk marketing.
- **Sub-daily cron on Vercel Hobby** — Vercel Hobby caps at 1 cron run/day. For hourly checks, upgrade to Pro ($20/mo) or use an external cron service (cron-job.org, EasyCron).

---

## 📊 Competitor analysis summary

Researched: InvenTree (MIT), PartKeepr (GPLv3, unmaintained), Snipe-IT (AGPLv3), Odoo Inventory (LGPLv3), ERPNext (GPLv3).

**Liafon leads on:**
- UPI payments (no competitor has this)
- Free WhatsApp via Baileys (no competitor has this)
- Indian GST compliance (only ERPNext matches, via the separate india-compliance app)
- Multi-tenant SaaS deployment (most competitors are single-tenant)
- Vercel + Supabase free-tier deployment (most competitors need a VPS)

**Liafon lags on:**
- Parts data modeling (InvenTree has parametric data, BOM, supplier cross-ref)
- Replenishment automation (Odoo has min/max reordering rules — Liafon has analysis but no auto-PO)
- GST API depth (ERPNext has e-invoice, e-way bill, GSTR-2B reconciliation)
- Multi-UOM (ERPNext + Odoo have box/piece conversion — Liafon is piece-only)
- Custom fields (Snipe-IT has fieldsets per category — Liafon has fixed schema)
