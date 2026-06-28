# Cloud License Server Setup Guide

## Overview

The cloud license system lets you (the developer) validate licenses
from a central server. Each installation checks the cloud server to
verify its license is still active. If you deactivate a license on
the cloud server, all installations using that key are locked within
5 minutes.

## Architecture

```
┌─────────────────────┐      HTTP GET       ┌──────────────────┐
│  Customer's App     │ ──────────────────→ │  Your Cloud      │
│  (local install)    │   /api/cloud-license│  License Server  │
│                     │ ←────────────────── │  (Vercel/free)   │
│  Checks every 5 min │   { active: true }  │                  │
└─────────────────────┘                     └──────────────────┘
```

## Setup Steps

### Step 1: Deploy the License Server

1. Create a new Vercel project (free):
   - Go to https://vercel.com → New Project
   - Create a blank project named `liafon-license-server`
   - Add a single API route: `api/cloud-license.js`

2. The API route code (copy this into the Vercel project):

```javascript
// api/cloud-license.js (on your separate Vercel project)
// A simple key-value license store.

// In production, use a database (Supabase, etc).
// For simplicity, this uses an in-memory Map (resets on cold start).
// For production, replace with a Supabase query.

const licenses = new Map();

// Pre-seed with a test license
licenses.set('LIAFON-TEST-001', {
  active: true,
  customer: 'Test Customer',
  expiresAt: '2027-12-31',
  key: 'LIAFON-TEST-001'
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ error: 'License key required' });
    }
    const license = licenses.get(key);
    if (!license) {
      return res.status(200).json({ active: false, message: 'Invalid license key' });
    }
    // Check expiry
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      return res.status(200).json({ active: false, message: 'License expired' });
    }
    return res.status(200).json(license);
  }

  if (req.method === 'POST') {
    const { devKey, action, key, customer, expiresInDays } = req.body;
    const expectedKey = process.env.DEV_KEY || 'liafon-dev-master-2024';

    if (devKey !== expectedKey) {
      return res.status(403).json({ error: 'Invalid developer key' });
    }

    if (action === 'activate') {
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null;
      licenses.set(key, { active: true, customer, expiresAt, key });
      return res.status(200).json({ success: true, message: 'License activated' });
    }

    if (action === 'deactivate') {
      if (licenses.has(key)) {
        licenses.set(key, { ...licenses.get(key), active: false });
      }
      return res.status(200).json({ success: true, message: 'License deactivated' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

3. Set environment variable on Vercel:
   - `DEV_KEY` = your secret developer key

4. Deploy → get URL like `https://liafon-license-server.vercel.app`

### Step 2: Configure the App

Add to the customer's `.env`:
```
CLOUD_LICENSE_URL=https://liafon-license-server.vercel.app
CLOUD_LICENSE_KEY=LIAFON-TEST-001
```

### Step 3: How the App Uses It

The app's license check (`/api/license`) does this:
1. Check local license status (trial/activated/deactivated)
2. If `CLOUD_LICENSE_URL` is set, ALSO check the cloud server
3. If the cloud says `active: false`, lock the app (even if local says active)
4. The cloud check is cached for 5 minutes (to avoid hammering the server)

### Step 4: Managing Licenses

To activate a customer on the cloud:
```bash
curl -X POST https://liafon-license-server.vercel.app/api/cloud-license \
  -H "Content-Type: application/json" \
  -d '{"devKey":"your-dev-key","action":"activate","key":"LIAFON-CUST-001","customer":"My Shop","expiresInDays":365}'
```

To deactivate (maintenance not paid):
```bash
curl -X POST https://liafon-license-server.vercel.app/api/cloud-license \
  -H "Content-Type: application/json" \
  -d '{"devKey":"your-dev-key","action":"deactivate","key":"LIAFON-CUST-001"}'
```

To check status:
```bash
curl https://liafon-license-server.vercel.app/api/cloud-license?key=LIAFON-CUST-001
```

## Fallback Behavior

- If the cloud server is unreachable (network error), the app falls
  back to the LOCAL license status (doesn't lock users out due to
  network issues)
- If `CLOUD_LICENSE_URL` is not set, only local license is used
- The cloud check timeout is 5 seconds (doesn't slow down the app)

## Production Recommendations

1. **Use a database** (Supabase free tier) instead of in-memory Map
   for the license server — the Map resets on cold starts
2. **Rate-limit** the license check endpoint (Vercel does this
   automatically on free tier)
3. **Use HTTPS** (Vercel provides this automatically)
4. **Keep the DEV_KEY secret** — don't commit it to Git
