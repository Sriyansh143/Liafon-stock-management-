# Mobile App Installation Guide

Liafon Stock Management is a **PWA (Progressive Web App)** — it installs
on your phone like a native app but runs in the browser. No app store,
no separate codebase, no 50MB download. The entire app is under 400KB.

---

## Option 1: Install on Your Home WiFi (Easiest, Free)

Works when your phone and computer are on the **same WiFi network**.

### Android (Chrome / Edge)

1. Start the app on your computer: double-click `start.bat`
2. Find your computer's IP address:
   - Open Command Prompt → type `ipconfig` → look for "IPv4 Address"
   - Example: `192.168.29.209`
3. On your phone, open **Chrome** and go to:
   ```
   http://192.168.29.209:3000
   ```
4. Log in with your owner account
5. Tap the **three dots menu** (⋮) in Chrome
6. Tap **"Install app"** or **"Add to Home screen"**
7. Tap **Install**

The Liafon app now appears on your home screen with its own icon.
Tap it to open — it runs full-screen like a native app.

### iPhone / iPad (Safari)

1. Start the app on your computer: double-click `start.bat`
2. Find your computer's IP address (same as above)
3. On your iPhone, open **Safari** and go to:
   ```
   http://192.168.29.209:3000
   ```
4. Log in with your owner account
5. Tap the **Share button** (square with up arrow, at the bottom)
6. Scroll down and tap **"Add to Home Screen"**
7. Tap **Add**

The Liafon app now appears on your home screen with its own icon.

> **Note for iOS**: You MUST use Safari — Chrome/Firefox on iOS can't
> install PWAs. The PWA will work offline for the UI, but needs the
> network to fetch data from your computer.

---

## Option 2: Access From Anywhere (Free, No Hosting)

If you want to access the app from **outside your home WiFi** (e.g., from
your shop, from a different city), use a free tunneling service.

### Cloudflare Tunnel (Recommended — Free, No Signup)

1. Download Cloudflare Tunnel:
   - **Windows**: Download from https://github.com/cloudflare/cloudflared/releases/latest (download `cloudflared-windows-amd64.exe`)
   - **Mac**: `brew install cloudflare/cloudflare/cloudflared`
   - **Linux**: `sudo apt install cloudflared`

2. Start your app: `start.bat` (or `npm run dev`)

3. Open a new terminal and run:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

4. Cloudflare prints a URL like:
   ```
   https://random-words-123.trycloudflare.com
   ```

5. Open that URL on your phone from **anywhere in the world**.
   Install it as a PWA (same steps as Option 1 above).

**Pros**: Completely free, no signup, no credit card, no expiry.
**Cons**: The URL changes each time you restart the tunnel (not suitable
for production — use Option 3 below for permanent hosting).

### ngrok (Alternative — Free Tier)

1. Sign up at https://ngrok.com (free)
2. Download ngrok
3. Run:
   ```bash
   ngrok http 3000
   ```
4. Copy the `https://xxxx.ngrok.io` URL
5. Open on your phone from anywhere

**Free tier limits**: Random URL, 40 connections/minute.

---

## Option 3: Permanent Free Hosting (Vercel + Supabase)

If you want the app online 24/7 with a permanent URL, use free hosting.

### Step 1: Free PostgreSQL Database (Supabase)

1. Go to https://supabase.com → Sign up (free, GitHub/Google login)
2. Create a new project (free tier: 500MB database)
3. Go to Settings → Database → Connection string → copy the **URI**
4. It looks like: `postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres`

### Step 2: Update Your App for PostgreSQL

1. Edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. Set the DATABASE_URL in your `.env`:
   ```
   DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
   ```

3. Run:
   ```bash
   npx prisma db push
   ```

### Step 3: Deploy to Vercel (Free)

