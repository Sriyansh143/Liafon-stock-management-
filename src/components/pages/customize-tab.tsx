'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, Save, RotateCw, Eye, EyeOff } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import type { UserRole } from '@/store/app-store'

interface CustomizationData {
  fields: Record<string, Record<UserRole, boolean>>
  pages: Record<string, Record<UserRole, boolean>>
}

const FIELD_LABELS: Record<string, string> = {
  costPrice: 'Cost Price',
  profit: 'Profit Margins',
  valuation: 'Inventory Valuation',
  supplierCost: 'Supplier Cost',
}

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  sales: 'Sales',
  purchases: 'Purchases',
  departments: 'Departments',
  reports: 'Reports',
  activity: 'Activity Log',
  settings: 'Settings',
  users: 'Users',
}

const ROLES: UserRole[] = ['owner', 'admin', 'manager', 'user']

export function CustomizeTab() {
  const { toast } = useToast()
  const [data, setData] = useState<CustomizationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchCustomization = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customization')
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json.customization)
    } catch {
      toast({ title: 'Error', description: 'Failed to load customization', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchCustomization()
  }, [fetchCustomization])

  const toggleField = (category: 'fields' | 'pages', key: string, role: UserRole) => {
    if (!data) return
    setData({
      ...data,
      [category]: {
        ...data[category],
        [key]: {
          ...data[category][key],
          [role]: !data[category][key]?.[role],
        },
      },
    })
  }

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch('/api/customization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customization: data }),
      })
      if (res.ok) {
        toast({ title: 'Saved', description: 'Customization updated. Users will see changes on next login.' })
      } else {
        toast({ title: 'Save failed', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Network error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/customization', { method: 'DELETE' })
      if (res.ok) {
        const json = await res.json()
        setData(json.customization)
        toast({ title: 'Reset', description: 'Customization reset to defaults' })
      }
    } catch {
      toast({ title: 'Reset failed', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Failed to load customization.</p>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold">App Customization</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Control what fields and pages each role can see. Changes apply on next login.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving} className="gap-1.5">
            <RotateCw className="w-3.5 h-3.5" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* Field visibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Eye className="w-4 h-4 text-primary" />
            Field Visibility
          </CardTitle>
          <CardDescription>Control which data fields each role can see</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-xs text-muted-foreground">Field</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center py-2 px-3 font-medium text-xs text-muted-foreground capitalize">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.fields).map(([key, perms]) => (
                  <tr key={key} className="border-b last:border-0">
                    <td className="py-2.5 px-2 font-medium">{FIELD_LABELS[key] || key}</td>
                    {ROLES.map((role) => (
                      <td key={role} className="text-center py-2.5 px-3">
                        <Switch
                          checked={perms[role] ?? false}
                          onCheckedChange={() => toggleField('fields', key, role)}
                          disabled={role === 'owner'} // Owner always sees everything
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Page access */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <EyeOff className="w-4 h-4 text-primary" />
            Page Access
          </CardTitle>
          <CardDescription>Control which pages each role can access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-xs text-muted-foreground">Page</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center py-2 px-3 font-medium text-xs text-muted-foreground capitalize">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.pages).map(([key, perms]) => (
                  <tr key={key} className="border-b last:border-0">
                    <td className="py-2.5 px-2 font-medium">{PAGE_LABELS[key] || key}</td>
                    {ROLES.map((role) => (
                      <td key={role} className="text-center py-2.5 px-3">
                        <Switch
                          checked={perms[role] ?? false}
                          onCheckedChange={() => toggleField('pages', key, role)}
                          disabled={role === 'owner' && (key === 'dashboard' || key === 'inventory' || key === 'settings')}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Owner access to Dashboard, Inventory, and Settings cannot be disabled (prevents lockout).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
