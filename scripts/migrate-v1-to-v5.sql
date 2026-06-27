-- ─────────────────────────────────────────────────────────────────────────────
-- Liafon Stock Management — Database Migration Script (v1 → v5)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PURPOSE:
--   If your Supabase database has the OLD schema (from before Phase 3) and
--   you're seeing errors like:
--     "The column `StockLog.shopId` does not exist in the current database"
--     "The column `SparePart.shopId` does not exist in the current database"
--   ...run this script in the Supabase SQL Editor to bring your DB up to v5.
--
-- HOW TO RUN:
--   1. Go to: https://supabase.com/dashboard/project/<your-project>/sql/new
--   2. Paste this ENTIRE file into the SQL editor
--   3. Click "Run" (Ctrl+Enter)
--   4. Refresh your app — errors should be gone
--
-- SAFETY:
--   - All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--   - No data is deleted or modified
--   - Existing rows get safe defaults (NULL or 0/false/empty string)
--   - Idempotent: safe to run multiple times
--
-- AFTER RUNNING:
--   - Run `npx prisma db pull` locally to update your local Prisma schema
--     from the DB (or skip — your schema.prisma is already correct)
--   - Restart your Next.js dev server
--
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NEW TABLES (Phase 3 + 4)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Shop (multi-shop / multi-branch) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Shop" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "pincode" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Shop_ownerId_name_key" ON "Shop"("ownerId", "name");
CREATE INDEX IF NOT EXISTS "Shop_ownerId_idx" ON "Shop"("ownerId");
CREATE INDEX IF NOT EXISTS "Shop_state_idx" ON "Shop"("state");

-- ─── Batch (batch/serial/expiry tracking) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "Batch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "partId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "manufactureDate" TIMESTAMP(3),
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Batch_ownerId_idx" ON "Batch"("ownerId");
CREATE INDEX IF NOT EXISTS "Batch_partId_idx" ON "Batch"("partId");
CREATE INDEX IF NOT EXISTS "Batch_expiryDate_idx" ON "Batch"("expiryDate");
CREATE INDEX IF NOT EXISTS "Batch_serialNumber_idx" ON "Batch"("serialNumber");

-- ─── PurchaseOrder (PO workflow) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "shopId" TEXT,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "draftedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT NOT NULL DEFAULT '',
    "lineItems" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_ownerId_idx" ON "PurchaseOrder"("ownerId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_shopId_idx" ON "PurchaseOrder"("shopId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- ─── StockTransfer (inter-shop transfers) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "StockTransfer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "transferNumber" TEXT NOT NULL,
    "fromShopId" TEXT NOT NULL,
    "toShopId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "toPartId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransfer_transferNumber_key" ON "StockTransfer"("transferNumber");
CREATE INDEX IF NOT EXISTS "StockTransfer_ownerId_idx" ON "StockTransfer"("ownerId");
CREATE INDEX IF NOT EXISTS "StockTransfer_fromShopId_idx" ON "StockTransfer"("fromShopId");
CREATE INDEX IF NOT EXISTS "StockTransfer_toShopId_idx" ON "StockTransfer"("toShopId");
CREATE INDEX IF NOT EXISTS "StockTransfer_partId_idx" ON "StockTransfer"("partId");
CREATE INDEX IF NOT EXISTS "StockTransfer_status_idx" ON "StockTransfer"("status");

-- ─── Payment (partial payments, credit, UPI) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "saleId" TEXT,
    "customerId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upiVpa" TEXT NOT NULL DEFAULT '',
    "upiPhone" TEXT NOT NULL DEFAULT '',
    "upiQrScanned" BOOLEAN NOT NULL DEFAULT false,
    "upiQrImage" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Payment_ownerId_idx" ON "Payment"("ownerId");
CREATE INDEX IF NOT EXISTS "Payment_saleId_idx" ON "Payment"("saleId");
CREATE INDEX IF NOT EXISTS "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX IF NOT EXISTS "Payment_date_idx" ON "Payment"("date");
CREATE INDEX IF NOT EXISTS "Payment_method_idx" ON "Payment"("method");

-- ─── TaxRate (per-category GST rates) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TaxRate" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hsnCode" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaxRate_ownerId_category_key" ON "TaxRate"("ownerId", "category");
CREATE INDEX IF NOT EXISTS "TaxRate_ownerId_idx" ON "TaxRate"("ownerId");

-- ─── PartAlternative (interchangeable OEM parts) ────────────────────────────
CREATE TABLE IF NOT EXISTS "PartAlternative" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT '',
    "partId" TEXT NOT NULL,
    "alternativePartId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartAlternative_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartAlternative_partId_alternativePartId_key" ON "PartAlternative"("partId", "alternativePartId");
