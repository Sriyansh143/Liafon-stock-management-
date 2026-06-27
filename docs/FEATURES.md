# Features Reference

Every feature in Liafon Stock Management, organized by module. Each feature includes usage notes + API endpoint references.

For API request/response examples, see `API.md`. For installation, see `INSTALL.md`.

---

## 1. Inventory Management

### Parts catalog
- **Add/edit/delete parts** with: part number, name, category, brand, vehicle model, cost/selling price, stock level, min-stock alert, location, barcode, currency
- **Multi-shop support** — each part can belong to a specific shop (independent stock levels) or be unassigned (shared across all shops)
- **Cursor-based pagination** — `GET /api/parts?cursor=<lastId>&limit=50` for O(1) pagination on Postgres
- **Search** — name, part number, brand, vehicle model (case-insensitive `contains`)
- **Filter** — by category, low-stock, active/inactive

### Batch / serial / expiry tracking
- Each part can have multiple **Batches** (received at different times, from different suppliers)
- Per-batch fields: `batchNumber`, `serialNumber`, `expiryDate`, `manufactureDate`, `unitCost`, `supplierId`
- Batches auto-created when a Purchase Order with batch info is received
- Near-expiry batches trigger WhatsApp/email alerts via daily cron

### Item alternatives (OEM cross-referencing)
- A part can have multiple **alternative parts** (interchangeable)
- When a customer asks for an out-of-stock part, the salesperson can immediately suggest alternatives
- Endpoint: `GET/POST/DELETE /api/parts/[id]/alternatives`

### Product analysis (restock recommendations)
- `GET /api/parts/analysis?shopId=<id>&onlyLowStock=true`
- Per part, computes:
  - Sales velocity (units/day, 30-day + 90-day averages)
  - Days of stock left (current_stock / velocity)
  - Last sale date + days ago
  - Last restock date + days ago
  - Profit margin + total potential profit
  - Time in inventory (days since created)
- **6-level recommendation:**
  1. `restock_now` — Urgent: high velocity + low days left
  2. `restock_soon` — This week: low days left + decent velocity
  3. `monitor` — Slow seller or low margin, don't restock yet
  4. `discontinue` — No sales in 90+ days, consider delisting
  5. `new_product` — Created <30 days ago, too early to judge
  6. `no_action` — Healthy stock + sales
- Suggested restock quantity based on 30-day velocity
- Priority 1 (urgent) → 5 (lowest)
- Multi-shop support: `?shopId=all` returns unified view + per-shop comparison breakdown

### CSV/XLSX import
- `POST /api/import` (multipart form data)
- Accepts `.xlsx`, `.xls`, `.csv`
- Max 10,000 rows per import, batched in 500-row chunks
- Validates each row, returns per-row errors

### Excel export
- From Settings → Backup → "Export Excel"
- Generates `.xlsx` with inventory + sales sheets

---

## 2. Sales & Invoicing

### Create a sale
- `POST /api/sales`
- Body includes: `partId`, `quantity`, optional `unitPrice`, `customerId`, `taxRate`, `discount`, `discountType`, `amountPaid`, `paymentMethod`
- Auto-generates invoice number: `INV-YYYYMMDD-00001`
- Transactional: verify stock → create sale → decrement stock → create stock log → create payment
- Below-cost guard: refuses sale below cost price unless `allowBelowCost: true`

### GST calculation
- Auto-detected from `TaxRate` table by part category (or override with explicit `taxRate`)
- **Intra-state** (same state): CGST + SGST, each = rate/2
- **Inter-state** (different state): IGST = full rate
- State codes derived from shop + customer GSTINs (first 2 digits of GSTIN)
- All 7 tax fields stored: `taxRate`, `cgstRate`, `cgstAmount`, `sgstRate`, `sgstAmount`, `igstRate`, `igstAmount`, `taxableValue`

### Discounts
- Two types: `flat` (currency amount) or `percent` (0-100)
- Applied to subtotal (unitPrice × quantity) BEFORE tax
- `discountAmount` is the computed actual discount in currency

### Customer credit limits
- Set `Customer.creditLimit` (default 0 = no credit)
- On sale creation: if customer has `creditLimit > 0`, pre-flight checks that outstanding + estimated sale total ≤ limit
- Returns `CREDIT_LIMIT_EXCEEDED` with breakdown if exceeded
- Outstanding = sum of (totalPrice - amountPaid) for all `partial`/`unpaid` sales

### Payment tracking
- Each sale has `amountPaid` + `paymentStatus` (`paid` / `partial` / `unpaid`)
- Multiple payments per sale supported (installments)
- `POST /api/payments` to record additional payments
- Payment methods: `cash`, `card`, `upi`, `bank`, `cheque`, `other`

