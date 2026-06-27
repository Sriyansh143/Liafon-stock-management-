import { z } from 'zod'

// ─── DRY Schema Helpers (Qwen-suggested, Phase 4) ───────────────────────────
// These tiny factories eliminate ~80% of the boilerplate in the schemas
// below. Each returns a fully-configured Zod schema with sensible defaults
// for trimming, length bounds, and error messages.

/** Required string with trim + length bounds. */
const stringSchema = (min: number, max: number, label = 'Value') =>
  z.string().trim().min(min, `${label} is required`).max(max)

/** Optional string with trim, max length, and a default value. */
const optionalString = (max: number, def = '') =>
  z.string().trim().max(max).optional().default(def)

/** Positive number (> 0). Uses coerce so form submissions sending strings work. */
const positiveNumber = (label = 'Value') =>
  z.coerce.number().positive(`${label} must be positive`)

/** Non-negative number (>= 0). */
const nonNegativeNumber = (label = 'Value') =>
  z.coerce.number().min(0, `${label} must be 0 or greater`)

/** Email pattern OR empty string — shared by Customer + Supplier email fields. */
const emailOrEmpty = (max = 120) =>
  z.string().trim().email('Invalid email').max(max).optional().or(z.literal('').default(''))

/** Positive integer with optional default. */
const positiveInt = (def?: number) =>
  def !== undefined
    ? z.coerce.number().int().positive().optional().default(def)
    : z.coerce.number().int().positive()

// ─── Part Schemas ───────────────────────────────────────────────────────────

export const createPartSchema = z.object({
  partNumber: stringSchema(1, 80, 'Part number'),
  name: stringSchema(1, 200, 'Name'),
  category: stringSchema(1, 60, 'Category'),
  brand: stringSchema(1, 80, 'Brand'),
  vehicleModel: optionalString(120),
  description: optionalString(2000),
  costPrice: nonNegativeNumber('Cost'),
  sellingPrice: nonNegativeNumber('Selling price'),
  currentStock: z.coerce.number().int().min(0, 'Stock must be 0 or greater').optional().default(0),
  minStockLevel: z.coerce.number().int().min(0).max(100000).optional().default(5),
  location: optionalString(120),
})

export const updatePartSchema = z.object({
  partNumber: stringSchema(1, 80).optional(),
  name: stringSchema(1, 200).optional(),
  category: stringSchema(1, 60).optional(),
  brand: stringSchema(1, 80).optional(),
  vehicleModel: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  costPrice: nonNegativeNumber('Cost').optional(),
  sellingPrice: nonNegativeNumber('Selling price').optional(),
  minStockLevel: z.coerce.number().int().min(0).max(100000).optional(),
  location: z.string().trim().max(120).optional(),
})

// ─── Sale Schemas ───────────────────────────────────────────────────────────

export const createSaleSchema = z.object({
  partId: stringSchema(1, 100, 'Part'),
  quantity: positiveInt(),
  unitPrice: nonNegativeNumber('Unit price').optional(),
  customerName: optionalString(120),
  customerPhone: optionalString(40),
  notes: optionalString(2000),

  // ─── GST / tax fields ──────────────────────────────────────────────────
  taxRate: z.coerce.number().min(0).max(100).optional(),
  isInterState: z.boolean().optional(),
  hsnCode: optionalString(20),

  // ─── Discount fields ───────────────────────────────────────────────────
  discount: z.coerce.number().min(0).optional().default(0),
  discountType: z.enum(['flat', 'percent']).optional().default('flat'),

  // ─── Payment tracking ──────────────────────────────────────────────────
  amountPaid: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank', 'cheque', 'other']).optional().default('cash'),
  paymentReference: optionalString(200),

  // Backward compat: explicitly opt in to below-cost sales
  allowBelowCost: z.boolean().optional().default(false),

  // ─── Multi-shop support ────────────────────────────────────────────────
  shopId: z.string().optional(),

  // ─── Customer credit sale (link to existing customer) ──────────────────
  customerId: z.string().optional(),
})

// ─── Payment Schemas (for recording additional payments against a sale) ────

