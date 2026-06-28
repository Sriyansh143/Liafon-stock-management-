# Developer Guide — Liafon Stock Management

> This folder contains **developer-only** files. Do NOT share these
> with end users. These files give you (the developer) control over
> license activation, deactivation, and deployment.

---

## What's in this folder

| File | Purpose |
|------|---------|
| `DEVELOPER-GUIDE.md` | This file — everything you need to know |
| `LICENSE-MANAGEMENT.md` | How to activate/deactivate licenses |
| `DEPLOYMENT-GUIDE.md` | Step-by-step installation for system, mobile, cloud |
| `PLUGINS-AND-EXTENSIONS.md` | How to connect plugins and extensions |
| `manage-license.js` | License management script (copy to project root to use) |

---

## Quick Reference

### Activate a customer's license
```bash
cd C:\Users\SRIYAANSH\Downloads\Liafon-Stock-Management\liafon-app
node scripts/manage-license.js activate LIAFON-UNIQUE-KEY "Customer Name" 365
```

### Deactivate (when maintenance not paid)
```bash
node scripts/manage-license.js deactivate "Monthly maintenance not paid"
```

### Check license status
```bash
node scripts/manage-license.js status
```

### Set expiry to 30 days
```bash
node scripts/manage-license.js expiry 30
```

---

## How the License System Works

1. **First install**: App starts in 30-day trial mode (automatic)
2. **After trial**: App locks — user sees "Trial expired" screen
3. **You activate**: Run `manage-license.js activate` on their machine
4. **Monthly check**: If they don't pay, run `manage-license.js deactivate`
5. **User sees lock**: Within 5 minutes, the app shows "Access Locked"
6. **They pay**: Run `activate` again to restore access

The license is stored in the SQLite database (`AppSetting` table).
The user CANNOT change it from the UI — only you can, using the
script or the API with your `LIAFON_DEV_KEY`.

### Security notes
- Change `LIAFON_DEV_KEY` in `.env` for each deployment (don't use the default)
- The key is checked on every POST to `/api/license`
- The client checks `/api/license` every 5 minutes
- If the DB is deleted, the trial restarts (you'd need to re-activate)

---

## What to Give the Customer

When delivering the app to a customer, give them:

1. **The zip file** (`Liafon-Stock-Management-v3.15.0.zip`)
2. **Installation instructions** (from `DEPLOYMENT-GUIDE.md` → "User Installation" section)
3. **Their license key** (after you run `activate` on their machine)

Do NOT give them:
- This DEVELOPER folder
- The `manage-license.js` script
- The `LIAFON_DEV_KEY` value
- Access to the database directly

---

## File Structure

```
liafon-app/
├── DEVELOPER/              ← YOU ONLY (don't share with customer)
│   ├── DEVELOPER-GUIDE.md  ← This file
│   ├── LICENSE-MANAGEMENT.md
│   ├── DEPLOYMENT-GUIDE.md
│   ├── PLUGINS-AND-EXTENSIONS.md
│   └── manage-license.js   ← Copy to project root to use
├── scripts/
│   ├── manage-license.js   ← Working copy (used by the app)
│   ├── generate-icons.js
│   ├── build-package.sh
│   └── package.sh
├── src/                    ← App source code
├── prisma/                 ← Database schema
├── public/                 ← Icons, manifest
├── .env.example            ← Configuration template
├── start.bat               ← User runs this to start the app
├── start.sh                ← Linux/macOS equivalent
├── DATABASE.md             ← User documentation
├── MOBILE_SETUP.md         ← Mobile installation guide
├── OPENWA_SETUP.md         ← WhatsApp setup guide
├── ROADMAP.md              ← Feature roadmap
└── CHANGELOG.md            ← Version history
```
