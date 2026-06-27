const WHATSAPP_BASE_URL = 'https://wa.me'

import { getCurrencySymbol } from '@/lib/currency'

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '')
  const encodedMessage = encodeURIComponent(message)
  return `${WHATSAPP_BASE_URL}/${cleanPhone}?text=${encodedMessage}`
}

export function openWhatsApp(phone: string, message: string): void {
  const url = buildWhatsAppUrl(phone, message)
  window.open(url, '_blank')
}

export type DepartmentRole = 'warehouse' | 'sales' | 'purchasing' | 'management' | 'accounts' | 'general'

export interface Department {
  id: string
  name: string
  phone: string
  role: DepartmentRole
  email: string
  isActive: boolean
}

// Currency-aware message formatters
export function formatSaleMessage(sale: {
  partName: string
  partNumber: string
  quantity: number
  unitPrice: number
  totalPrice: number
  customerName: string
  date: string
  currency?: string
}): string {
  // Previously this only handled INR/USD/EUR/GBP and fell back to ₹
  // for everything else — misleading for AED/SAR/JPY/CNY/etc. users.
  const sym = getCurrencySymbol(sale.currency)
  return `\uD83D\uDED2 *NEW SALE ALERT*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4E6} Part: ${sale.partName}
\u{1F522} Part#: ${sale.partNumber}
\u{1F4CA} Qty: ${sale.quantity} x ${sym}${sale.unitPrice.toLocaleString()}
\u{1F4B0} Total: ${sym}${sale.totalPrice.toLocaleString()}
\u{1F464} Customer: ${sale.customerName}
\u{1F4C5} Date: ${sale.date}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
_Liafon Stock Management System_`
}

export function formatPurchaseMessage(purchase: {
  partName: string
  partNumber: string
  quantity: number
  unitCost: number
  totalCost: number
  supplierName: string
  date: string
  currency?: string
}): string {
  const sym = getCurrencySymbol(purchase.currency)
  return `\uD83D\uDCE5 *NEW PURCHASE ALERT*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4E6} Part: ${purchase.partName}
\u{1F522} Part#: ${purchase.partNumber}
\u{1F4CA} Qty: ${purchase.quantity} x ${sym}${purchase.unitCost.toLocaleString()}
\u{1F4B0} Total: ${sym}${purchase.totalCost.toLocaleString()}
\u{1F3ED} Supplier: ${purchase.supplierName}
\u{1F4C5} Date: ${purchase.date}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
_Liafon Stock Management System_`
}

export function formatLowStockMessage(items: {
  name: string
  partNumber: string
  currentStock: number
  minStockLevel: number
}[]): string {
  const lines = items.map(
    (item, i) =>
      `${i + 1}. ${item.name} (${item.partNumber})\n   Stock: ${item.currentStock} / Min: ${item.minStockLevel}`
  )
  return `\u26A0\uFE0F *LOW STOCK ALERT*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
The following parts are running low:
${lines.join('\n\n')}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F534} Total items: ${items.length}
_Please reorder urgently._
_Liafon Stock Management System_`
}

export function formatDailyReport(data: {
  date: string
  totalSales: number
  totalPurchases: number
  salesCount: number
  purchasesCount: number
  lowStockCount: number
  totalParts: number
  currency?: string
}): string {
  const sym = getCurrencySymbol(data.currency)
  const profit = data.totalSales - data.totalPurchases
  return `\uD83D\uDCCA *DAILY REPORT*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4C5} Date: ${data.date}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4B0} Total Sales: ${sym}${data.totalSales.toLocaleString()}
   (${data.salesCount} transactions)
\uD83D\uDCE5 Total Purchases: ${sym}${data.totalPurchases.toLocaleString()}
   (${data.purchasesCount} orders)
\u{1F4C8} Gross Profit: ${sym}${profit.toLocaleString()}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4E6} Total Parts: ${data.totalParts}
\u26A0\uFE0F Low Stock Items: ${data.lowStockCount}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
_Liafon Stock Management System_`
}