import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

/**
 * Shared demo-data seeder. Called from /api/seed (owner-initiated) and
 * /api/setup (first-run before owner logs in). Both routes used to
 * duplicate the same seed logic — that's now centralized here.
 *
 * The seeder is idempotent: it only inserts rows for tables that are
 * currently empty, so it's safe to call repeatedly.
 */

interface SeedResult {
  users: number
  parts: number
  departments: number
  customers: number
  suppliers: number
  sales: number
  purchases: number
  stockLogs: number
  appSettings: number
}

const SEED_PARTS = [
  { partNumber: 'ENG-001', name: 'Engine Oil Filter', category: 'Filters', brand: 'Mann', vehicleModel: 'Maruti Swift', costPrice: 350, sellingPrice: 699, currentStock: 25, minStockLevel: 10, currency: 'INR' },
  { partNumber: 'ENG-002', name: 'Spark Plug Set (4pc)', category: 'Engine', brand: 'NGK', vehicleModel: 'Honda City', costPrice: 1200, sellingPrice: 2200, currentStock: 15, minStockLevel: 5, currency: 'INR' },
  { partNumber: 'BRK-001', name: 'Front Brake Pads', category: 'Brakes', brand: 'Brembo', vehicleModel: 'Hyundai i20', costPrice: 2200, sellingPrice: 4500, currentStock: 8, minStockLevel: 5, currency: 'INR' },
  { partNumber: 'BRK-002', name: 'Rear Brake Shoes', category: 'Brakes', brand: 'Bosch', vehicleModel: 'Tata Nexon', costPrice: 1500, sellingPrice: 3200, currentStock: 12, minStockLevel: 5, currency: 'INR' },
  { partNumber: 'ELC-001', name: 'Alternator', category: 'Electrical', brand: 'Bosch', vehicleModel: 'Toyota Corolla', costPrice: 8500, sellingPrice: 16000, currentStock: 3, minStockLevel: 2, currency: 'INR' },
  { partNumber: 'ELC-002', name: 'Car Battery 12V 60Ah', category: 'Electrical', brand: 'Amaron', vehicleModel: 'Honda Amaze', costPrice: 5500, sellingPrice: 9800, currentStock: 6, minStockLevel: 3, currency: 'INR' },
  { partNumber: 'SUS-001', name: 'Front Shock Absorber', category: 'Suspension', brand: 'Monroe', vehicleModel: 'VW Polo', costPrice: 3200, sellingPrice: 6500, currentStock: 4, minStockLevel: 3, currency: 'INR' },
  { partNumber: 'SUS-002', name: 'Rear Coil Spring', category: 'Suspension', brand: 'Monroe', vehicleModel: 'Ford EcoSport', costPrice: 1800, sellingPrice: 3800, currentStock: 7, minStockLevel: 4, currency: 'INR' },
  { partNumber: 'FIL-001', name: 'Air Filter', category: 'Filters', brand: 'K&N', vehicleModel: 'Kia Seltos', costPrice: 800, sellingPrice: 1800, currentStock: 20, minStockLevel: 8, currency: 'INR' },
  { partNumber: 'FIL-002', name: 'Fuel Filter', category: 'Filters', brand: 'Mann', vehicleModel: 'Mahindra XUV', costPrice: 950, sellingPrice: 2100, currentStock: 2, minStockLevel: 5, currency: 'INR' },
  { partNumber: 'BDY-001', name: 'Headlight Assembly (L)', category: 'Body Parts', brand: 'Valeo', vehicleModel: 'Maruti Swift', costPrice: 4200, sellingPrice: 8500, currentStock: 5, minStockLevel: 2, currency: 'INR' },
  { partNumber: 'BDY-002', name: 'Side Mirror (R)', category: 'Body Parts', brand: 'Valeo', vehicleModel: 'Hyundai i20', costPrice: 1600, sellingPrice: 3500, currentStock: 3, minStockLevel: 2, currency: 'INR' },
  { partNumber: 'TRN-001', name: 'Clutch Kit Complete', category: 'Transmission', brand: 'Gates', vehicleModel: 'Tata Nexon', costPrice: 10000, sellingPrice: 19500, currentStock: 2, minStockLevel: 1, currency: 'INR' },
  { partNumber: 'CLG-001', name: 'Radiator Assembly', category: 'Cooling', brand: 'Valeo', vehicleModel: 'Toyota Corolla', costPrice: 12000, sellingPrice: 23000, currentStock: 1, minStockLevel: 1, currency: 'INR' },
  { partNumber: 'EXH-001', name: 'Exhaust Muffler', category: 'Exhaust', brand: 'Bosch', vehicleModel: 'Honda City', costPrice: 3500, sellingPrice: 7000, currentStock: 4, minStockLevel: 2, currency: 'INR' },
  { partNumber: 'STR-001', name: 'Power Steering Pump', category: 'Steering', brand: 'Continental', vehicleModel: 'Mahindra XUV', costPrice: 6500, sellingPrice: 12500, currentStock: 3, minStockLevel: 2, currency: 'INR' },
  { partNumber: 'ENG-003', name: 'Timing Belt Kit', category: 'Engine', brand: 'Gates', vehicleModel: 'VW Polo', costPrice: 3000, sellingPrice: 6200, currentStock: 6, minStockLevel: 3, currency: 'INR' },
  { partNumber: 'ENG-004', name: 'Water Pump', category: 'Engine', brand: 'Continental', vehicleModel: 'Ford EcoSport', costPrice: 2400, sellingPrice: 4800, currentStock: 4, minStockLevel: 2, currency: 'INR' },
  { partNumber: 'ELC-003', name: 'Starter Motor', category: 'Electrical', brand: 'Bosch', vehicleModel: 'Kia Seltos', costPrice: 9500, sellingPrice: 18000, currentStock: 2, minStockLevel: 1, currency: 'INR' },
  { partNumber: 'SUS-003', name: 'Control Arm (Lower)', category: 'Suspension', brand: 'Monroe', vehicleModel: 'Honda Amaze', costPrice: 2500, sellingPrice: 5200, currentStock: 5, minStockLevel: 3, currency: 'INR' },
]

