'use client'

/**
 * Shops Manager — multi-shop / multi-branch CRUD.
 *
 * Lists all shops for the owner with stats (parts, sales, users counts).
 * Add/edit/delete shops via dialog.
 *
 * Wired to /api/shops (GET, POST).
 */

import { useCallback, useEffect, useState } from 'react'
import { Store, Plus, Pencil, Trash2, Loader2, MapPin, Phone, Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'

interface Shop {
  id: string
  ownerId: string
  name: string
  address: string
  city: string
  state: string
  pincode: string
  phone: string
  email: string
  gstin: string
  isActive: boolean
  createdAt: string
  _count?: { spareParts: number; sales: number; users: number }
}

const EMPTY_FORM = {
  name: '', address: '', city: '', state: '', pincode: '',
  phone: '', email: '', gstin: '',
}

export function ShopsManager() {
  const { toast } = useToast()
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingShop, setEditingShop] = useState<Shop | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null)

  const fetchShops = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shops')
      if (!res.ok) throw new Error('Failed to fetch shops')
      const data = await res.json()
      setShops(data.shops)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load shops',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void fetchShops() }, [fetchShops])

  const openAdd = () => {
    setEditingShop(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (shop: Shop) => {
    setEditingShop(shop)
    setForm({
      name: shop.name, address: shop.address, city: shop.city, state: shop.state,
      pincode: shop.pincode, phone: shop.phone, email: shop.email, gstin: shop.gstin,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      // Note: /api/shops currently only supports POST (create). For edit,
      // we'd need PATCH /api/shops/[id]. For now, only allow create.
      if (editingShop) {
        toast({
          title: 'Edit not yet supported',
          description: 'The /api/shops/[id] PATCH endpoint is not implemented. Delete + recreate.',
          variant: 'destructive',
        })
        setDialogOpen(false)
        return
      }
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create shop')
      }
      toast({ title: 'Shop created', description: form.name })
      setDialogOpen(false)
      void fetchShops()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save shop',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      // Delete via direct DB call would need an endpoint — for now, the
      // /api/shops route doesn't expose DELETE. Show a notice.
      toast({
        title: 'Delete not yet supported',
        description: 'The /api/shops/[id] DELETE endpoint is not implemented. Use Supabase dashboard to remove.',
        variant: 'destructive',
      })
      setDeleteTarget(null)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 text-indigo-600" />
            Shops & Branches
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your shop locations. Each shop has its own inventory, sales, and staff.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" /> Add Shop
        </Button>
      </div>

      {shops.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Store className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-4">No shops yet. Add your first shop to get started.</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Add Shop
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shops.map((shop) => (
            <Card key={shop.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                      {shop.name}
                    </CardTitle>
                    {shop.gstin && (
                      <p className="text-xs text-gray-500 mt-1 font-mono">GSTIN: {shop.gstin}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(shop)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(shop)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {shop.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>{shop.address}{shop.city ? `, ${shop.city}` : ''}{shop.state ? `, ${shop.state}` : ''} {shop.pincode}</span>
                  </div>
                )}
                {shop.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{shop.phone}</span>
                  </div>
                )}
                <div className="flex gap-4 pt-2 border-t">
                  <div>
                    <div className="text-xs text-gray-500">Parts</div>
                    <div className="font-semibold">{shop._count?.spareParts ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Sales</div>
                    <div className="font-semibold">{shop._count?.sales ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Staff</div>
                    <div className="font-semibold">{shop._count?.users ?? 0}</div>
                  </div>
                </div>
                <Badge variant={shop.isActive ? 'default' : 'secondary'} className="mt-2">
                  {shop.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShop ? 'Edit Shop' : 'Add Shop'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mumbai Shop" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main Street" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Mumbai" />
              </div>
              <div>
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Maharashtra" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pincode</Label>
                <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} placeholder="400001" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="shop@example.com" />
            </div>
            <div>
              <Label>GSTIN</Label>
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="27AABCA1234F1Z5" maxLength={15} />
              <p className="text-xs text-gray-500 mt-1">Used for GST calculation (inter-state detection).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingShop ? 'Save' : 'Create Shop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shop "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will not delete the shop's data (parts, sales) — only the shop record.
              Linked records will have their shopId set to null.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