### UPI payments
- `POST /api/payments/upi` with `action: 'generate_qr'`
  - Returns Base64 PNG QR code (scannable by PhonePe/GPay/Paytm/BHIM)
- `POST /api/payments/upi` with `action: 'decode_qr'`
  - Upload customer's QR screenshot, decoded via `jsqr` + `sharp`
  - Returns extracted VPA + amount + note
- `POST /api/payments/upi` with `action: 'validate_vpa'` / `'validate_phone'`
  - Live form validation

### Invoice printing
- Browser print dialog (PWA-friendly)
- HTML invoice with shop branding, line items, GST breakup, totals

### Sale receipt email
- `sendSaleReceiptEmail()` in `src/lib/email.ts`
- HTML email with line items + totals
- Triggered manually from sales page (or auto-trigger via cron — TODO)

### WhatsApp invoice sending
- Send invoice details + amount via free Baileys WhatsApp
- No per-message fees

---

## 3. Purchases & Procurement

### Purchase Order workflow
- `POST /api/purchase-orders` — create draft PO with line items
- `PATCH /api/purchase-orders/[id]` with `action: 'approve'` (admin only)
- `PATCH /api/purchase-orders/[id]` with `action: 'receive'` (admin only)
  - For each line: increments part stock + creates Purchase record + creates Batch (if batch info provided) + creates StockLog entry
  - All in a single transaction
- `PATCH /api/purchase-orders/[id]` with `action: 'cancel'`

### Stock transfers between shops
- `POST /api/stock-transfers` — create transfer (status: `pending`)
- `PATCH /api/stock-transfers/[id]` with `action: 'ship'`
  - Source shop's stock decremented
- `PATCH /api/stock-transfers/[id]` with `action: 'receive'`
  - Destination shop's stock incremented
  - Auto-creates the part at destination shop if it doesn't exist (copies cost/selling prices)
- `PATCH /api/stock-transfers/[id]` with `action: 'cancel'`

### Legacy purchase ledger
- `POST /api/purchases` — retroactive purchase recording (for historical data)
- New procurement should go through POs

---

## 4. Customers & Suppliers

### Customers
- Directory with name, phone, email, address, GST number, state, credit limit
- Linked to sales + payments
- Per-customer outstanding balance tracking
- Multi-shop assignment

### Suppliers
- Directory with GST number
- Linked to purchases + POs + batches

---

## 5. Reporting

### Dashboard
- KPIs: today's revenue, low-stock count, recent activity
- Charts via `recharts`

### PDF reports
- `GET /api/reports/pdf?type=pl&startDate=...&endDate=...` — Profit & Loss statement
- `GET /api/reports/pdf?type=gst&startDate=...&endDate=...` — GSTR-1 style summary with per-invoice tax breakup
- `GET /api/reports/pdf?type=inventory` — Inventory valuation (category-wise)
- Generated via `pdfkit` (pure JS, no headless browser)

### Excel reports
- All report data exportable to `.xlsx`
- From Reports page → "Export Excel"

---

## 6. Auth & Security

### Authentication
- Email + password (bcrypt-12, OWASP 2023 minimum)
- Legacy SHA-256 hashes auto-upgrade to bcrypt on next login
- Session cookies (7-day expiry), `HttpOnly` + `SameSite=Lax` + `Secure` (on HTTPS)
- Password reset via email (30-min token expiry, Gmail or any SMTP)

### 2FA TOTP
- `POST /api/auth/2fa/enable` (with current password) → returns secret + QR URL + 8 backup codes
- Scan QR with Google Authenticator / Authy / 1Password
- `POST /api/auth/2fa/verify` with `action: 'enable', code` → completes setup
- Login flow: if 2FA enabled, returns `{ requiresTwoFactor: true, userId }` after password verification
- Client retries with `{ email, password, twoFactorCode }`
- Backup codes: 8 one-time codes in `XXXX-XXXX` format, stored hashed (SHA-256 + pepper)
- `POST /api/auth/2fa/disable` (with current password + TOTP code) → disables

### Rate limiting (2-tier)
- Tier 1: In-memory `Map` (per-instance, fast)
- Tier 2: Upstash Redis (cross-instance) — catches distributed attacks
- Login: 10 attempts per 5-min window per IP+email
- Falls back to in-memory only if Redis not configured

### Audit log
- Every action logged (login, create, update, delete, backup, restore, etc.)
- SHA-256 hash chain with secret pepper (tamper-evident)
- Auto-cleanup after `AUDIT_RETENTION_DAYS` (default 365) via daily cron

