'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  ShoppingCart,
  PackageOpen,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Plus,
  RotateCcw,
  Download,
  Upload,
  FileText,
  TrendingUp,
  Store,
  ArrowLeftRight,
  ClipboardCheck,
  Settings,
  Search,
  Bell,
  RefreshCw,
  QrCode,
  type LucideIcon,
} from 'lucide-react'
import { useAppStore, type AppPage } from '@/store/app-store'
import { useTheme } from 'next-themes'

interface CommandItemDef {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  group: 'Navigation' | 'Actions' | 'Reports' | 'Theme' | 'Account'
  keywords?: string[]
  shortcut?: string
  perform: () => void
  disabled?: boolean
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const { setActivePage, hasAccess, currentUser, setCurrentUser } = useAppStore()
  const { setTheme, theme } = useTheme()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('liafon:command-palette:open', handler)
    return () => window.removeEventListener('liafon:command-palette:open', handler)
  }, [])

  const navTo = useCallback(
    (page: AppPage) => {
      setActivePage(page)
      setOpen(false)
    },
    [setActivePage]
  )

  const handleLogout = useCallback(async () => {
    setOpen(false)
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
    } catch {
      // ignore
    }
    setCurrentUser(null)
    window.location.href = '/?login=1'
  }, [setCurrentUser])

  const items = useMemo<CommandItemDef[]>(() => {
    return [
      // ─── Navigation (quick jump to any page) ───────────────────────────
      { id: 'nav-dashboard', label: 'Dashboard', icon: TrendingUp, group: 'Navigation', keywords: ['home', 'overview', 'main'], perform: () => navTo('dashboard') },
      { id: 'nav-inventory', label: 'Inventory', icon: PackageOpen, group: 'Navigation', keywords: ['parts', 'stock', 'items'], perform: () => navTo('inventory'), disabled: !hasAccess('inventory') },
      { id: 'nav-sales', label: 'Sales', icon: ShoppingCart, group: 'Navigation', keywords: ['invoices', 'sell'], perform: () => navTo('sales'), disabled: !hasAccess('sales') },
      { id: 'nav-purchases', label: 'Purchases', icon: PackageOpen, group: 'Navigation', keywords: ['buy', 'orders'], perform: () => navTo('purchases'), disabled: !hasAccess('purchases') },
      { id: 'nav-po', label: 'Purchase Orders', icon: PackageOpen, group: 'Navigation', keywords: ['po', 'procurement'], perform: () => navTo('purchases'), disabled: !hasAccess('purchases') },
      { id: 'nav-transfers', label: 'Stock Transfers', icon: ArrowLeftRight, group: 'Navigation', keywords: ['move', 'transfer'], perform: () => navTo('inventory'), disabled: !hasAccess('inventory') },
      { id: 'nav-stock-count', label: 'Stock Count', icon: ClipboardCheck, group: 'Navigation', keywords: ['audit', 'counting', 'physical'], perform: () => navTo('inventory'), disabled: !hasAccess('inventory') },
      { id: 'nav-analysis', label: 'Analysis', icon: TrendingUp, group: 'Navigation', keywords: ['restock', 'recommendation', 'dead stock'], perform: () => navTo('reports'), disabled: !hasAccess('reports') },
      { id: 'nav-shops', label: 'Shops', icon: Store, group: 'Navigation', keywords: ['branches', 'locations'], perform: () => navTo('settings'), disabled: !hasAccess('settings') },
      { id: 'nav-settings', label: 'Settings', icon: Settings, group: 'Navigation', keywords: ['config', 'backup', 'import'], perform: () => navTo('settings'), disabled: !hasAccess('settings') },

      // ─── Quick Actions ─────────────────────────────────────────────────
      {
        id: 'action-add-part',
        label: 'Add New Part',
        description: 'Open the Add Part dialog',
        icon: Plus,
        group: 'Actions',
        keywords: ['create', 'new', 'part', 'inventory'],
        shortcut: 'N',
        perform: () => { navTo('inventory'); window.dispatchEvent(new CustomEvent('liafon:inventory:add')) },
        disabled: !hasAccess('inventory'),
      },
      {
        id: 'action-new-sale',
        label: 'Record New Sale',
        description: 'Open the New Sale dialog',
        icon: ShoppingCart,
        group: 'Actions',
        keywords: ['sell', 'invoice', 'create', 'sale'],
        perform: () => { navTo('sales'); window.dispatchEvent(new CustomEvent('liafon:sales:new')) },
        disabled: !hasAccess('sales'),
      },
      {
        id: 'action-new-purchase',
        label: 'Record New Purchase',
        description: 'Open the New Purchase dialog',
        icon: PackageOpen,
        group: 'Actions',
        keywords: ['buy', 'restock', 'create', 'purchase'],
        perform: () => { navTo('purchases'); window.dispatchEvent(new CustomEvent('liafon:purchases:new')) },
        disabled: !hasAccess('purchases'),
      },
      {
        id: 'action-quick-stock-adjust',
        label: 'Quick Stock Adjust',
        description: 'Adjust stock for any part instantly',
        icon: RefreshCw,
        group: 'Actions',
        keywords: ['adjust', 'count', 'correct', 'stock'],
        perform: () => { navTo('inventory'); window.dispatchEvent(new CustomEvent('liafon:inventory:quick-adjust')) },
        disabled: !hasAccess('inventory'),
      },
      {
        id: 'action-process-return',
        label: 'Process Sale Return / Refund',
        description: 'Record a return or refund for a sale',
        icon: RotateCcw,
        group: 'Actions',
        keywords: ['return', 'refund', 'reverse', 'cancel sale'],
        perform: () => { navTo('sales'); window.dispatchEvent(new CustomEvent('liafon:sales:return')) },
        disabled: !hasAccess('sales'),
      },
      {
        id: 'action-export-inventory',
        label: 'Export Inventory (Excel)',
        description: 'Download all parts as XLSX',
        icon: Download,
        group: 'Actions',
        keywords: ['export', 'excel', 'xlsx', 'csv', 'download'],
        perform: () => { setOpen(false); window.open('/api/bulk-export?type=parts&format=xlsx', '_blank') },
      },
      {
        id: 'action-import-parts',
        label: 'Import Parts (CSV/Excel)',
        description: 'Bulk import parts from a file',
        icon: Upload,
        group: 'Actions',
        keywords: ['import', 'upload', 'bulk', 'csv'],
        perform: () => { navTo('settings'); window.dispatchEvent(new CustomEvent('liafon:settings:import-tab')) },
        disabled: !hasAccess('settings'),
      },
      {
        id: 'action-start-stock-count',
        label: 'Start Stock Count',
        description: 'Begin a physical inventory audit',
        icon: ClipboardCheck,
        group: 'Actions',
        keywords: ['audit', 'count', 'physical', 'stocktaking'],
        perform: () => { navTo('inventory'); window.dispatchEvent(new CustomEvent('liafon:stock-count:start')) },
        disabled: !hasAccess('inventory'),
      },

      // ─── Reports ───────────────────────────────────────────────────────
      {
        id: 'report-pl',
        label: 'P&L Statement (PDF)',
        description: 'Profit & Loss for last 30 days',
        icon: FileText,
        group: 'Reports',
        keywords: ['profit', 'loss', 'pnl', 'pdf', 'financial'],
        perform: () => {
          setOpen(false)
          const end = new Date().toISOString().slice(0, 10)
          const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
          window.open(`/api/reports/pdf?type=pl&startDate=${start}&endDate=${end}`, '_blank')
        },
      },
      {
        id: 'report-gst',
        label: 'GSTR-1 Summary (PDF)',
        description: 'GST report for last 30 days',
        icon: FileText,
        group: 'Reports',
        keywords: ['gst', 'gstr1', 'tax', 'pdf', 'filing'],
        perform: () => {
          setOpen(false)
          const end = new Date().toISOString().slice(0, 10)
          const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
          window.open(`/api/reports/pdf?type=gst&startDate=${start}&endDate=${end}`, '_blank')
        },
      },
      {
        id: 'report-inventory-valuation',
        label: 'Inventory Valuation (PDF)',
        description: 'Current stock value by category',
        icon: FileText,
        group: 'Reports',
        keywords: ['valuation', 'stock value', 'pdf'],
        perform: () => { setOpen(false); window.open('/api/reports/pdf?type=inventory', '_blank') },
      },
      {
        id: 'report-tally-export',
        label: 'Export to Tally (XML)',
        description: 'Download Tally-compatible sales data',
        icon: Download,
        group: 'Reports',
        keywords: ['tally', 'xml', 'accounting', 'export'],
        perform: () => {
          setOpen(false)
          const end = new Date().toISOString().slice(0, 10)
          const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
          window.open(`/api/tally-export?format=tally&startDate=${start}&endDate=${end}`, '_blank')
        },
      },
      {
        id: 'report-analysis',
        label: 'View Restock Analysis',
        description: 'AI-driven restock recommendations',
        icon: TrendingUp,
        group: 'Reports',
        keywords: ['analysis', 'restock', 'recommendation', 'low stock'],
        perform: () => navTo('reports'),
        disabled: !hasAccess('reports'),
      },

      // ─── Theme ─────────────────────────────────────────────────────────
      { id: 'theme-light', label: 'Light Theme', icon: Sun, group: 'Theme', keywords: ['light', 'white', 'day'], perform: () => { setTheme('light'); setOpen(false) }, disabled: theme === 'light' },
      { id: 'theme-dark', label: 'Dark Theme', icon: Moon, group: 'Theme', keywords: ['dark', 'black', 'night'], perform: () => { setTheme('dark'); setOpen(false) }, disabled: theme === 'dark' },
      { id: 'theme-system', label: 'System Theme', icon: Monitor, group: 'Theme', keywords: ['system', 'auto', 'follow'], perform: () => { setTheme('system'); setOpen(false) }, disabled: theme === 'system' },

      // ─── Account ───────────────────────────────────────────────────────
      ...(currentUser
        ? [{
            id: 'account-logout',
            label: 'Sign Out',
            description: currentUser.email,
            icon: LogOut,
            group: 'Account' as const,
            keywords: ['logout', 'sign out', 'exit'],
            perform: handleLogout,
          }]
        : []),
    ]
  }, [hasAccess, navTo, currentUser, handleLogout, setTheme, theme])

  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItemDef[]>()
    for (const item of items) {
      if (!groups.has(item.group)) groups.set(item.group, [])
      groups.get(item.group)!.push(item)
    }
    return Array.from(groups.entries())
  }, [items])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search commands, pages, actions, reports…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {grouped.map(([group, groupItems], idx) => (
          <div key={group}>
            <CommandGroup heading={group}>
              {groupItems.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.description ?? ''} ${item.keywords?.join(' ') ?? ''}`}
                    onSelect={() => item.perform()}
                    disabled={item.disabled}
                    className="cursor-pointer"
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col flex-1">
                      <span>{item.label}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </div>
                    {item.shortcut && (
                      <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                        {item.shortcut}
                      </kbd>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {idx < grouped.length - 1 && <CommandSeparator />}
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
