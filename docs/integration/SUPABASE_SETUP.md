# Supabase Integration Guide

> How to connect Liafon Stock Management to Supabase PostgreSQL

---

## Step 1: Create Supabase Project

1. Go to https://supabase.com → sign up (free)
2. Click **New Project**
3. Name: `liafon-prod`
4. Database password: choose a strong password
5. Region: closest to your users (Mumbai for India)
6. Click **Create**

## Step 2: Get Connection String

1. Go to **Settings → Database**
2. Find **Connection string** (URI format)
3. Copy it — looks like:
   ```
   postgresql://postgres:YOUR_PASSWORD@db.xxxxxx.supabase.co:5432/postgres
   ```

## Step 3: Set DATABASE_URL

### For local development:
Edit `.env` file:
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxxx.supabase.co:5432/postgres
```

### For Vercel:
Go to Vercel → Settings → Environment Variables → add:
```
DATABASE_URL = postgresql://postgres:YOUR_PASSWORD@db.xxxxxx.supabase.co:5432/postgres
```

## Step 4: Push Schema

```bash
npx prisma db push
npx prisma generate
```

This creates all tables: User, License, SparePart, Sale, Purchase, StockLog, ActivityLog, AppSetting, Department, Customer, Supplier, PasswordReset

## Step 5: Enable Supabase Auth (Optional — for Gmail OAuth)

1. Go to **Authentication → Providers**
2. Enable **Google**
3. Add your OAuth credentials (Client ID + Secret from Google Cloud Console)
4. Set redirect URL to: `https://your-app.vercel.app/api/auth/callback`

## Step 6: Set Up RLS Policies (Optional — for direct Supabase access)

If you want to use Supabase client-side (e.g., for real-time subscriptions), enable Row Level Security:

```sql
-- Enable RLS on all tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SparePart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
-- ... repeat for all tables

-- Policy: users can only see their own owner's data
CREATE POLICY "owner_isolation" ON "SparePart"
  FOR SELECT USING (auth.uid()::text = ownerId);
```

> Note: The app currently uses Prisma (server-side) for all DB access, so RLS is optional. It's only needed if you add client-side Supabase queries.
