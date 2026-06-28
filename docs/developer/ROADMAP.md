# Liafon Stock Management — Feature Roadmap

> **Current version**: 3.12.0
> **Last updated**: 2026-06-21

This document outlines what's been implemented, what's in progress, and
what's planned for future versions — including what you need to provide
from your side.

---

## ✅ Already Implemented (v3.12.0)

### Core
- Inventory CRUD with search, filter, low-stock alerts
- Sales with atomic stock decrement + invoice numbers + print
- Purchases with atomic stock increment + invoice numbers
- Dashboard with KPIs + charts + auto-refresh (15s)
- Reports (daily / category / profit / low-stock) with CSV export
- Activity log (paginated, filterable)
- Multi-currency with conversion (static exchange rates)
- PWA installable (works offline)

### Security
- bcrypt password hashing
- Session cookies (7-day expiry, HttpOnly, SameSite)
- Login rate limiting (10 attempts / 5 min)
- Role-based access control (owner / admin / manager / user)
- WhatsApp API auth guards
- Prisma P2002/P2025 → proper HTTP status codes

### Auth
- First-run owner setup
- Self-service password change (Settings → Account)
- Forgot password via Gmail (Nodemailer + verification link)
- Database reset (Settings → Danger Zone)

### Customization
- **Owner/admin can toggle field visibility per role** (Settings → Customize)
  - Cost Price, Profit Margins, Inventory Valuation, Supplier Cost
  - Page access: Dashboard, Inventory, Sales, Purchases, Reports, etc.
- Role-based: staff can't see cost prices/profit; manager can't see Users page

### Charts & Analytics
- Sales trend area chart (30 days)
- Parts by category bar chart
- Stock distribution donut chart (NEW)
- Profit summary card (revenue, cost, net cash flow)
- Top-selling parts list
- Recent activity feed

### Backup & Restore
- Full / inventory / sales / purchases backup (JSON + Excel)
- Scheduled backups: weekly, monthly, custom date range
- Transactional restore
- Delete individual backups
- Auto-backup daily