const SEED_DEPARTMENTS = [
  { name: 'Warehouse', phone: '919876543210', role: 'warehouse', email: 'warehouse@liafon.com' },
  { name: 'Sales Counter', phone: '919876543211', role: 'sales', email: 'sales@liafon.com' },
  { name: 'Purchase Desk', phone: '919876543212', role: 'purchasing', email: 'purchase@liafon.com' },
  { name: 'Shop Manager', phone: '919876543213', role: 'management', email: 'manager@liafon.com' },
  { name: 'Accounts Dept', phone: '919876543214', role: 'accounts', email: 'accounts@liafon.com' },
]

const SEED_CUSTOMERS = [
  { name: 'Raj Kumar', phone: '919876543220', email: 'raj.kumar@example.com', address: 'MG Road, Bangalore', notes: 'Regular customer' },
  { name: 'Amit Sharma', phone: '919876543221', email: 'amit.sharma@example.com', address: 'Andheri West, Mumbai', notes: '' },
  { name: 'Priya Patel', phone: '919876543222', email: 'priya.patel@example.com', address: 'Satellite, Ahmedabad', notes: 'Prefers OEM parts' },
  { name: 'Suresh Gupta', phone: '919876543223', email: 'suresh.gupta@example.com', address: 'Karol Bagh, Delhi', notes: '' },
  { name: 'Senthil R', phone: '919876543224', email: 'senthil.r@example.com', address: 'T Nagar, Chennai', notes: 'Bulk buyer' },
]

