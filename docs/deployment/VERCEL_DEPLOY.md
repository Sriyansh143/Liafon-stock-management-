# Vercel Deployment Guide

> Step-by-step guide to deploy Liafon Stock Management to Vercel

---

## Prerequisites

- Vercel account (https://vercel.com — free)
- Supabase PostgreSQL database (see `docs/integration/SUPABASE_SETUP.md`)
- GitHub account (private repo recommended)

## Step 1: Prepare .env

Edit `.env` to use your Supabase PostgreSQL connection:
```env
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres
LIAFON_DEV_KEY=your_32_char_random_key
BACKUP_ENCRYPTION_KEY=your_32_char_random_key
ACTIVITY_LOG_PEPPER=your_32_char_random_key
REGISTRATION_PEPPER=your_32_char_random_key
MAX_OWNERS_PER_IP=1
NODE_ENV=production
```

## Step 2: Push Schema to Supabase

```bash
npx prisma db push
npx prisma generate
```

## Step 3: Push to GitHub

```bash
git init
git add .
git commit -m "Liafon Stock Management v3.19 — Production ready"
git remote add origin https://github.com/YOUR_USERNAME/liafon-stock-management.git
git push -u origin main
```

## Step 4: Deploy to Vercel

```bash
# CRITICAL: Run from the project directory, NOT your home folder
cd /path/to/Liafon-Stock-Management
vercel --prod
```

When prompted:
- Set up and deploy? → Y
- Link to existing project? → N (first time) or Y (if redeploying)
- Project name? → liafon-stock-management
- Directory? → ./ (press Enter)

## Step 5: Set Environment Variables

Go to Vercel dashboard → your project → Settings → Environment Variables

Add ALL of these (select Production + Preview + Development for each):

| Name | Value |
|------|-------|
| DATABASE_URL | postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres |
| LIAFON_DEV_KEY | your_dev_key (min 16 chars) |
| BACKUP_ENCRYPTION_KEY | your_encryption_key |
| ACTIVITY_LOG_PEPPER | your_pepper |
| REGISTRATION_PEPPER | your_registration_pepper |
| MAX_OWNERS_PER_IP | 1 |
| NODE_ENV | production |
| DEFAULT_CURRENCY | INR |

## Step 6: Redeploy

```bash
vercel --prod
```

Or: Vercel dashboard → Deployments → ⋯ → Redeploy

## Step 7: Verify

1. Open your Vercel URL
2. Create owner account → 7-day trial starts
3. Dashboard loads → app is live!

## Step 8: Activate License (Optional)

```bash
# Set DATABASE_URL to Supabase
export DATABASE_URL="postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres"

# Activate 365-day license
node scripts/manage-license.js activate LIAFON-MYSHOP-2026 "My Shop" 365
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| EACCES: docker-secrets-engine | Run `vercel` from project dir, not home folder |
| PrismaClientInitializationError | DATABASE_URL not set in Vercel env vars |
| Build failed | Ensure `postinstall: prisma generate` is in package.json |
| 404 on API routes | Vercel auto-detects Next.js — ensure no vercel.json conflicts |
| License lock screen | Run `manage-license.js activate` to activate license |
