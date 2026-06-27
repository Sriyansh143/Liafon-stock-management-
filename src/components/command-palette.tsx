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
  type LucideIcon,
} from 'lucide-react'
import { useAppStore, type AppPage } from '@/store/app-store'
import { useTheme } from 'next-themes'

interface CommandItemDef {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  group: 'Navigation' | 'Actions' | 'Theme' | 'Account'
  keywords?: string[]
  shortcut?: string
  perform: () => void
  disabled?: boolean
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const { setActivePage, hasAccess, currentUser, setCurrentUser } = useAppStore()
  const { setTheme, theme } = useTheme()

  // Global hotkey: Cmd/Ctrl + K to toggle.
  // Note: we don't add a custom Escape handler here — CommandDialog
  // already handles Escape internally, and the previous custom handler
  // was redundant. Removing it avoids a tiny double-fire edge case
  // under StrictMode.
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

  // Browser-native event for opening from buttons
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('liafon:command-palette:open', onOpen)
    return () => window.removeEventListener('liafon:command-palette:open', onOpen)
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
    // NOTE: navigation items (Dashboard, Inventory, Sales, …) are not
    // listed here — the sidebar already covers navigation. This
    // palette focuses on Actions, Theme, and Account. If you want to
    // re-add navigation items, restore the `navItems` array and filter
    // it by `hasAccess` here.
    return [
      // Only show Actions (not navigation — sidebar already has that)
      {
        id: 'action-add-part',
        label: 'Add New Part',
        description: 'Open the Add Part dialog',
        icon: Plus,
        group: 'Actions',
        keywords: ['create', 'new', 'part', 'inventory'],
        shortcut: 'N',
        perform: () => {
          navTo('inventory')
          // Inventory listens for this event to open its add dialog
          window.dispatchEvent(new CustomEvent('liafon:inventory:add'))
        },
        disabled: !hasAccess('inventory'),
      },
      {
        id: 'action-new-sale',
        label: 'Record New Sale',
        description: 'Open the New Sale dialog',
        icon: ShoppingCart,
        group: 'Actions',
        keywords: ['sell', 'invoice', 'create', 'sale'],
        perform: () => {
          navTo('sales')
          window.dispatchEvent(new CustomEvent('liafon:sales:new'))
        },
        disabled: !hasAccess('sales'),
      },
      {
        id: 'action-new-purchase',
        label: 'Record New Purchase',
        description: 'Open the New Purchase dialog',
        icon: PackageOpen,
        group: 'Actions',
        keywords: ['buy', 'restock', 'create', 'purchase'],
        perform: () => {
          navTo('purchases')
          window.dispatchEvent(new CustomEvent('liafon:purchases:new'))
        },
        disabled: !hasAccess('purchases'),
      },
      {
        id: 'theme-light',
        label: 'Light Theme',
        icon: Sun,
        group: 'Theme',
        keywords: ['light', 'white', 'day'],
        perform: () => {
          setTheme('light')
          setOpen(false)
        },
        disabled: theme === 'light',
      },
      {
        id: 'theme-dark',
        label: 'Dark Theme',
        icon: Moon,
        group: 'Theme',
        keywords: ['dark', 'black', 'night'],
        perform: () => {
          setTheme('dark')
          setOpen(false)
        },
        disabled: theme === 'dark',
      },
      {
        id: 'theme-system',
        label: 'System Theme',
        icon: Monitor,
        group: 'Theme',
        keywords: ['system', 'auto', 'follow'],
        perform: () => {
          setTheme('system')
          setOpen(false)
        },
        disabled: theme === 'system',
      },
      ...(currentUser
        ? [
            {
              id: 'account-logout',
              label: 'Sign Out',
              description: currentUser.email,
              icon: LogOut,
              group: 'Account' as const,
              keywords: ['logout', 'sign out', 'exit'],
              perform: handleLogout,
            },
          ]
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
      <CommandInput placeholder="Search commands, pages, or actions…" />
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
