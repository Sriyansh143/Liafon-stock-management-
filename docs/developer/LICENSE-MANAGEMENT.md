# License Management — Developer Guide

## Overview

The license system lets you (the developer) control who can use the
app. It works by storing license status in the database — the app
checks it every 5 minutes and shows a lock screen if deactivated.

## How It Works

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  First Install │──→│  Trial (30 days)  │──→│  Locked     │
│  (automatic)   │    │  App works fully  │    │  (expired)  │
└──────────────┘     └────────┬─────────┘     └──────┬──────┘
                              │                        │
                     Developer runs:          Developer runs:
                     activate                 activate
                              │                        │
                              ▼                        ▼
                     ┌──────────────────┐     ┌─────────────┐
                     │  Licensed         │←────│  Restored   │
                     │  (1 year expiry)  │     │             │
                     └────────┬─────────┘     └─────────────┘
                              │
                     Maintenance not paid?
                     Developer runs: deactivate
                              │
                              ▼
                     ┌──────────────────┐
                     │  LOCKED           │
                     │  User sees:       │
                     │  "Contact dev"    │
                     └──────────────────┘
```

## Commands

All commands are run from the project root (`liafon-app/`).

### Check current license
```bash
node scripts/manage-license.js status
```
Output:
```
=== License Status ===
  Active: true
  Key: LIAFON-ABC123
  Customer: My Shop
  Expires: 2027-06-21T13:38:20.888Z
  First Install: 2026-06-21T08:51:10.621Z
```

### Activate a license
```bash
node scripts/manage-license.js activate <key> <customer> <days>
```
Example:
```bash
node scripts/manage-license.js activate LIAFON-MYSHOP-2024 "My Auto Parts Shop" 365
```
- `<key>`: A unique license key (you generate this — any string)
- `<customer>`: Customer name (for your records)
- `<days>`: Number of days until expiry (365 = 1 year)

### Deactivate a license
```bash
node scripts/manage-license.js deactivate "<reason>"
```
Example:
```bash
node scripts/manage-license.js deactivate "Monthly maintenance not paid for June"
```
The user will see a lock screen within 5 minutes.

### Set expiry
```bash
node scripts/manage-license.js expiry <days>
```
Example:
```bash
node scripts/manage-license.js expiry 30
```
Sets expiry to 30 days from now. When it passes, the app auto-locks.

## API (for remote management)

If the app is hosted online (Vercel), you can manage the license
remotely via the API:

```bash
# Activate
curl -X POST https://your-app.vercel.app/api/license \
  -H "Content-Type: application/json" \
  -d '{"devKey":"your-dev-key","action":"activate","licenseKey":"LIAFON-KEY","customer":"Shop","expiresInDays":365}'

# Deactivate
curl -X POST https://your-app.vercel.app/api/license \
  -H "Content-Type: application/json" \
  -d '{"devKey":"your-dev-key","action":"deactivate","reason":"Not paid"}'

# Check
curl https://your-app.vercel.app/api/license
```

## Security

- The `LIAFON_DEV_KEY` in `.env` protects the POST endpoint
- **Change this key** for each deployment — don't use the default
- The GET endpoint is public (the app needs to check it)
- The user cannot change the license from the UI
- If the user deletes the database, the trial restarts (you'd need
  to re-activate)

## Monthly Maintenance Workflow

1. **Customer pays** → run `activate` with 365 days
2. **Customer doesn't pay** → run `deactivate` with reason
3. **Customer pays late** → run `activate` again
4. **Customer wants to stop** → run `deactivate` permanently

## Trial Period

- 30 days from first install (automatic)
- After 30 days, the app locks
- The user sees: "Trial period expired. Please contact your developer."
- You can extend the trial by running: `expiry 15` (adds 15 more days)
