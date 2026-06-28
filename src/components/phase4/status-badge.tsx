'use client'

/**
 * StatusBadge — professional tinted badge with leading dot.
 * Inspired by ERPNext DocStatus + Snipe-IT status labels.
 *
 * Usage:
 *   <StatusBadge status="approved" />
 *   <StatusBadge status="received" label="Completed" />
 *
 * Color mapping:
 *   green   → received, finalized, paid, active, connected, healthy
 *   blue    → approved, shipped, in_progress, pending, new_product
 *   amber   → draft, monitor, warning, low_stock
 *   red     → cancelled, failed, error, unpaid, restock_now, discontinue
 *   slate   → inactive, archived, no_action
 */

import { Badge } from '@/components/ui/badge'

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  // Green (success)
  received: { color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', label: 'Received' },
  finalized: { color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', label: 'Finalized' },
  paid: { color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', label: 'Paid' },
  active: { color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', label: 'Active' },
  connected: { color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', label: 'Connected' },
  no_action: { color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', label: 'Healthy' },
  // Blue (info)
  approved: { color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20', label: 'Approved' },
  shipped: { color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20', label: 'Shipped' },
  in_progress: { color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20', label: 'In Progress' },
  pending: { color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20', label: 'Pending' },
  new_product: { color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20', label: 'New' },
  // Amber (warning)
  draft: { color: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', label: 'Draft' },
  monitor: { color: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', label: 'Monitor' },
  low_stock: { color: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', label: 'Low Stock' },
  // Red (danger)
  cancelled: { color: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20', label: 'Cancelled' },
  failed: { color: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20', label: 'Failed' },
  unpaid: { color: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20', label: 'Unpaid' },
  restock_now: { color: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20', label: 'Restock NOW' },
  discontinue: { color: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-600/20', label: 'Discontinue' },
  // Slate (neutral)
  inactive: { color: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-600/20', label: 'Inactive' },
  partial: { color: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', label: 'Partial' },
}

const DOT_COLOR: Record<string, string> = {
  'bg-emerald-50': 'bg-emerald-500',
  'bg-blue-50': 'bg-blue-500',
  'bg-amber-50': 'bg-amber-500',
  'bg-red-50': 'bg-red-500',
  'bg-slate-100': 'bg-slate-400',
}

interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = STATUS_MAP[status] || { color: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-600/20', label: status }
  const dotColor = Object.entries(DOT_COLOR).find(([bg]) => config.color.startsWith(bg))?.[1] || 'bg-slate-400'

  return (
    <Badge className={`${config.color} ${className || ''} inline-flex items-center gap-1.5 font-medium`}>
      <span className={`size-1.5 rounded-full ${dotColor}`} />
      {label || config.label}
    </Badge>
  )
}