### Permissions
- 4 roles: `owner`, `admin`, `manager`, `user`
- Page-level access control
- Field-level customization per role (owner can hide `costPrice`/`profit` from staff)
- IP-based duplicate account prevention (SHA-256 hashed)

---

## 7. Multi-Shop / Multi-Branch

### Shop model
- Each shop has: name, address, city, state, pincode, GSTIN, phone, email, lat/lng
- `GET/POST /api/shops` for CRUD

### Per-shop data partitioning
- `shopId` on: `SparePart`, `Sale`, `Purchase`, `StockLog`, `Customer`, `Supplier`, `PurchaseOrder`, `StockTransfer`
- Users can be assigned to a shop (`User.shopId`) — staff see only their shop's data
- Owner/admin (no `shopId`) see ALL shops

### Branch-wise comparison
- `GET /api/parts/analysis?shopId=all` returns unified parts + `perShopBreakdown` array
- Per-shop: total parts, low-stock count, restock-now count, stock value

---

## 8. Integrations

### WhatsApp (free, no Twilio)
- Library: `@whiskeysockets/baileys` (MIT)
- Pairing: scan QR code at `/api/whatsapp/baileys/status`
- Send: `POST /api/whatsapp/baileys/send`
- Daily digest: low-stock + near-expiry alerts sent automatically via Vercel Cron
- For Vercel: requires external Baileys gateway (Railway/Render free tier) — see `scripts/baileys-server.js`

### Voice calls (free, no Twilio)
- Library: FreeSWITCH (MIT) or Asterisk (GPL)
- `POST /api/voice/call` with `action: 'call'` (phone) or `action: 'video_room'` (Jitsi)
- For Vercel: requires external voice gateway — see `scripts/voice-gateway.js`
- Fallback: returns `tel:` deep link if no gateway configured

### Video calls (free)
- Library: Jitsi Meet (Apache 2.0)
- `POST /api/voice/call` with `action: 'video_room'` returns a Jitsi room URL
- Works in any browser, no app install

### Email
- Library: `nodemailer`
- Supports Gmail (legacy) OR any SMTP provider (Outlook/SendGrid/SES/Mailgun/Zoho)
- `SMTP_*` env vars take precedence over `GMAIL_*` when both set
- Templates: password reset, sale receipt, low-stock alert

### Supabase Storage
- Library: `@supabase/storage-js`
- Backups uploaded to a private bucket after writing to `/tmp`
- Signed URLs (1-hour expiry) for on-demand download
- `GET /api/backup?download=<filename>` redirects to signed URL

### Upstash Redis
- Library: `@upstash/redis`
- Distributed rate limiting (cross-instance)
- Falls back to in-memory if not configured

---

## 9. Operations

### Daily cron (Vercel Cron)
- Schedule: `0 23 * * *` (daily at 23:00 UTC, configurable in `vercel.json`)
- Endpoint: `GET/POST /api/cron/backup?secret=<CRON_SECRET>`
- Runs:
  1. Full backup per owner → Supabase Storage
  2. Audit log retention cleanup
  3. Low-stock + near-expiry WhatsApp/email digest per owner

### Backups
- Types: `full`, `inventory`, `sales`, `purchases`, `range` (weekly/monthly/custom)
- JSON + Excel (for inventory + full)
- `POST /api/backup` with `type: 'full'`
- `POST /api/backup` with `type: 'range', preset: 'weekly'`
- `POST /api/backup` with `type: 'restore', filename: '...'` (transactional restore)
- `DELETE /api/backup?filename=...` (deletes from local + remote)

### Factory reset
- `POST /api/reset-database` (owner-only, requires `confirm: 'DELETE'` in body)
- Wipes ALL data EXCEPT the owner account
- Backups preserved by default (opt-in to delete via `deleteBackups: true`)

### PWA
- Installable on mobile/desktop via `manifest.json`
- Icons: 192px + 512px

### UI/UX
- Dark mode (system preference detection)
- Command palette (Cmd+K) for quick navigation
- Toast notifications for success/error feedback
- Mobile-responsive (drawer nav on mobile)
- Session expiry warning (pre-emptive logout warning)

---

## 10. Customization

### Field-level permissions
- Owner can hide/show fields per role (e.g. hide `costPrice` from staff)
- `POST /api/customization` with `{ customization: { fields: { costPrice: { owner: true, user: false } } } }`

### Page-level permissions
- Owner can hide/show pages per role (e.g. hide `reports` from staff)
- Same endpoint, `pages` key

### Tax rate catalog
- Per-category GST rates (e.g. "Brakes" → 28%, "Engine" → 18%)
- `POST /api/tax-rates` with `{ category, rate, hsnCode }`
- Auto-looked-up on sale creation if no explicit `taxRate` passed