export const recordPaymentSchema = z.object({
  saleId: stringSchema(1, 100, 'Sale ID'),
  amount: positiveNumber('Amount'),
  method: z.enum(['cash', 'card', 'upi', 'bank', 'cheque', 'other']).optional().default('cash'),
  reference: optionalString(200),
  notes: optionalString(500),
  date: z.string().optional(),
})

// ─── Tax Rate Schemas ──────────────────────────────────────────────────────

export const createTaxRateSchema = z.object({
  category: stringSchema(1, 60, 'Category'),
  rate: z.coerce.number().min(0, 'Rate must be 0 or greater').max(100, 'Rate cannot exceed 100'),
  hsnCode: optionalString(20),
  description: optionalString(500),
  isActive: z.boolean().optional().default(true),
})

export const updateTaxRateSchema = z.object({
  rate: z.coerce.number().min(0).max(100).optional(),
  hsnCode: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
})

// ─── Purchase Schemas ───────────────────────────────────────────────────────

export const createPurchaseSchema = z.object({
  partId: stringSchema(1, 100, 'Part'),
  quantity: positiveInt(),
  unitCost: nonNegativeNumber('Unit cost').optional(),
  supplierName: optionalString(120),
  supplierPhone: optionalString(40),
  notes: optionalString(2000),
})

// ─── Stock Adjustment Schema ────────────────────────────────────────────────

export const stockAdjustSchema = z.object({
  partId: stringSchema(1, 100),
  newStock: z.coerce.number().int().min(0, 'Stock must be 0 or greater'),
  notes: optionalString(500, 'Manual stock adjustment'),
})

// ─── Department Schemas ─────────────────────────────────────────────────────

export const createDepartmentSchema = z.object({
  name: stringSchema(1, 120, 'Name'),
  phone: stringSchema(1, 40, 'Phone'),
  role: optionalString(60, 'general'),
  email: emailOrEmpty(120),
})

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  role: z.string().trim().max(60).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
})

// ─── User Schemas ───────────────────────────────────────────────────────────

const VALID_ROLES = ['owner', 'admin', 'manager', 'user'] as const

export const createUserSchema = z.object({
  name: stringSchema(1, 120, 'Name'),
  email: z.string().trim().email('Invalid email').max(160),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
  role: z.enum(VALID_ROLES).optional().default('user'),
  // Multi-shop: optional shop assignment for staff users
  shopId: z.string().optional(),
})

export const updateUserSchema = z.object({
  id: stringSchema(1, 100),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(160).optional(),
  role: z.enum(VALID_ROLES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
  shopId: z.string().nullable().optional(),
})

// ─── Auth Schemas ───────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
  // 2FA code (only required when user has 2FA enabled)
  twoFactorCode: z.string().trim().optional(),
})

export const logoutSchema = z.object({
  action: z.literal('logout').optional(),
  email: z.string().optional(),
  password: z.string().optional(),
})

// ─── Customer Schemas ───────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: stringSchema(1, 120, 'Name'),
  phone: optionalString(40),
  email: emailOrEmpty(120),
  address: optionalString(500),
  notes: optionalString(2000),
  // GST fields (for B2B + inter-state detection)
  gstNumber: optionalString(40),
  state: optionalString(60),
  // Credit limit (0 = no credit allowed)
  creditLimit: z.coerce.number().min(0).optional().default(0),
  // Multi-shop assignment
  shopId: z.string().optional(),
})

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  gstNumber: z.string().trim().max(40).optional(),
  state: z.string().trim().max(60).optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
})

// ─── Supplier Schemas ───────────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name: stringSchema(1, 120, 'Name'),
  phone: optionalString(40),
  email: emailOrEmpty(120),
  address: optionalString(500),
  gstNumber: optionalString(40),
  notes: optionalString(2000),
  shopId: z.string().optional(),
})

// ─── WhatsApp Send Schema ───────────────────────────────────────────────────

export const whatsappSendSchema = z.object({
  phone: stringSchema(6, 20, 'Phone number'),
  message: stringSchema(1, 4096, 'Message'),
  department: optionalString(120),
})

// ─── Backup Schemas ─────────────────────────────────────────────────────────

export const backupSchema = z.object({
  type: z.enum(['full', 'inventory', 'sales', 'purchases']),
})

