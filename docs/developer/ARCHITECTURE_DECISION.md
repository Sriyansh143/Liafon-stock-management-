# Architectural Decision: PostgreSQL vs Firebase Firestore

> **Status**: DECIDED — Staying with PostgreSQL (Supabase) for v3.19+

---

## 🎯 The Decision

After careful analysis of the trade-offs between relational (PostgreSQL) and NoSQL (Firestore) databases for the Liafon Stock Management app, we have decided to **stay with PostgreSQL on Supabase** for the foreseeable future.

## 📊 Why NOT Firebase Firestore (Yet)

While Firestore is excellent for real-time apps and unlimited scaling, it introduces critical limitations for a business management app:

### 1. No SQL Aggregations (Critical)
The app's dashboard relies heavily on:
- `SUM(totalPrice) GROUP BY date` (sales trend charts)
- `SUM(quantity) GROUP BY partId ORDER BY SUM(quantity) DESC` (top-selling parts)
- `COUNT(*) GROUP BY category` (category distribution)

In Firestore, these require either:
- **Fetching ALL documents and aggregating in Node.js** (memory-intensive, slow for 10k+ sales)
- **Maintaining counter documents via Cloud Functions** (complex, error-prone, hard to backfill)

### 2. No Joins
Sales need to display part names and numbers. In PostgreSQL:
```sql
SELECT Sale.*, SparePart.name FROM Sale JOIN SparePart ON Sale.partId = SparePart.id
```

In Firestore, you must **denormalize** — store `partName` and `partNumber` directly inside every `Sale` document. If a part's name changes, you must update ALL historical sale documents (expensive, slow).

### 3. No `createMany` Equivalent
Prisma's `createMany` inserts 10,000 rows in one query. Firestore requires `WriteBatch` (max 500 operations per batch). A 10,000-row CSV import needs 20 sequential batch commits.

### 4. Migration Cost
Rewriting all 20+ API routes from Prisma to Firestore Admin SDK is 40-60 hours of work with high regression risk.

## ✅ Why PostgreSQL (Supabase) Wins for This App

| Feature | PostgreSQL | Firestore |
|---------|-----------|-----------|
| Complex aggregations | ✅ Native (`GROUP BY`, `SUM`) | ❌ Must fetch all docs |
| Joins | ✅ Native (`JOIN`) | ❌ Must denormalize |
| Bulk insert | ✅ `createMany` (10k rows) | ❌ `WriteBatch` (500 max) |
| Transaction safety | ✅ ACID transactions | ⚠️ Limited (document-level only) |
| Cost at scale | ⚠️ Connection limits | ✅ Scales infinitely |
| Real-time | ⚠️ Supabase Realtime (newer) | ✅ Native real-time |
| Migration effort | ✅ Already done | ❌ 40-60 hours rewrite |

## 🔧 Vercel Serverless Optimizations (Implemented)

To address Vercel's serverless limitations WITHOUT migrating to Firestore:

### 1. Connection Pooling (PgBouncer)
- **Problem**: Vercel opens a new function per request → 100 connections crash Supabase
- **Solution**: Use Supabase's Connection Pooler (port 6543)
- **Implementation**: `src/lib/db.ts` now documents the pooler URL requirement

**Set in .env / Vercel:**
```
DIRECT_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1
```

### 2. Batch CSV Import (Avoid 60s Timeout)
- **Problem**: Single `createMany` of 10,000 rows times out on Vercel (60s limit)
- **Solution**: Insert in batches of 500 rows in a loop
- **Implementation**: `src/app/api/import/route.ts` now uses `BATCH_SIZE = 500`

### 3. Polling Optimization
- **Problem**: Polling every 60s wastes serverless compute
- **Solution**: Already implemented — polling pauses when tab is hidden
- **Future**: Can upgrade to Supabase Realtime (Postgres Changes) without changing database

## 🚀 Future Migration Path (If Needed)

If the app grows beyond Supabase's limits (500MB free tier, 8GB paid tier):

1. **Phase 1** (Now): PostgreSQL on Supabase with connection pooling ✅
2. **Phase 2** (1000+ users): Upgrade to Supabase Pro ($25/mo) for 8GB
3. **Phase 3** (10,000+ users): Migrate to dedicated PostgreSQL (Neon, Railway, or AWS RDS)
4. **Phase 4** (100,000+ users): Consider sharding by ownerId across multiple databases

Firestore is NOT required at any stage — PostgreSQL scales vertically to handle millions of rows per table.

## 📝 Environment Variables for Vercel

```env
# Supabase Connection Pooler (for Vercel serverless)
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1

# Supabase Direct URL (for Prisma migrations)
DIRECT_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres

# Auth & Security
LIAFON_DEV_KEY=your_32_char_key
ACTIVITY_LOG_PEPPER=your_32_char_pepper
REGISTRATION_PEPPER=your_32_char_pepper
BACKUP_ENCRYPTION_KEY=your_32_char_key
MAX_OWNERS_PER_IP=1
```

---

*Last updated: June 2026*
