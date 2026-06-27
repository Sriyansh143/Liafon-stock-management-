-- ─────────────────────────────────────────────────────────────────────────────
-- Liafon Stock Management — Database Migration Script (v5 → v6)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PURPOSE:
--   Adds Phase 6 schema: UOM fields on SparePart, HsnCode master table,
--   CategoryField + PartMeta (custom fields), StockCount + StockCountItem
--   (physical stock counting).
--
-- HOW TO RUN:
--   1. Go to: https://supabase.com/dashboard/project/<your-project>/sql/new
--   2. Paste this ENTIRE file into the SQL editor
--   3. Click "Run" (Ctrl+Enter)
--   4. After this runs, also run scripts/seed-hsn-codes.sql to preload
--      ~300 common HSN codes for auto-parts
--
-- SAFETY:
--   - All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--   - Idempotent: safe to run multiple times
--   - No data is deleted or modified
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. UOM FIELDS ON SparePart
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "baseUom" TEXT NOT NULL DEFAULT 'PCS';
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "purchaseUom" TEXT NOT NULL DEFAULT 'PCS';
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "purchaseToBaseConversion" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "sellingUom" TEXT NOT NULL DEFAULT 'PCS';
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "sellingToBaseConversion" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. HSN CODE MASTER TABLE
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "HsnCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HsnCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HsnCode_code_key" ON "HsnCode"("code");
CREATE INDEX IF NOT EXISTS "HsnCode_code_idx" ON "HsnCode"("code");
CREATE INDEX IF NOT EXISTS "HsnCode_category_idx" ON "HsnCode"("category");
CREATE INDEX IF NOT EXISTS "HsnCode_rate_idx" ON "HsnCode"("rate");

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CUSTOM FIELDS PER CATEGORY
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "CategoryField" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'text',
    "fieldOptions" TEXT NOT NULL DEFAULT '[]',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryField_ownerId_category_fieldName_key"
    ON "CategoryField"("ownerId", "category", "fieldName");
CREATE INDEX IF NOT EXISTS "CategoryField_ownerId_idx" ON "CategoryField"("ownerId");
CREATE INDEX IF NOT EXISTS "CategoryField_category_idx" ON "CategoryField"("category");

CREATE TABLE IF NOT EXISTS "PartMeta" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "partId" TEXT NOT NULL,
    "categoryFieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartMeta_partId_categoryFieldId_key"
    ON "PartMeta"("partId", "categoryFieldId");
CREATE INDEX IF NOT EXISTS "PartMeta_ownerId_idx" ON "PartMeta"("ownerId");
CREATE INDEX IF NOT EXISTS "PartMeta_partId_idx" ON "PartMeta"("partId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PHYSICAL STOCK COUNT
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "StockCount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "shopId" TEXT,
    "countNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "matchedItems" INTEGER NOT NULL DEFAULT 0,
    "varianceItems" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockCount_countNumber_key" ON "StockCount"("countNumber");
CREATE INDEX IF NOT EXISTS "StockCount_ownerId_idx" ON "StockCount"("ownerId");
CREATE INDEX IF NOT EXISTS "StockCount_shopId_idx" ON "StockCount"("shopId");
CREATE INDEX IF NOT EXISTS "StockCount_status_idx" ON "StockCount"("status");

CREATE TABLE IF NOT EXISTS "StockCountItem" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "countedQty" INTEGER,
    "variance" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "countedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockCountItem_stockCountId_partId_key"
    ON "StockCountItem"("stockCountId", "partId");
CREATE INDEX IF NOT EXISTS "StockCountItem_stockCountId_idx" ON "StockCountItem"("stockCountId");
CREATE INDEX IF NOT EXISTS "StockCountItem_partId_idx" ON "StockCountItem"("partId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. FOREIGN KEY CONSTRAINTS (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- PartMeta → SparePart
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartMeta_partId_fkey') THEN
        ALTER TABLE "PartMeta" ADD CONSTRAINT "PartMeta_partId_fkey"
            FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    -- PartMeta → CategoryField
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartMeta_categoryFieldId_fkey') THEN
        ALTER TABLE "PartMeta" ADD CONSTRAINT "PartMeta_categoryFieldId_fkey"
            FOREIGN KEY ("categoryFieldId") REFERENCES "CategoryField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    -- StockCountItem → StockCount
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockCountItem_stockCountId_fkey') THEN
        ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey"
            FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    -- StockCountItem → SparePart
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockCountItem_partId_fkey') THEN
        ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_partId_fkey"
            FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE — now run scripts/seed-hsn-codes.sql to preload HSN codes
-- ═══════════════════════════════════════════════════════════════════════════