const SEED_SUPPLIERS = [
  { name: 'Auto Parts India', phone: '919876543230', email: 'sales@autopartsindia.com', address: 'Industrial Area, Pune', gstNumber: '27AABCA1234F1Z5', notes: 'Primary engine parts supplier' },
  { name: 'Shree Ganesh Traders', phone: '919876543231', email: 'contact@shreeganesh.in', address: 'Lal Baug, Mumbai', gstNumber: '27AABCS5678F1Z2', notes: 'Brake specialist' },
  { name: 'Metro Auto Supply', phone: '919876543232', email: 'info@metroauto.com', address: 'Okhla, Delhi', gstNumber: '07AAFCM9012F1Z8', notes: '' },
  { name: 'Global Parts Co.', phone: '919876543233', email: 'orders@globalparts.co', address: 'Whitefield, Bangalore', gstNumber: '29AABCG3456F1Z1', notes: 'Imported parts' },
  { name: 'RK Distributors', phone: '919876543234', email: 'rk@rkdistributors.in', address: 'Geeta Bhavan, Indore', gstNumber: '23AABCR7890F1Z4', notes: '' },
]

const SEED_SETTINGS = [
  { key: 'currency', value: 'INR' },
  { key: 'backup_hour', value: '23' },
  { key: 'last_backup', value: '' },
  { key: 'shop_name', value: 'Liafon Stock Management' },
]

const SEED_CUSTOMER_NAMES = [
  'Raj Kumar', 'Amit Sharma', 'Priya Patel', 'Suresh Gupta',
  'Mohammed Ali', 'Senthil R', 'Sanjay Verma', 'Anita Desai',
  'Vikram Singh', 'Kavitha Nair',
]

const SEED_SUPPLIER_NAMES = [
  'Auto Parts India', 'Shree Ganesh Traders', 'Metro Auto Supply',
  'Global Parts Co.', 'RK Distributors',
]

// Use a deterministic PRNG so seeded data is reproducible across runs
// (Math.random makes tests flaky and back-ups inconsistent).
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Seed demo data into an empty database. Idempotent — only inserts
 * rows for tables that are currently empty. Returns counts of what
 * was inserted (or already existed).
 *
 * @param includeMockUsers If true, also creates 4 demo users with
 *   well-known weak passwords (`owner123`, etc.). Refused in
 *   production builds — demo users are dev-only.
 */
