import { z } from 'zod'

// ─── Part Schemas ───────────────────────────────────────────────────────────

export const createPartSchema = z.object({
  partNumber: z.string().trim().min(1, 'Part number is required').max(80),
  name: z.string().trim().min(1, 'Name is required').max(200),
  category: z.string().trim().min(1, 'Category is required').max(60),
  brand: z.string().trim().min(1, 'Brand is required').max(80),
  vehicleModel: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  costPrice: z.coerce.number().min(0, 'Cost must be 0 or greater'),
  sellingPrice: z.coerce.number().min(0, 'Selling price must be 0 or greater'),
  currentStock: z.coerce.number().int().min(0, 'Stock must be 0 or greater').optional().default(0),
  minStockLevel: z.coerce.number().int().min(0).max(100000).optional().default(5),
  location: z.string().trim().max(120).optional().default(''),
})

export const updatePartSchema = z.object({
  partNumber: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  brand: z.string().trim().min(1).max(80).optional(),
  vehicleModel: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  costPrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  minStockLevel: z.coerce.number().int().min(0).max(100000).optional(),
  location: z.string().trim().max(120).optional(),
})

// ─── Sale Schemas ───────────────────────────────────────────────────────────

export const createSaleSchema = z.object({
  partId: z.string().min(1, 'Part is required'),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer'),
  unitPrice: z.coerce.number().min(0).optional(),
  customerName: z.string().trim().max(120).optional().default(''),
  customerPhone: z.string().trim().max(40).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
})

// ─── Purchase Schemas ───────────────────────────────────────────────────────

export const createPurchaseSchema = z.object({
  partId: z.string().min(1, 'Part is required'),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer'),
  unitCost: z.coerce.number().min(0).optional(),
  supplierName: z.string().trim().max(120).optional().default(''),
  supplierPhone: z.string().trim().max(40).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
})

// ─── Stock Adjustment Schema ────────────────────────────────────────────────

export const stockAdjustSchema = z.object({
  partId: z.string().min(1),
  newStock: z.coerce.number().int().min(0, 'Stock must be 0 or greater'),
  notes: z.string().trim().max(500).optional().default('Manual stock adjustment'),
})

// ─── Department Schemas ─────────────────────────────────────────────────────

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().min(1, 'Phone is required').max(40),
  role: z.string().trim().max(60).optional().default('general'),
  email: z.string().trim().email('Invalid email').max(120).optional().or(z.literal('').default('')),
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
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Invalid email').max(160),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
  role: z.enum(VALID_ROLES).optional().default('user'),
})

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(160).optional(),
  role: z.enum(VALID_ROLES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
})

// ─── Auth Schemas ───────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  password: z.string().min(1, "Password is required"),
  twoFactorCode: z.string().trim().optional(),
})

export const logoutSchema = z.object({
  action: z.literal('logout').optional(),
  email: z.string().optional(),
  password: z.string().optional(),
})

// ─── Customer Schemas ───────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
})

// ─── Supplier Schemas ───────────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().default(''),
  gstNumber: z.string().trim().max(40).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
})

// ─── WhatsApp Send Schema ───────────────────────────────────────────────────

export const whatsappSendSchema = z.object({
  phone: z.string().trim().min(6, 'Phone number is required').max(20),
  message: z.string().trim().min(1, 'Message is required').max(4096),
  department: z.string().trim().max(120).optional(),
})

// ─── Backup Schemas ─────────────────────────────────────────────────────────

export const backupSchema = z.object({
  type: z.enum(['full', 'inventory', 'sales', 'purchases']),
})

// Scheduled backup: backs up sales/purchases within a date range.
// Used by the weekly/monthly/custom-date backup UI in Settings.
export const scheduledBackupSchema = z.object({
  type: z.literal('range'),
  // 'weekly' = last 7 days, 'monthly' = last 30 days,
  // 'custom' = use startDate + endDate
  preset: z.enum(['weekly', 'monthly', 'custom']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export const restoreSchema = z.object({
  type: z.literal('restore'),
  filename: z.string().min(1).max(200),
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

// ─── Payment Schema ──────────────────────────────────────────────────────────
export const recordPaymentSchema = z.object({
  saleId: z.string().min(1, 'Sale ID is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.enum(['cash', 'card', 'upi', 'bank', 'cheque', 'other']).optional().default('cash'),
  reference: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
  date: z.string().optional(),
})
