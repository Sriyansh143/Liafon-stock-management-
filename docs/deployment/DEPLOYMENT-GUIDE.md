# Deployment Guide — Step-by-Step Installation

This guide covers installing the app in 4 environments:
1. Desktop/Laptop (Windows)
2. Mobile (Android/iOS)
3. Cloud (Vercel + Supabase)
4. LAN (multiple devices on same WiFi)

---

## 1. Desktop Installation (Windows)

### For the User

1. **Extract the zip**
   ```
   Right-click Liafon-Stock-Management-v3.15.0.zip → Extract All → Extract
   ```

2. **Run the start script**
   ```
   Double-click start.bat
   ```
   This automatically:
   - Installs dependencies (`npm install`)
   - Creates `.env` from `.env.example`
   - Creates the database (`npx prisma db push`)
   - Starts the dev server

3. **Open the app**
   ```
   Open browser → go to http://localhost:3000
   ```

4. **Create owner account**
   - First visit shows "Create Owner Account" form
   - Fill in name, email, password → click Create
   - You're automatically signed in

5. **Load demo data (optional)**
   - Click "Load Data" in the header
   - Seeds 20 sample parts, 5 customers, 5 suppliers

6. **Stop the server**
   - Press `Ctrl+C` in the terminal window
   - Or close the terminal

### Prerequisites
- **Node.js 18.18+**: Download from https://nodejs.org/ (LTS version)
- **Windows 10/11**: 64-bit
- **2GB RAM minimum**

---

## 2. Mobile Installation (Android/iOS)

### Option A: Same WiFi (Free, No Setup)

1. **Start the app on your computer** (see Desktop Installation above)

2. **Find your computer's IP**
   - Open Command Prompt → type `ipconfig`
   - Look for "IPv4 Address" (e.g., `192.168.29.209`)

3. **Allow Node.js through Windows Firewall**
   - Settings → Privacy & Security → Windows Security → Firewall
   - "Allow an app through firewall" → Find Node.js → Check ✓ both Private and Public

4. **On your phone:**
   - **Android**: Open Chrome → go to `http://192.168.29.209:3000`
   - **iPhone**: Open Safari → go to `http://192.168.29.209:3000`

5. **Install as an app:**
   - **Android**: Chrome menu (⋮) → "Install app"
   - **iPhone**: Safari → Share button → "Add to Home Screen"

The app now appears on your home screen with the Liafon icon.

### Option B: Cloudflare Tunnel (Access from Anywhere, Free)

1. Download Cloudflare Tunnel:
   - https://github.com/cloudflare/cloudflared/releases/latest
   - Download `cloudflared-windows-amd64.exe`

2. Start the app on your computer (`start.bat`)

3. Open a new terminal and run:
   ```bash
   cloudflared.exe tunnel --url http://localhost:3000
   ```

4. Copy the URL it gives you:
   ```
   https://random-words-1234.trycloudflare.com
   ```

5. Open that URL on your phone from **anywhere** → Install as PWA

### Option C: Cloud Deployment (Permanent URL)

See section 3 below.

---

## 3. Cloud Deployment (Vercel + Supabase, Free)

### Step 1: Get Free PostgreSQL Database

1. Go to https://supabase.com → Sign up (free, GitHub login)
2. Create a new project (free tier: 500MB)
3. Go to Settings → Database → Connection string → copy URI
   ```
   postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
   ```

### Step 2: Update App for PostgreSQL

1. Edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"   // change from "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. Set environment variables (for local testing):
   ```
   DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
   ```

3. Push schema to Supabase:
   ```bash
   npx prisma db push
   ```

### Step 3: Deploy to Vercel

1. Push code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/liafon.git
   git push -u origin main
   ```

2. Go to https://vercel.com → Sign up with GitHub

3. Click "New Project" → Import your repo

4. Set environment variables:
   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Your Supabase connection string |
   | `DEFAULT_CURRENCY` | `INR` |
   | `NODE_ENV` | `production` |
   | `LIAFON_DEV_KEY` | Your secret developer key |
   | `GMAIL_USER` | Your Gmail (for password reset) |
   | `GMAIL_APP_PASSWORD` | Your Gmail app password |

5. Click "Deploy"

6. Your app is now live at `https://liafon-xxx.vercel.app`

7. Open on phone → Install as PWA

### Step 4: Activate License

```bash
curl -X POST https://liafon-xxx.vercel.app/api/license \
  -H "Content-Type: application/json" \
  -d '{"devKey":"your-dev-key","action":"activate","licenseKey":"LIAFON-PROD","customer":"Customer Name","expiresInDays":365}'
```

---

## 4. LAN Multi-Device Setup

### Scenario
One computer runs the app. Multiple phones/tablets access it over WiFi.

### Steps

1. **Computer (host):**
   - Run `start.bat`
   - Note the IP: `ipconfig` → `192.168.29.209`
   - Allow Node.js through firewall

2. **Each device:**
   - Open `http://192.168.29.209:3000` in browser
   - Log in with their account (owner creates users)
   - Install as PWA (Add to Home Screen)

3. **Multiple users:**
   - Owner: Settings → Users → Add User
   - Create accounts for staff (role: user), manager (role: manager)
   - Each person logs in with their own account on their phone

4. **Data sync:**
   - All devices share the same database (on the host computer)
   - Changes appear on other devices within 15 seconds (auto-refresh)
   - No internet needed — works on local WiFi only

---

## 5. Plugins and Extensions

See `PLUGINS-AND-EXTENSIONS.md` for connecting:
- WhatsApp (OpenWA)
- Gmail (password reset emails)
- Barcode scanner (camera)
- Excel import/export (SheetJS)
- Cloud tunneling (Cloudflare/ngrok)
- Database hosting (Supabase)
- App hosting (Vercel)

---

## Troubleshooting

### "Cannot connect" on phone
1. Check computer is on and `start.bat` is running
2. Check phone and computer are on same WiFi
3. Check Windows Firewall allows Node.js
4. Try `http://` not `https://` for LAN access
5. Check IP is correct: `ipconfig` on computer

### "Install app" not showing
- Visit the site at least twice (Chrome's engagement requirement)
- Use Chrome (Android) or Safari (iOS) — other browsers may not support PWA install
- Clear browser cache and retry

### App not loading after install
- Hard refresh: hold the app icon → App info → Clear cache
- Or: remove from home screen → re-open in browser → reinstall

### Database errors
```bash
# Reset database completely
rm data/liafon.db
npx prisma db push
npm run dev
# → First-run setup will appear
```