export async function seedDatabase(
  includeMockUsers = false
): Promise<SeedResult> {
  const result: SeedResult = {
    users: 0, parts: 0, departments: 0, customers: 0,
    suppliers: 0, sales: 0, purchases: 0, stockLogs: 0,
    appSettings: 0,
  }

  // ── Mock users ───────────────────────────────────────────────────────
  // SECURITY: demo users with well-known weak passwords (owner123 etc.)
  // are created ONLY in development builds. Previously an env var
  // (LIAFON_ALLOW_MOCK_USERS_IN_PROD=1) could enable them in production,
  // which (combined with DEV_DEMO_HINTS in the client bundle) was a real
  // privilege-escalation vector. The override has been removed.
  if (includeMockUsers && process.env.NODE_ENV !== 'production') {
    // If a real owner already exists (not the demo owner@liafon.com),
    // skip creating ALL demo users. The user created their own owner
    // account — they don't need demo logins cluttering the Users page
    // and the login screen.
    const realOwner = await db.user.findFirst({
      where: { role: 'owner', email: { not: 'owner@liafon.com' } },
    })

    if (!realOwner) {
      // No real owner — create all 4 demo users
      const mockUsersData = [
        { name: 'Shop Owner', email: 'owner@liafon.com', password: 'owner123', role: 'owner' as const },
        { name: 'Admin User', email: 'admin@liafon.com', password: 'admin123', role: 'admin' as const },
        { name: 'Store Manager', email: 'manager@liafon.com', password: 'manager123', role: 'manager' as const },
        { name: 'Sales Staff', email: 'user@liafon.com', password: 'user123', role: 'user' as const },
      ]

      for (const u of mockUsersData) {
        const existing = await db.user.findUnique({ where: { email: u.email } })
        if (!existing) {
          await db.user.create({
            data: { ownerId: "seed-owner", name: u.name, email: u.email, password: await hashPassword(u.password), role: u.role, },
          })
        }
      }
    }
    // If realOwner exists, skip demo user creation entirely.
    result.users = await db.user.count()
  } else {
    result.users = await db.user.count()
  }

  // ── Parts (use createMany instead of N sequential inserts) ────────────
  const existingParts = await db.sparePart.count()
  if (existingParts === 0) {
    await db.sparePart.createMany({ data: SEED_PARTS.map(p => ({ ...p, ownerId: "seed-owner" })) })
    result.parts = SEED_PARTS.length
  } else {
    result.parts = existingParts
  }

  // ── Departments ───────────────────────────────────────────────────────
  const existingDepts = await db.department.count()
  if (existingDepts === 0) {
    await db.department.createMany({ data: SEED_DEPARTMENTS.map(d => ({ ...d, ownerId: "seed-owner" })) })
    result.departments = SEED_DEPARTMENTS.length
  } else {
    result.departments = existingDepts
  }

  // ── Customers ─────────────────────────────────────────────────────────
  const existingCustomers = await db.customer.count()
  if (existingCustomers === 0) {
    await db.customer.createMany({ data: SEED_CUSTOMERS.map(c => ({ ...c, ownerId: "seed-owner" })) })
    result.customers = SEED_CUSTOMERS.length
  } else {
    result.customers = existingCustomers
  }

  // ── Suppliers ─────────────────────────────────────────────────────────
  const existingSuppliers = await db.supplier.count()
  if (existingSuppliers === 0) {
    await db.supplier.createMany({ data: SEED_SUPPLIERS.map(s => ({ ...s, ownerId: "seed-owner" })) })
    result.suppliers = SEED_SUPPLIERS.length
  } else {
    result.suppliers = existingSuppliers
  }

  // ── App settings ──────────────────────────────────────────────────────
  const existingSettings = await db.appSetting.count()
  if (existingSettings === 0) {
    await db.appSetting.createMany({ data: SEED_SETTINGS.map(s => ({ ...s, ownerId: "seed-owner" })) })
    result.appSettings = SEED_SETTINGS.length
  } else {
    result.appSettings = existingSettings
  }

  // ── Sales + Purchases + StockLogs (deterministic random) ──────────────
  const existingSales = await db.sale.count()
  if (existingSales === 0) {
    const allParts = await db.sparePart.findMany()
    if (allParts.length > 0) {
      const rand = mulberry32(0x5eed)
      const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]

      const salesToInsert: Array<{
        partId: string; quantity: number; unitPrice: number; totalPrice: number;
        customerName: string; customerPhone: string; notes: string; currency: string;
        date: Date; invoiceNumber: string;
      }> = []
      const purchasesToInsert: Array<{
        partId: string; quantity: number; unitCost: number; totalCost: number;
        supplierName: string; supplierPhone: string; notes: string; currency: string;
        date: Date; invoiceNumber: string;
      }> = []

      const now = new Date()
      // Build per-day counters so invoice numbers come out sequential
      const salesByDay = new Map<string, number>()
      const purchasesByDay = new Map<string, number>()

      const mkInvoice = (prefix: 'INV' | 'PUR', date: Date, counter: number) => {
        const d = date.toISOString().slice(0, 10).replace(/-/g, '')
        return `${prefix}-${d}-${String(counter).padStart(5, '0')}`
      }

      // 15 days of historical sales
      for (let i = 0; i < 15; i++) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        date.setHours(Math.floor(rand() * 10) + 8, Math.floor(rand() * 60))

        const dateStr = date.toISOString().slice(0, 10)
        const numSales = Math.floor(rand() * 4) + 1
        for (let j = 0; j < numSales; j++) {
          const part = pick(allParts)
          if (part.currentStock > 0) {
            const qty = Math.min(Math.floor(rand() * 3) + 1, part.currentStock)
            const counter = (salesByDay.get(dateStr) ?? 0) + 1
            salesByDay.set(dateStr, counter)
            salesToInsert.push({
              partId: part.id,
              quantity: qty,
              unitPrice: part.sellingPrice,
              totalPrice: part.sellingPrice * qty,
              customerName: pick(SEED_CUSTOMER_NAMES),
              // Use reserved-range Indian mobile numbers (555 prefix is
              // universally reserved for fictitious use) so we never
              // accidentally match a real person's phone number.
              customerPhone: `+91555${String(Math.floor(rand() * 9999999)).padStart(7, '0')}`,
              notes: '',
              currency: 'INR',
              date,
              invoiceNumber: mkInvoice('INV', date, counter),
            })
          }
        }
      }

      // 8 historical purchases
      for (let i = 0; i < 8; i++) {
        const date = new Date(now)
        date.setDate(date.getDate() - i * 3)
        const part = pick(allParts)
        const qty = Math.floor(rand() * 20) + 5
        const dateStr = date.toISOString().slice(0, 10)
        const counter = (purchasesByDay.get(dateStr) ?? 0) + 1
        purchasesByDay.set(dateStr, counter)
        purchasesToInsert.push({
          partId: part.id,
          quantity: qty,
          unitCost: part.costPrice * 0.9,
          totalCost: part.costPrice * 0.9 * qty,
          supplierName: pick(SEED_SUPPLIER_NAMES),
          supplierPhone: `+91555${String(Math.floor(rand() * 9999999)).padStart(7, '0')}`,
          notes: '',
          currency: 'INR',
          date,
          invoiceNumber: mkInvoice('PUR', date, counter),
        })
      }

      // Batch insert (single query per table)
      await db.sale.createMany({ data: salesToInsert.map(s => ({ ...s, ownerId: "seed-owner" })) })
      await db.purchase.createMany({ data: purchasesToInsert.map(p => ({ ...p, ownerId: "seed-owner" })) })
      result.sales = salesToInsert.length
      result.purchases = purchasesToInsert.length

      // Stock logs — use the inserted sales + purchases (no extra DB hit)
      const stockLogsToInsert: Array<{
        partId: string; type: string; quantity: number; previousStock: number;
        newStock: number; referenceId: string; notes: string; date: Date;
      }> = []
      for (const sale of salesToInsert) {
        const part = allParts.find((p) => p.id === sale.partId)
        if (!part) continue
        stockLogsToInsert.push({
          partId: sale.partId,
          type: 'SALE',
          quantity: sale.quantity,
          previousStock: part.currentStock + sale.quantity,
          newStock: part.currentStock,
          referenceId: '', // sale IDs aren't available after createMany; left blank
          notes: `Sale to ${sale.customerName}`,
          date: sale.date,
        })
      }
      for (const purchase of purchasesToInsert) {
        const part = allParts.find((p) => p.id === purchase.partId)
        if (!part) continue
        stockLogsToInsert.push({
          partId: purchase.partId,
          type: 'PURCHASE',
          quantity: purchase.quantity,
          previousStock: Math.max(0, part.currentStock - purchase.quantity),
          newStock: part.currentStock,
          referenceId: '',
          notes: `Purchase from ${purchase.supplierName}`,
          date: purchase.date,
        })
      }
      await db.stockLog.createMany({ data: stockLogsToInsert.map(l => ({ ...l, ownerId: "seed-owner" })) })
      result.stockLogs = stockLogsToInsert.length
    }
  } else {
    result.sales = existingSales
    result.purchases = await db.purchase.count()
    result.stockLogs = await db.stockLog.count()
  }

  return result
}