export const scheduledBackupSchema = z.object({
  type: z.literal('range'),
  preset: z.enum(['weekly', 'monthly', 'custom']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export const restoreSchema = z.object({
  type: z.literal('restore'),
  filename: stringSchema(1, 200, 'Filename'),
})

// ─── Customization Schema ──────────────────────────────────────────────────

const roleKeySchema = z.enum(['owner', 'admin', 'manager', 'user'])
const fieldPermSchema = z.record(roleKeySchema, z.boolean())
const customizationFieldsSchema = z.record(z.string().max(60), fieldPermSchema)

export const customizationSchema = z.object({
  customization: z.object({
    fields: customizationFieldsSchema.optional().default({}),
    pages: customizationFieldsSchema.optional().default({}),
  }).refine(
    (v) => JSON.stringify(v).length <= 100_000,
    { message: 'Customization payload too large (max 100 KB)' }
  ),
})

// ─── 2FA Schemas (Phase 3) ──────────────────────────────────────────────────

export const twoFactorEnableSchema = z.object({
  currentPassword: stringSchema(1, 200, 'Current password'),
})

export const twoFactorVerifySchema = z.object({
  action: z.enum(['enable', 'login']),
  code: stringSchema(6, 50, '2FA code'),   // 6-digit TOTP or 9-char backup code
  userId: z.string().optional(),            // required for action='login'
})

export const twoFactorDisableSchema = z.object({
  currentPassword: stringSchema(1, 200, 'Current password'),
  code: stringSchema(6, 50, '2FA code'),
})

// ─── UPI Payment Schemas (Phase 3) ──────────────────────────────────────────

export const upiActionSchema = z.object({
  action: z.enum(['generate_qr', 'decode_qr', 'validate_vpa', 'validate_phone']),
  payeeVpa: z.string().optional(),
  payeeName: z.string().optional(),
  amount: z.number().min(0).optional(),
  note: z.string().max(50).optional(),
  transactionRef: z.string().max(35).optional(),
  imageBase64: z.string().optional(),
  vpa: z.string().optional(),
  phone: z.string().optional(),
  size: z.number().min(64).max(1024).optional(),
})

// ─── Shop Schemas (Phase 3) ─────────────────────────────────────────────────

export const createShopSchema = z.object({
  name: stringSchema(1, 100, 'Shop name'),
  address: optionalString(500),
  city: optionalString(100),
  state: optionalString(60),
  pincode: optionalString(20),
  phone: optionalString(40),
  email: emailOrEmpty(120),
  gstin: optionalString(20),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

// ─── Purchase Order Schemas (Phase 3) ───────────────────────────────────────

export const createPurchaseOrderSchema = z.object({
  shopId: z.string().optional(),
  supplierId: z.string().optional(),
  notes: optionalString(2000),
  lineItems: z.array(z.object({
    partId: stringSchema(1, 100, 'Part'),
    quantity: positiveInt(),
    unitCost: nonNegativeNumber('Unit cost'),
    totalCost: nonNegativeNumber('Total cost'),
    batchNumber: optionalString(60),
    expiryDate: z.string().optional(),
  })).min(1, 'At least one line item is required'),
})

export const purchaseOrderActionSchema = z.object({
  action: z.enum(['approve', 'receive', 'cancel']),
})

// ─── Stock Transfer Schemas (Phase 3) ───────────────────────────────────────

export const createStockTransferSchema = z.object({
  fromShopId: stringSchema(1, 100, 'Source shop'),
  toShopId: stringSchema(1, 100, 'Destination shop'),
  partId: stringSchema(1, 100, 'Part'),
  quantity: positiveInt(),
  notes: optionalString(500),
})

export const stockTransferActionSchema = z.object({
  action: z.enum(['ship', 'receive', 'cancel']),
})

// ─── Helper: Safe Parse for API Routes ──────────────────────────────────────

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data)
  if (result.success) return { success: true, data: result.data }
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    if (!fieldErrors[key]) fieldErrors[key] = []
    fieldErrors[key].push(issue.message)
  }
  const firstError = result.error.issues[0]?.message || 'Validation failed'
  return { success: false, error: firstError, fieldErrors }
}