### Other
- Inventory snapshot (current / last week / last month / custom date)
- CSV export: inventory, sales, purchases, reports, snapshots
- Notifications bell (low-stock + activity + today's sales)
- WhatsApp integration (OpenWA or wa.me fallback)
- Session-expiry interceptor (401 → auto-redirect to login)
- Settings → Customize tab (field/page visibility per role)

---

## 🔄 In Progress / Next Steps

### 1. Barcode Scanner for Stock Counting

**What it does**: Use the device camera to scan a product barcode,
look up the part in the inventory, and open the stock-adjustment dialog
automatically.

**Tech needed**:
- `html5-qrcode` npm package (free, MIT license)
- Uses the device's rear camera (mobile) or webcam (desktop)
- Works in HTTPS or localhost only (browser security requirement)

**Implementation plan**:
1. Add a "Scan Barcode" button on the Inventory page
2. Opens camera in a modal
3. On scan, searches `/api/parts?search=<barcode>`
4. If found, opens the stock-adjustment dialog pre-filled
5. If not found, shows "Part not found" + option to add new

**What you need from your side**:
- Add barcodes to your parts (the `barcode` field already exists in the schema)
- A phone with a camera (or a USB barcode scanner for desktop)
- Access the app via HTTPS or localhost (camera API requires this)

### 2. Live Data Updates (WebSocket)

**What it does**: When a sale is recorded on one device, the dashboard
on all other devices updates instantly (no page refresh needed).

**Tech needed**:
- `socket.io` npm package (free, MIT license)
- WebSocket server alongside the Next.js dev server
- Client-side Socket.io provider

**Implementation plan**:
1. Add `socket.io` server to `server.js`
2. Emit events on sale/purchase/stock-adjust create
3. Client subscribes to events and refetches the affected page
4. Dashboard updates within 1-2 seconds of any change

**What you need from your side**: Nothing — this is a code-only feature.

### 3. Mobile App (Lightweight PWA)

**What it is**: The app is ALREADY a PWA (Progressive Web App) — users
can "Add to Home Screen" on their phone and it runs as a standalone app
with the Liafon icon. No app store needed, no separate codebase.

**What's already there**:
- `manifest.json` with app name, icons, shortcuts
- Offline-capable (system fonts, no external CDN)
- Responsive design (mobile card views, touch-friendly buttons)
- Installable on iOS (Safari → Share → Add to Home Screen) and Android (Chrome → Install)

**To make it feel more native**:
- Add a "pull to refresh" gesture
- Add haptic feedback on button presses (vibration API)
- Add a splash screen
- Cache API responses for offline viewing (Service Worker)

**What you need from your side**: Nothing — just open the app on your
phone in the browser and tap "Install" / "Add to Home Screen".

### 4. AI Stock Counting (Picture-Based)

**What it does**: Take a photo of a shelf of parts, and the AI counts
how many items are there and compares to the database stock level.

**Tech needed**:
- **Option A (easiest)**: Google Cloud Vision API (paid, ~$1.50 per 1000 images)
  - Send photo to Vision API → get object detection results
  - Count detected objects of the same type
  - Compare to `currentStock` in the database
- **Option B (free)**: TensorFlow.js + COCO-SSD model (runs in the browser)
  - Load the COCO-SSD model client-side
  - Run object detection on the camera feed
  - Limitation: COCO-SSD detects 80 common object classes (not auto parts specifically)
- **Option C (custom)**: Train a custom YOLO model on your specific parts
  - Requires 100+ labeled photos per part type
  - Training takes 2-4 hours on a GPU
  - Most accurate but most work

**Recommendation**: Start with barcode scanning (Option 1 above) — it's
100x more accurate than AI counting and 10x faster to implement. AI
counting is a "nice to have" for rough shelf audits but not reliable
enough for inventory management.

**What you need from your side**:
- For Option A: A Google Cloud account + billing ( Vision API costs ~$1.50/1000 images)
- For Option B: Nothing (free, runs in browser) — but limited accuracy
- For Option C: 100+ labeled photos of each part type + a GPU for training

### 5. Excel Import for Sales/Purchases/Departments

**What it does**: Upload an Excel file with sales/purchases/departments
data and have it imported into the database (like the existing parts import).

**Implementation plan**:
1. Extend `/api/import` to accept an `entity` parameter (`parts` / `sales` / `purchases` / `departments`)
2. Each entity has its own column mapping + validation
3. For sales: require `partNumber` (looks up `partId`), `quantity`, `unitPrice`
4. For purchases: require `partNumber`, `quantity`, `unitCost`, `supplierName`
5. For departments: require `name`, `phone`

**What you need from your side**: Nothing — this is a code-only feature.

---

## 📋 What You Need From Your Side (Summary)

### For Gmail Password Reset
1. Enable 2-Step Verification on your Gmail account
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Add to `.env`:
   ```
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=your-16-char-app-password
   APP_BASE_URL=http://your-server-ip:3000
   ```

### For WhatsApp (OpenWA)
1. Either install Docker Desktop OR run OpenWA with Node.js:
   ```bash
   git clone https://github.com/openwa/openwa.git
   cd openwa
   npm install
   npm start
   # Scan the QR code with your phone's WhatsApp
   ```
2. Copy the API key into `.env`:
   ```
   OPENWA_API_URL=http://localhost:2785/api
   OPENWA_API_KEY=your-api-key
   OPENWA_SESSION=default
   ```

### For Barcode Scanning (coming in v3.12.0)
1. Add barcodes to your parts (Inventory → Edit → Barcode field)
2. Access the app via HTTPS or localhost (camera API requirement)
3. A phone with a camera or USB barcode scanner

### For AI Stock Counting (future)
1. For Google Vision API: Google Cloud account + billing
2. For custom model: 100+ labeled photos per part type + GPU for training

### For LAN Access
1. Find your computer's IP (e.g. `192.168.29.209`)
2. Open `http://192.168.29.209:3000` on your phone
3. If HMR is blocked, add the IP to `LIAFON_DEV_ORIGIN` in `.env`

---

## 🏗️ Recommended Next Steps (Priority Order)

1. **v3.12.0** (this release): Customization system + faster dashboard refresh
2. **v3.13.0**: Barcode scanner (camera-based stock lookup)
3. **v3.14.0**: Excel import for sales/purchases/departments
4. **v3.15.0**: WebSocket live updates (instant dashboard refresh)
5. **v3.16.0**: PWA improvements (pull-to-refresh, haptics, offline cache)
6. **Future**: AI stock counting (if barcode scanning isn't sufficient)

---

## 📚 Open-Source Repos Referenced

- **OpenWA**: https://github.com/openwa/openwa (WhatsApp API, MIT)
- **SheetJS**: https://cdn.sheetjs.com/ (Excel import/export, Apache-2.0)
- **Prisma**: https://github.com/prisma/prisma (ORM, Apache-2.0)
- **shadcn/ui**: https://github.com/shadcn-ui/ui (UI components, MIT)
- **Recharts**: https://github.com/recharts/recharts (charts, MIT)
- **html5-qrcode** (planned): https://github.com/mebjas/html5-qrcode (barcode scanning, MIT)
- **Socket.io** (planned): https://github.com/socketio/socket.io (WebSocket, MIT)