1. Push your code to GitHub (create a free repo at https://github.com)
2. Go to https://vercel.com → Sign up with GitHub
3. Click "New Project" → Import your repo
4. Vercel auto-detects Next.js — just click "Deploy"
5. Set environment variables in Vercel:
   - `DATABASE_URL` = your Supabase connection string
   - `DEFAULT_CURRENCY` = `INR`
   - `NODE_ENV` = `production`
6. Deploy — you get a permanent URL like `liafon.vercel.app`

7. Open `https://liafon.vercel.app` on your phone → Install as PWA

**Pros**: Permanent URL, HTTPS (required for camera/PWA), free 24/7 hosting.
**Cons**: Requires switching from SQLite to PostgreSQL (code change).

---

## Why PWA Instead of a Native App?

| Feature | PWA (this app) | Native App (React Native/Flutter) |
|---------|----------------|-----------------------------------|
| **App Store** | Not needed | $99/year (Apple) + review process |
| **Install size** | < 1MB | 20-50MB |
| **Updates** | Instant (refresh) | Days/weeks (App Store review) |
| **Offline** | Yes (cached UI) | Yes |
| **Camera** | Yes (WebRTC) | Yes |
| **Push notifications** | Yes (via service worker) | Yes |
| **Codebase** | One (Next.js) | Two (web + mobile) |
| **Cost** | $0 | $99-300/year |
| **Development time** | Already done | 2-4 months |

The PWA approach gives you 95% of a native app's functionality for $0
and zero extra development. The only things PWAs can't do:
- Background processing (e.g., auto-sync while app is closed)
- Bluetooth/NFC access (not needed for this app)
- App Store discovery (you install via URL, not by searching the store)

---

## Troubleshooting

### "Cannot connect" on phone
- Make sure your computer is on and `npm run dev` is running
- Make sure phone and computer are on the **same WiFi**
- Check Windows Firewall: allow Node.js through (Settings → Firewall → Allow app)
- Try `http://[your-ip]:3000` (not `https://`)
- If still blocked, add your IP to `.env`: `LIAFON_DEV_ORIGIN=192.168.29.209`

### "Install app" not showing in Chrome
- You must visit the site at least twice (Chrome's engagement check)
- Clear browser cache and try again
- Make sure you're using HTTP or HTTPS (not `file://`)

### "Add to Home Screen" not showing in Safari
- You MUST use Safari (not Chrome on iOS)
- iOS 11.3+ required for PWA support
- Tap the Share icon (not the address bar)

### App icon doesn't appear
- The app now generates PNG icons (192px + 512px) automatically
- Run `node scripts/generate-icons.js` to regenerate if needed
- Hard-refresh the page on your phone after updating icons

### Camera doesn't work (for barcode scanning)
- Camera API requires **HTTPS** or **localhost**
- On LAN (HTTP), camera is blocked by browser security
- Use Cloudflare Tunnel (Option 2) to get HTTPS for free

---

## Free Resources Used

This app uses only free, open-source software:

| Tool | License | Purpose |
|------|---------|---------|
| Next.js | MIT | Web framework |
| React | MIT | UI library |
| Prisma | Apache-2.0 | Database ORM |
| SQLite | Public Domain | Database (built-in) |
| Tailwind CSS | MIT | CSS framework |
| shadcn/ui | MIT | UI components |
| Recharts | MIT | Charts |
| SheetJS | Apache-2.0 | Excel import/export |
| Nodemailer | MIT | Email (password reset) |
| bcryptjs | MIT | Password hashing |
| Lucide | ISC | Icons |
| Cloudflare Tunnel | Free | HTTPS tunneling |
| Supabase | Free tier | PostgreSQL hosting |
| Vercel | Free tier | App hosting |

No paid services required. No proprietary code. No vendor lock-in.

---

## Quick Summary

| Your Goal | Solution | Cost |
|-----------|----------|------|
| Use on phone at home | Install PWA from `http://[your-ip]:3000` | Free |
| Use from anywhere (temporary) | Cloudflare Tunnel | Free |
| Use from anywhere (permanent) | Vercel + Supabase | Free |
| Barcode scanning | Needs HTTPS → use Cloudflare Tunnel or Vercel | Free |
| Camera-based stock counting | TensorFlow.js (planned) | Free |