CREATE INDEX IF NOT EXISTS "PartAlternative_ownerId_idx" ON "PartAlternative"("ownerId");
CREATE INDEX IF NOT EXISTS "PartAlternative_partId_idx" ON "PartAlternative"("partId");
CREATE INDEX IF NOT EXISTS "PartAlternative_alternativePartId_idx" ON "PartAlternative"("alternativePartId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADD MISSING COLUMNS TO EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── User: 2FA + shopId ─────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "shopId" TEXT;
CREATE INDEX IF NOT EXISTS "User_shopId_idx" ON "User"("shopId");

-- ─── SparePart: shopId ──────────────────────────────────────────────────────
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "shopId" TEXT;
CREATE INDEX IF NOT EXISTS "SparePart_shopId_idx" ON "SparePart"("shopId");

-- ─── Sale: shopId + GST + discount + payment tracking ───────────────────────
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "shopId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "cgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "sgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "taxableValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountType" TEXT NOT NULL DEFAULT 'flat';
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'paid';
CREATE INDEX IF NOT EXISTS "Sale_shopId_idx" ON "Sale"("shopId");
CREATE INDEX IF NOT EXISTS "Sale_invoiceNumber_idx" ON "Sale"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Sale_paymentStatus_idx" ON "Sale"("paymentStatus");

-- ─── Purchase: shopId ───────────────────────────────────────────────────────
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shopId" TEXT;
CREATE INDEX IF NOT EXISTS "Purchase_shopId_idx" ON "Purchase"("shopId");

-- ─── StockLog: shopId ───────────────────────────────────────────────────────
ALTER TABLE "StockLog" ADD COLUMN IF NOT EXISTS "shopId" TEXT;
CREATE INDEX IF NOT EXISTS "StockLog_shopId_idx" ON "StockLog"("shopId");

-- ─── Customer: shopId + gstNumber + state + creditLimit ─────────────────────
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shopId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Customer_shopId_idx" ON "Customer"("shopId");
CREATE INDEX IF NOT EXISTS "Customer_gstNumber_idx" ON "Customer"("gstNumber");

-- ─── Supplier: shopId ───────────────────────────────────────────────────────
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "shopId" TEXT;
CREATE INDEX IF NOT EXISTS "Supplier_shopId_idx" ON "Supplier"("shopId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ADD FOREIGN KEY CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════════════
-- (Use DO blocks so they're idempotent — Postgres doesn't have IF NOT EXISTS for constraints)

DO $$
BEGIN
    -- User → Shop
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_shopId_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- SparePart → Shop
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SparePart_shopId_fkey') THEN
        ALTER TABLE "SparePart" ADD CONSTRAINT "SparePart_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Sale → Shop
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sale_shopId_fkey') THEN
        ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Purchase → Shop
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Purchase_shopId_fkey') THEN
        ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- StockLog → Shop
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockLog_shopId_fkey') THEN
        ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Customer → Shop
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_shopId_fkey') THEN
        ALTER TABLE "Customer" ADD CONSTRAINT "Customer_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Supplier → Shop
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Supplier_shopId_fkey') THEN
        ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Batch → SparePart
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Batch_partId_fkey') THEN
        ALTER TABLE "Batch" ADD CONSTRAINT "Batch_partId_fkey"
            FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- Batch → Supplier (nullable)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Batch_supplierId_fkey') THEN
        ALTER TABLE "Batch" ADD CONSTRAINT "Batch_supplierId_fkey"
            FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Batch → PurchaseOrder (nullable)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Batch_purchaseOrderId_fkey') THEN
        ALTER TABLE "Batch" ADD CONSTRAINT "Batch_purchaseOrderId_fkey"
            FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- PurchaseOrder → Shop (nullable)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_shopId_fkey') THEN
        ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_shopId_fkey"
            FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- PurchaseOrder → Supplier (nullable)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_supplierId_fkey') THEN
        ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey"
            FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- StockTransfer → Shop (from + to)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_fromShopId_fkey') THEN
        ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromShopId_fkey"
            FOREIGN KEY ("fromShopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_toShopId_fkey') THEN
        ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toShopId_fkey"
            FOREIGN KEY ("toShopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    -- StockTransfer → SparePart (from + to)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_partId_fkey') THEN
        ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_partId_fkey"
            FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_toPartId_fkey') THEN
        ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toPartId_fkey"
            FOREIGN KEY ("toPartId") REFERENCES "SparePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Payment → Sale (nullable)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_saleId_fkey') THEN
        ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey"
            FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- Payment → Customer (nullable)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_customerId_fkey') THEN
        ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- PartAlternative → SparePart (both directions)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartAlternative_partId_fkey') THEN
        ALTER TABLE "PartAlternative" ADD CONSTRAINT "PartAlternative_partId_fkey"
            FOREIGN KEY ("partId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartAlternative_alternativePartId_fkey') THEN
        ALTER TABLE "PartAlternative" ADD CONSTRAINT "PartAlternative_alternativePartId_fkey"
            FOREIGN KEY ("alternativePartId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. BACKFILL EXISTING DATA
-- ═══════════════════════════════════════════════════════════════════════════

-- Existing sales are fully paid (no credit tracking retroactive)
UPDATE "Sale" SET "amountPaid" = "totalPrice" WHERE "amountPaid" = 0 AND "totalPrice" > 0;
UPDATE "Sale" SET "paymentStatus" = 'paid' WHERE "paymentStatus" = 'paid' AND "amountPaid" >= "totalPrice";

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. VERIFY (run these manually to confirm)
-- ═══════════════════════════════════════════════════════════════════════════

-- List all tables (should see Shop, Batch, PurchaseOrder, StockTransfer, Payment, TaxRate, PartAlternative):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check the new columns on Sale:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'Sale' AND column_name IN ('shopId', 'taxRate', 'amountPaid', 'paymentStatus');

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE
-- ─────────────────────────────────────────────────────────────────────────────
-- After this script runs:
--   1. Run `npx prisma db pull` locally to sync your local schema (optional)
--   2. Restart your Next.js dev server
--   3. The "column does not exist" errors should be gone
-- ─────────────────────────────────────────────────────────────────────────────
