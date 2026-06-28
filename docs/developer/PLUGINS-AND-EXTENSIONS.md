# Plugins and Extensions

This guide covers connecting optional plugins and extensions to
enhance the app's functionality.

---

## 1. WhatsApp Integration (OpenWA)

### What it does
Sends WhatsApp messages directly from the app (instead of opening
wa.me links that require manual "Send" click).

### Setup (Without Docker)

1. **Clone OpenWA:**
   ```bash
   cd C:\Users\SRIYAANSH
   git clone https://github.com/openwa/openwa.git
   cd openwa
   npm install
   npm start
   ```

2. **Scan QR code:**
   - Open WhatsApp on your phone
   - Settings → Linked Devices → Link a Device
   - Scan the QR code in the terminal

3. **Copy API key:**
   - OpenWA shows: `Server is running on http://localhost:2785`
   - API Key is shown in the terminal output

4. **Add to Liafon `.env`:**
   ```
   OPENWA_API_URL=http://localhost:2785/api
   OPENWA_API_KEY=your-api-key-here
   OPENWA_SESSION=default
   ```

5. **Restart Liafon:**
   ```bash
   npm run dev
   ```

6. **Test:** Settings → WhatsApp → Test Connection

### Setup (With Docker)
See `OPENWA_SETUP.md` in the project root.

### Without OpenWA (Default)
The app uses `wa.me` deep links — opens WhatsApp Web with the message
pre-filled. User clicks "Send" manually. No setup needed.

---

## 2. Gmail (Password Reset Emails)

### What it does
Sends password-reset verification links via Gmail.

### Setup

1. **Enable 2-Step Verification** on your Gmail account
   - https://myaccount.google.com/security

2. **Generate an App Password:**
   - https://myaccount.google.com/apppasswords
   - Select "Mail" → Generate
   - Copy the 16-character password

3. **Add to `.env`:**
   ```
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=your-16-char-password
   APP_BASE_URL=http://192.168.29.209:3000
   ```

4. **Restart the app**

5. **Test:** Login page → "Forgot password?" → Enter email → Check inbox

### Without Gmail
Password reset falls back to "dev mode" — shows the reset link
directly in the UI instead of emailing it.

---

## 3. Barcode Scanner (Camera-Based)

### What it does
Scan a product barcode with the phone camera to look up the part
and open the stock-adjustment dialog.

### Requirements
- **HTTPS or localhost** (browser security requirement for camera)
- Use Cloudflare Tunnel or Vercel for HTTPS on mobile
- Parts must have barcodes entered (Inventory → Edit → Barcode field)

### Planned Implementation (v3.16.0)
- Uses `html5-qrcode` library (free, MIT license)
- Rear camera on mobile, webcam on desktop
- On scan → searches `/api/parts?search=<barcode>` → opens stock dialog

---

## 4. Excel Import/Export (SheetJS)

### Already integrated
- **Import**: Settings → Import tab → Upload .xlsx/.xls/.csv file
- **Export**: Inventory, Sales, Purchases, Reports, Activity Log all
  have "Export CSV" buttons
- **Backup**: Full backups include .xlsx files with inventory + sales sheets

### Column format for import
| PartNumber | Name | Category | Brand | CostPrice | SellingPrice | CurrentStock | MinStockLevel |
|------------|------|----------|-------|-----------|--------------|--------------|---------------|

---

## 5. Cloud Tunneling

### Cloudflare Tunnel (Free, No Signup)
```bash
# Download from: https://github.com/cloudflare/cloudflared/releases
cloudflared.exe tunnel --url http://localhost:3000
# → Get https://random.trycloudflare.com
```

### ngrok (Free Tier)
```bash
# Download from: https://ngrok.com
ngrok http 3000
# → Get https://xxxx.ngrok.io
```

### Use Case
Access the app from outside your WiFi (e.g., from your shop while
the server runs at home). Also provides HTTPS (required for camera
access on mobile).

---

## 6. Database Hosting (Supabase)

### What it does
Moves the database from local SQLite to cloud PostgreSQL — enables
multi-device sync without a dedicated server.

### Setup
1. Sign up at https://supabase.com (free, 500MB)
2. Create project → copy connection string
3. Update `prisma/schema.prisma`: `provider = "postgresql"`
4. Set `DATABASE_URL` in `.env`
5. Run `npx prisma db push`

### Cost: Free (500MB, enough for ~100K transactions)

---

## 7. App Hosting (Vercel)

### What it does
Hosts the app online 24/7 with a permanent URL — no need to keep
your computer running.

### Setup
1. Push code to GitHub
2. Import at https://vercel.com (free)
3. Set environment variables
4. Deploy

### Cost: Free (Hobby tier, 100GB bandwidth/month)

---

## 8. AI Stock Counting (Future)

### Option A: Google Cloud Vision API (Paid)
- ~$1.50 per 1000 images
- Take photo → send to Vision API → count objects
- Best accuracy for general objects

### Option B: TensorFlow.js COCO-SSD (Free, In-Browser)
- Runs entirely in the browser — no server
- Detects 80 common object classes (not auto parts specifically)
- Lower accuracy but completely free

### Option C: Custom YOLO Model (Free, Requires Training)
- 100+ labeled photos per part type
- Train on a GPU (2-4 hours)
- Highest accuracy but most work

### Recommendation
Start with **barcode scanning** (planned v3.16.0) — it's 100x more
accurate than AI counting and 10x faster to implement.

---

## Plugin Summary

| Plugin | Status | Cost | Setup Time |
|--------|--------|------|------------|
| WhatsApp (OpenWA) | ✅ Integrated | Free | 10 min |
| Gmail (password reset) | ✅ Integrated | Free | 5 min |
| Excel import/export | ✅ Integrated | Free | 0 min |
| Cloud tunneling | ✅ Documented | Free | 2 min |
| Supabase (PostgreSQL) | ✅ Documented | Free | 10 min |
| Vercel (hosting) | ✅ Documented | Free | 15 min |
| Barcode scanner | 🔄 Planned v3.16 | Free | — |
| AI stock counting | 📋 Future | $0-$1.50/1K | — |
