# Liafon Stock Management

**Multi-tenant, multi-shop inventory + billing system for Indian auto-parts shops.**

Built with Next.js 16, React 19, TypeScript, Prisma 6, PostgreSQL (Supabase), Tailwind 4, and shadcn/ui. Deploys on Vercel free tier + Supabase free tier + Upstash Redis free tier. Uses **only open-source libraries** — no paid Twilio, no paid SMS, no paid voice APIs.

---

## Quick start

Read **[`docs/INSTALL.md`](docs/INSTALL.md)** for the complete 5-step deployment guide (~30 minutes).

```bash
# 1. Clone + install
git clone <your-repo>
cd liafon
npm install

# 2. Configure env
cp .env.example .env
# Edit .env with your Supabase URLs (see docs/INSTALL.md)

# 3. Apply schema to Supabase
npx prisma db push

# 4. Run locally
npm run dev    # → http://localhost:3000

# 5. Deploy to Vercel
# Import the repo at https://vercel.com/new — see docs/INSTALL.md for env vars
```

---

## Documentation

All docs are in **[`docs/`](docs/)**:

| Document | Purpose |
|---|---|
| [**PROJECT_REPORT.md**](docs/PROJECT_REPORT.md) | What the app can/cannot do — feature matrix + honest limitations |
| [**INSTALL.md**](docs/INSTALL.md) | Step-by-step Vercel + Supabase deployment guide |
| [**FEATURES.md**](docs/FEATURES.md) | Every feature explained with usage notes |
| [**API.md**](docs/API.md) | Every API endpoint documented with request/response examples |
| [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) | Codebase structure, data flow, security model |
| [**ROADMAP.md**](docs/ROADMAP.md) | What's planned, what's out of scope, competitor analysis |

---

## Key features

- **GST-compliant invoicing** — CGST+SGST/IGST auto-split based on shop + customer GSTIN state codes
- **UPI payments** — QR generation + image-upload decoding (works with PhonePe/GPay/Paytm/BHIM)
- **Free WhatsApp** — Send invoices + low-stock alerts via Baileys (no Twilio, no per-message fees)
- **2FA TOTP** — Google Authenticator / Authy / 1Password compatible, with backup codes
- **Product analysis** — Restock recommendations based on sales velocity + profit margin + time in inventory
- **Multi-shop / multi-branch** — Per-shop inventory + branch-wise comparison
- **Purchase Orders** — draft → approve → receive workflow with auto batch creation
- **Stock transfers** — Move stock between shops (auto-creates part at destination)
- **Batch / serial / expiry tracking** — With near-expiry WhatsApp alerts
- **PDF reports** — P&L statement, GSTR-1 summary, inventory valuation
- **Customer credit limits** — With pre-flight enforcement
- **Persistent backups** — Supabase Storage (signed URLs for download)
- **Daily cron** — Auto-backup + audit cleanup + low-stock/expiry digest
- **Item alternatives** — OEM cross-referencing (interchangeable part numbers)

---

## Tech stack (all open source or free-tier)

| Layer | Technology | License |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | MIT |
| UI | React 19 + Tailwind 4 + shadcn/ui | MIT |
| ORM | Prisma 6 | Apache 2.0 |
| Database | PostgreSQL (Supabase) | PostgreSQL License |
| Object storage | Supabase Storage | Apache 2.0 |
| Rate limiting | Upstash Redis | MIT |
| WhatsApp | @whiskeysockets/baileys | MIT |
| Voice | FreeSWITCH / Asterisk | MIT / GPL |
| Video | Jitsi Meet | Apache 2.0 |
| 2FA | otplib | MIT |
| PDF | pdfkit | MIT |
| QR codes | qrcode + jsqr | MIT |
| Barcodes | bwip-js | MIT |
| Email | nodemailer | MIT |
| Hosting | Vercel | Proprietary (free tier) |

**No paid APIs. No Twilio. No SendGrid. No Authy. No AWS SNS.**

---

## License

Proprietary — Liafon Software. Source code provided for the licensed owner's use.

For issues, contact your developer (the `LIAFON_DEV_KEY` holder).
