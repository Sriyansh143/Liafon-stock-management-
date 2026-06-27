'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Upload,
  Download,
  Database,
  HardDrive,
  ShoppingCart,
  PackageOpen,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Info,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Trash2,
  RotateCw,
  Server,
  MessageCircle,
  Zap,
  FileText,
  KeyRound,
  Eye,
  EyeOff,
  Calendar,
  AlertTriangle,
  Settings,
  Cloud,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/store/app-store'
import { CustomizeTab } from '@/components/pages/customize-tab'
import { ConnectionsTab } from '@/components/pages/connections-tab'
import { TaxRatesSection, TwoFactorSection, WhatsAppSection } from '@/components/phase4/settings-sections'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ──────────────────────────────────────────────
interface BackupFile {
  filename: string
  date: string
  size: string
}

interface WhatsAppStatus {
  connected: boolean
  message?: string
}

// ── Animation variants ─────────────────────────────────
const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
}

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
}

// ── Account Tab: change own password ────────────────────────────────────────
function AccountTab() {
  const { toast } = useToast()
  const currentUser = useAppStore((s) => s.currentUser)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'All fields are required', variant: 'destructive' })
      return
    }
    if (newPassword.length < 6) {
      toast({ title: 'New password must be at least 6 characters', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'New passwords do not match', variant: 'destructive' })
      return
    }
    if (newPassword === currentPassword) {
      toast({ title: 'New password must be different from current', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      // The /api/auth change_password endpoint verifies the current
      // password AND updates to the new one in a single call.
      const updateRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_password',
          currentPassword,
          newPassword,
        }),
      })
      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => ({}))
        toast({ title: 'Failed to change password', description: err.error || 'Unknown error', variant: 'destructive' })
        setSubmitting(false)
        return
      }
      toast({ title: 'Password changed', description: 'Please sign in again with your new password.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      // Force re-login so the new password takes effect cleanly
      setTimeout(() => {
        window.location.href = '/?login=1'
      }, 1500)
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentUser) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Not signed in.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4 text-primary" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your own password. You&apos;ll be signed out after the change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            {/* Current Password */}
            <div className="space-y-1.5">
              <Label htmlFor="current-password" className="text-xs font-medium">
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-medium">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-medium">
                Confirm New Password
              </Label>
              <Input
                id="confirm-password"
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Changing…
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Change Password
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{currentUser.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{currentUser.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary" className="capitalize">{currentUser.role}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Component ──────────────────────────────────────────
export default function SettingsPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentUser = useAppStore((s) => s.currentUser)

  // Import state
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Backup state
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState<string | null>(null)

  // WhatsApp state
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [loadingWaStatus, setLoadingWaStatus] = useState(false)
  const [testingWa, setTestingWa] = useState(false)

  // App info state
  const [totalParts, setTotalParts] = useState<number>(0)
  const [totalSales, setTotalSales] = useState<number>(0)
  const [loadingAppInfo, setLoadingAppInfo] = useState(true)

  // ── Fetch data on mount ─────────────────────────────
  useEffect(() => {
    fetchBackups()
    fetchWhatsAppStatus()
    fetchAppInfo()
  }, [])

  const fetchBackups = async () => {
    setLoadingBackups(true)
    try {
      const res = await fetch('/api/backup')
      if (res.ok) {
        const data = await res.json()
        setBackups(data.backups || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingBackups(false)
    }
  }

  const fetchWhatsAppStatus = async () => {
    setLoadingWaStatus(true)
    try {
      const res = await fetch('/api/whatsapp/status')
      if (res.ok) {
        const data = await res.json()
        setWaStatus(data)
      } else {
        setWaStatus({ connected: false, message: 'WhatsApp server not configured' })
      }
    } catch {
      setWaStatus({ connected: false, message: 'Cannot reach WhatsApp service' })
    } finally {
      setLoadingWaStatus(false)
    }
  }

  const fetchAppInfo = async () => {
    setLoadingAppInfo(true)
    try {
      const [partsRes, salesRes] = await Promise.all([
        fetch('/api/parts?limit=1'),
        fetch('/api/sales?limit=1'),
      ])
      if (partsRes.ok) {
        const partsData = await partsRes.json()
        setTotalParts(partsData.total || 0)
      }
      if (salesRes.ok) {
        const salesData = await salesRes.json()
        setTotalSales(salesData.total || 0)
      }
    } catch {
      // silent
    } finally {
      setLoadingAppInfo(false)
    }
  }

  // ── Excel Import Handlers ───────────────────────────
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // keep in sync with /api/import default
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    const validExts = ['.xlsx', '.xls', '.csv']
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      toast({ title: 'Invalid file', description: 'Please select an .xlsx, .xls, or .csv file', variant: 'destructive' })
      return
    }
    // Client-side size guard so we don't waste a 5MB upload on a 50MB file
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: 'File too large',
        description: `Max size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Yours is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setImportResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Use XHR so we can read real upload progress events (fetch doesn't
      // expose upload progress without ReadableStream gymnastics).
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/import')
        xhr.upload.onprogress = (e: ProgressEvent) => {
          if (e.lengthComputable) {
            // Cap at 95% — the remaining 5% is server-side processing.
            setUploadProgress(Math.min(95, Math.round((e.loaded / e.total) * 100)))
          }
        }
        xhr.onload = () => {
          setUploadProgress(100)
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText)
              setImportResult({ imported: data.imported || 0, skipped: data.skipped || 0 })
              toast({
                title: 'Import complete',
                description: `${data.imported || 0} parts imported, ${data.skipped || 0} skipped`,
              })
            } catch {
              toast({ title: 'Import failed', description: 'Invalid server response', variant: 'destructive' })
            }
            resolve()
          } else {
            try {
              const err = JSON.parse(xhr.responseText)
              toast({
                title: 'Import failed',
                description: err.error || `HTTP ${xhr.status}`,
                variant: 'destructive',
              })
            } catch {
              toast({ title: 'Import failed', description: `HTTP ${xhr.status}`, variant: 'destructive' })
            }
            reject(new Error(`HTTP ${xhr.status}`))
          }
        }
        xhr.onerror = () => {
          toast({ title: 'Import failed', description: 'Network error. Please try again.', variant: 'destructive' })
          reject(new Error('Network error'))
        }
        xhr.send(formData)
      })
    } catch {
      // Errors already handled via toast in the XHR callbacks above
    } finally {
      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
      }, 600)
    }
  }, [toast])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/import/template')
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'import-template.xlsx'
        a.click()
        URL.revokeObjectURL(url)
        toast({ title: 'Template downloaded', description: 'Fill in your parts data and re-import' })
      } else {
        toast({ title: 'Download failed', description: 'Could not download template', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Download failed', description: 'Network error', variant: 'destructive' })
    }
  }

  // ── Backup Handlers ─────────────────────────────────
  const handleCreateBackup = async (type: string) => {
    setCreatingBackup(type)
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (res.ok) {
        const data = await res.json()
        toast({
          title: 'Backup created',
          description: `Saved as ${data.filename}`,
        })
        fetchBackups()
      } else {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Backup failed', description: err.error || 'Unknown error', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Backup failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setCreatingBackup(null)
    }
  }

  // ── Scheduled / Range Backup ──────────────────────────
  const [rangePreset, setRangePreset] = useState<'weekly' | 'monthly' | 'custom'>('weekly')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')

  const handleScheduledBackup = async () => {
    setCreatingBackup('range')
    try {
      const body: { type: 'range'; preset?: string; startDate?: string; endDate?: string } = {
        type: 'range',
        preset: rangePreset,
      }
      if (rangePreset === 'custom') {
        if (!rangeStart || !rangeEnd) {
          toast({ title: 'Select dates', description: 'Please pick both start and end dates.', variant: 'destructive' })
          setCreatingBackup(null)
          return
        }
        body.startDate = rangeStart
        body.endDate = rangeEnd
      }
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        toast({
          title: 'Range backup created',
          description: `${data.filename} (${data.recordCounts.sales} sales, ${data.recordCounts.purchases} purchases)`,
        })
        fetchBackups()
      } else {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Backup failed', description: err.error || 'Unknown error', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Backup failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setCreatingBackup(null)
    }
  }

  const handleDownloadBackup = async (filename: string) => {
    try {
      const res = await fetch(`/api/backup?filename=${encodeURIComponent(filename)}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      } else {
        toast({ title: 'Download failed', description: 'Could not download backup file', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Download failed', description: 'Network error', variant: 'destructive' })
    }
  }

  const [restoringBackup, setRestoringBackup] = useState<string | null>(null)
  const [deletingBackup, setDeletingBackup] = useState<string | null>(null)

  const handleRestoreBackup = async (filename: string) => {
    setRestoringBackup(filename)
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'restore', filename }),
      })
      if (res.ok) {
        toast({
          title: 'Restore complete',
          description: 'Database restored successfully. Reloading...',
        })
        setTimeout(() => window.location.reload(), 1500)
      } else {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Restore failed', description: err.error || 'Unknown error', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Restore failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setRestoringBackup(null)
    }
  }

  const handleDeleteBackup = async (filename: string) => {
    setDeletingBackup(filename)
    try {
      const res = await fetch(`/api/backup?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast({ title: 'Backup deleted', description: filename })
        fetchBackups()
      } else {
        const err = await res.json().catch(() => ({}))
        toast({ title: 'Delete failed', description: err.error || 'Unknown error', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Delete failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setDeletingBackup(null)
    }
  }

  // ── Reset Database (Danger Zone) ──────────────────────
  const [resettingDb, setResettingDb] = useState(false)
  const [resetDbResult, setResetDbResult] = useState<{ success: boolean; message: string } | null>(null)
  const handleResetDatabase = async () => {
    setResettingDb(true)
    setResetDbResult(null)
    try {
      const res = await fetch('/api/reset-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResetDbResult({
          success: true,
          message: data.message || 'Database reset successfully.',
        })
        toast({
          title: 'Database reset',
          description: 'All data has been deleted. Reloading…',
        })
        // Refresh the app stats + backups list
        setTimeout(() => {
          fetchAppInfo()
          fetchBackups()
        }, 500)
      } else {
        setResetDbResult({
          success: false,
          message: data.error || 'Failed to reset database',
        })
        toast({ title: 'Reset failed', description: data.error || 'Unknown error', variant: 'destructive' })
      }
    } catch {
      setResetDbResult({ success: false, message: 'Network error' })
      toast({ title: 'Reset failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setResettingDb(false)
    }
  }

  // ── WhatsApp Handlers ───────────────────────────────
  const handleTestConnection = async () => {
    setTestingWa(true)
    try {
      const res = await fetch('/api/whatsapp/status')
      if (res.ok) {
        const data = await res.json()
        setWaStatus(data)
        toast({
          title: data.connected ? 'WhatsApp connected' : 'WhatsApp not connected',
          description: data.message || (data.connected ? 'WhatsApp is ready' : 'Check your configuration'),
          variant: data.connected ? 'default' : 'destructive',
        })
      }
    } catch {
      toast({ title: 'Connection failed', description: 'Cannot reach WhatsApp service', variant: 'destructive' })
    } finally {
      setTestingWa(false)
    }
  }

  // ── Copy to clipboard ───────────────────────────────
  // navigator.clipboard is undefined in non-HTTPS contexts (e.g.
  // http://192.168.x.x:3000 on a LAN). Fall back to a hidden textarea
  // + document.execCommand('copy') for those cases.
  const copyCommand = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast({ title: 'Copied to clipboard', description: text }),
        () => fallbackCopy(text)
      )
    } else {
      fallbackCopy(text)
    }
  }

  const fallbackCopy = (text: string) => {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast({ title: 'Copied to clipboard', description: text })
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy manually.', variant: 'destructive' })
    }
  }

  // ── Render ──────────────────────────────────────────
  return (
    <motion.div {...fadeIn}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage imports, backups, and configuration</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="w-full sm:w-auto flex flex-wrap">
          <TabsTrigger value="account" className="gap-1.5">
            <KeyRound className="w-4 h-4" />
            <span className="hidden xs:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden xs:inline">Import</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5">
            <Database className="w-4 h-4" />
            <span className="hidden xs:inline">Backup</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5">
            <MessageCircle className="w-4 h-4" />
            <span className="hidden xs:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="info" className="gap-1.5">
            <Info className="w-4 h-4" />
            <span className="hidden xs:inline">App Info</span>
          </TabsTrigger>
          <TabsTrigger value="connections" className="gap-1.5">
            <Cloud className="w-4 h-4" />
            <span className="hidden xs:inline">Connections</span>
          </TabsTrigger>
          <TabsTrigger value="customize" className="gap-1.5">
            <Settings className="w-4 h-4" />
            <span className="hidden xs:inline">Customize</span>
          </TabsTrigger>
          <TabsTrigger value="phase4" className="gap-1.5">
            <Settings className="w-4 h-4" />
            <span className="hidden xs:inline">Tax / 2FA / WhatsApp</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Account (change own password) ─────── */}
        <TabsContent value="account">
          <motion.div {...fadeIn}>
            <AccountTab />
          </motion.div>
        </TabsContent>

        {/* ── Tab: Excel Import ─────────────────────── */}
        <TabsContent value="import">
          <motion.div {...fadeIn}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  Excel Import
                </CardTitle>
                <CardDescription>Import parts data from Excel or CSV files</CardDescription>
                <CardAction>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="gap-1.5 text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Template
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                    e.target.value = ''
                  }}
                />

                {/* Drop Zone — keyboard-accessible via role=button + tabIndex */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    // Activate with Enter or Space (mimics a button)
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!isUploading) fileInputRef.current?.click()
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload inventory file. Click or press Enter to choose a file, or drag and drop."
                  aria-busy={isUploading}
                  className={`
                    relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer
                    transition-all duration-200
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2
                    ${isDragOver
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                      : isUploading
                        ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/10'
                        : 'border-border hover:border-emerald-400 hover:bg-muted/30'
                    }
                  `}
                >
                  {isUploading ? (
                    <div className="space-y-4">
                      <Loader2 className="w-10 h-10 text-amber-500 mx-auto animate-spin" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Uploading & processing...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.round(uploadProgress)}% complete
                        </p>
                      </div>
                      <div className="max-w-xs mx-auto">
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    </div>
                  ) : importResult ? (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="space-y-3"
                    >
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                      <div>
                        <p className="text-base font-semibold text-foreground">Import Complete</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          <span className="text-emerald-600 font-medium">{importResult.imported} parts</span> imported
                          {importResult.skipped > 0 && (
                            <>, <span className="text-amber-600 font-medium">{importResult.skipped}</span> skipped (duplicates)</>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setImportResult(null)
                        }}
                        className="mt-2"
                      >
                        Import Another File
                      </Button>
                    </motion.div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-14 h-14 mx-auto rounded-xl bg-muted flex items-center justify-center">
                        <Upload className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {isDragOver ? 'Drop your file here' : 'Drag & drop your file here'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          or <span className="text-emerald-600 underline">click to browse</span>
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Supports .xlsx, .xls, and .csv files
                      </p>
                    </div>
                  )}
                </div>

                {/* Info about template */}
                <Alert className="mt-4 border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <Info className="w-4 h-4 text-emerald-600" />
                  <AlertTitle className="text-emerald-800 dark:text-emerald-300">Template Info</AlertTitle>
                  <AlertDescription className="text-emerald-700/80 dark:text-emerald-400/80">
                    Download the sample template to see the expected column format. Required columns: partName, partNumber, category, quantity, costPrice, sellingPrice, minStockLevel.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Tab: Backup & Restore ─────────────────── */}
        <TabsContent value="backup">
          <motion.div {...stagger} className="space-y-6">
            {/* Create Backup */}
            <motion.div {...fadeIn}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    Create Backup
                  </CardTitle>
                  <CardDescription>Create a backup of your data</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => handleCreateBackup('full')}
                      disabled={creatingBackup !== null}
                      className="h-auto py-4 flex-col gap-2 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 dark:border-emerald-900 dark:hover:bg-emerald-950/20"
                    >
                      {creatingBackup === 'full' ? (
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                      ) : (
                        <Database className="w-5 h-5 text-emerald-600" />
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium">Full Backup</p>
                        <p className="text-[11px] text-muted-foreground">All data</p>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleCreateBackup('inventory')}
                      disabled={creatingBackup !== null}
                      className="h-auto py-4 flex-col gap-2 border-amber-200 hover:bg-amber-50 hover:border-amber-300 dark:border-amber-900 dark:hover:bg-amber-950/20"
                    >
                      {creatingBackup === 'inventory' ? (
                        <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                      ) : (
                        <HardDrive className="w-5 h-5 text-amber-600" />
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium">Inventory Only</p>
                        <p className="text-[11px] text-muted-foreground">Parts data</p>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleCreateBackup('sales')}
                      disabled={creatingBackup !== null}
                      className="h-auto py-4 flex-col gap-2 border-rose-200 hover:bg-rose-50 hover:border-rose-300 dark:border-rose-900 dark:hover:bg-rose-950/20"
                    >
                      {creatingBackup === 'sales' ? (
                        <Loader2 className="w-5 h-5 animate-spin text-rose-600" />
                      ) : (
                        <ShoppingCart className="w-5 h-5 text-rose-600" />
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium">Sales Data</p>
                        <p className="text-[11px] text-muted-foreground">Sales records</p>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleCreateBackup('purchases')}
                      disabled={creatingBackup !== null}
                      className="h-auto py-4 flex-col gap-2 border-slate-300 hover:bg-slate-50 hover:border-slate-400 dark:border-slate-700 dark:hover:bg-slate-950/20"
                    >
                      {creatingBackup === 'purchases' ? (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                      ) : (
                        <PackageOpen className="w-5 h-5 text-slate-600" />
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium">Purchases Data</p>
                        <p className="text-[11px] text-muted-foreground">Purchase orders</p>
                      </div>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Auto Backup Info */}
            <motion.div {...fadeIn}>
              <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                <Clock className="w-4 h-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">Auto Backup</AlertTitle>
                <AlertDescription className="text-amber-700/80 dark:text-amber-400/80">
                  The system automatically creates a full backup daily at the configured hour (default: 2:00 AM).
                  Backups are stored in the <code className="text-xs bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">backups/</code> folder.
                </AlertDescription>
              </Alert>
            </motion.div>

            {/* Scheduled / Range Backup */}
            <motion.div {...fadeIn}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="w-4 h-4 text-primary" />
                    Scheduled / Range Backup
                  </CardTitle>
                  <CardDescription>
                    Back up sales and purchases for a specific time period (weekly, monthly, or custom dates).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(['weekly', 'monthly', 'custom'] as const).map((p) => (
                      <Button
                        key={p}
                        variant={rangePreset === p ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setRangePreset(p)}
                        className="text-xs capitalize"
                      >
                        {p === 'weekly' ? 'Last 7 days' : p === 'monthly' ? 'Last 30 days' : 'Custom range'}
                      </Button>
                    ))}
                  </div>
                  {rangePreset === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Start date</Label>
                        <Input
                          type="date"
                          value={rangeStart}
                          onChange={(e) => setRangeStart(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End date</Label>
                        <Input
                          type="date"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  )}
                  <Button
                    onClick={handleScheduledBackup}
                    disabled={creatingBackup !== null}
                    className="gap-2"
                    size="sm"
                  >
                    {creatingBackup === 'range' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4" />
                        Create {rangePreset === 'custom' ? 'Custom' : rangePreset === 'weekly' ? 'Weekly' : 'Monthly'} Backup
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Backup History */}
            <motion.div {...fadeIn}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-600" />
                    Backup History
                  </CardTitle>
                  <CardDescription>Available backup files</CardDescription>
                  <CardAction>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchBackups}
                      className="gap-1.5 text-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {loadingBackups ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="text-center py-8">
                      <Database className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No backups yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Create your first backup above</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {backups.map((backup) => (
                        <div
                          key={backup.filename}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                            <Database className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{backup.filename}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{backup.date}</span>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground">{backup.size}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDownloadBackup(backup.filename)}
                              title="Download"
                              aria-label="Download backup"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                  title="Restore this backup"
                                  aria-label="Restore this backup"
                                  disabled={restoringBackup === backup.filename}
                                >
                                  {restoringBackup === backup.filename ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RotateCw className="w-4 h-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will replace all current data with the backup from{' '}
                                    <span className="font-medium">{backup.filename}</span>.
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleRestoreBackup(backup.filename)}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                  >
                                    Restore
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                  title="Delete this backup"
                                  aria-label="Delete this backup"
                                  disabled={deletingBackup === backup.filename}
                                >
                                  {deletingBackup === backup.filename ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete backup?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete{' '}
                                    <span className="font-medium">{backup.filename}</span> and its
                                    companion Excel file (if any). This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteBackup(backup.filename)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* ── Tab: WhatsApp Config ──────────────────── */}
        <TabsContent value="whatsapp">
          <motion.div {...fadeIn} className="space-y-6">
            {/* Connection Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-emerald-600" />
                  WhatsApp Connection
                </CardTitle>
                <CardDescription>Self-hosted WhatsApp integration via Liafon Software</CardDescription>
                <CardAction>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testingWa}
                    className="gap-1.5 text-xs"
                  >
                    {testingWa ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Test Connection
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {loadingWaStatus ? (
                  <Skeleton className="h-16 w-full rounded-lg" />
                ) : (
                  <div
                    className={`
                      flex items-center gap-3 p-4 rounded-lg border
                      ${waStatus?.connected
                        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                        : 'border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20'
                      }
                    `}
                  >
                    <div
                      className={`
                        w-3 h-3 rounded-full shrink-0
                        ${waStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}
                      `}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {waStatus?.connected ? 'Connected' : 'Not Connected'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {waStatus?.message || 'WhatsApp service status unknown'}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`
                        ml-auto text-xs
                        ${waStatus?.connected
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                        }
                      `}
                    >
                      {waStatus?.connected ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Setup Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-slate-600" />
                  Setup Instructions
                </CardTitle>
                <CardDescription>How to set up self-hosted WhatsApp for direct messaging</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      step: 1,
                      title: 'Install Docker',
                      desc: 'Ensure Docker and Docker Compose are installed on your server or machine.',
                    },
                    {
                      step: 2,
                      title: 'Clone & Run WhatsApp Server',
                      desc: null,
                      command: 'git clone https://github.com/rmyndharis/OpenWA.git && cd OpenWA && docker compose -f docker-compose.dev.yml up -d',
                    },
                    {
                      step: 3,
                      title: 'Scan QR Code',
                      desc: 'Open http://localhost:2785 in your browser and scan the WhatsApp QR code with your phone.',
                    },
                    {
                      step: 4,
                      title: 'Copy API Key',
                      desc: 'After connecting, copy the API key from the server dashboard.',
                    },
                    {
                      step: 5,
                      title: 'Set Environment Variable',
                      desc: null,
                      command: 'OPENWA_API_KEY=your_api_key_here',
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{item.step}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {item.desc && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                        )}
                        {item.command && (
                          <div
                            className="mt-2 flex items-start gap-2 bg-slate-900 dark:bg-slate-800 rounded-lg p-3 group"
                          >
                            <code className="text-xs text-emerald-400 font-mono flex-1 break-all whitespace-pre-wrap">
                              {item.command}
                            </code>
                            <button
                              onClick={() => copyCommand(item.command!)}
                              className="text-slate-400 hover:text-white transition-colors shrink-0 mt-0.5"
                              title="Copy"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Fallback Notice */}
            <Alert className="border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30">
              <ExternalLink className="w-4 h-4 text-slate-500" />
              <AlertTitle className="text-slate-700 dark:text-slate-300">Fallback Mode</AlertTitle>
              <AlertDescription className="text-slate-600/80 dark:text-slate-400/80">
                If the WhatsApp server is not configured, sharing will use{' '}
                <span className="font-medium">wa.me links</span> that open WhatsApp Web/Desktop. 
                This still works great for sharing reports and alerts!
              </AlertDescription>
            </Alert>
          </motion.div>
        </TabsContent>

        {/* ── Tab: App Info ──────────────────────────── */}
        <TabsContent value="info">
          <motion.div {...fadeIn} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-emerald-600" />
                  Application Information
                </CardTitle>
                <CardDescription>System details and statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'App Name', value: 'Liafon Stock Management', icon: Zap },
                    { label: 'Version', value: '1.0.0', icon: ShieldCheck },
                    { label: 'Database', value: 'SQLite (prisma/db.sqlite)', icon: Database },
                    { label: 'WhatsApp', value: 'Self-hosted with wa.me fallback', icon: MessageCircle },
                    {
                      label: 'Total Parts',
                      value: loadingAppInfo ? undefined : totalParts.toString(),
                      icon: HardDrive,
                    },
                    {
                      label: 'Total Sales',
                      value: loadingAppInfo ? undefined : totalSales.toString(),
                      icon: ShoppingCart,
                    },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <div
                        key={item.label}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                      >
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          {item.value === undefined ? (
                            <Skeleton className="h-4 w-20 mt-0.5" />
                          ) : (
                            <p className="text-sm font-medium text-foreground">{item.value}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* ── Danger Zone: Reset Database ─────────────────────────────── */}
            <Card className="border-rose-300 dark:border-rose-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-rose-600/80 dark:text-rose-400/80">
                  Reset the database to a clean state. This will permanently delete all
                  parts, sales, purchases, customers, suppliers, departments, and users —
                  except your own owner account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-2">
                      <Trash2 className="w-4 h-4" />
                      Reset Database
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset the entire database?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete:
                      </AlertDialogDescription>
                      <ul className="text-sm text-muted-foreground list-disc pl-5 mt-2 space-y-1">
                        <li>All spare parts ({totalParts ?? 0} items)</li>
                        <li>All sales records</li>
                        <li>All purchase records</li>
                        <li>All customers and suppliers</li>
                        <li>All departments</li>
                        <li>All users <strong>except your own owner account</strong></li>
                        <li>All activity logs and app settings</li>
                      </ul>
                      <AlertDialogDescription className="mt-3 font-medium text-rose-600">
                        This action cannot be undone. Your owner account will be preserved
                        so you can continue to sign in.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={resettingDb}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault()
                          void handleResetDatabase()
                        }}
                        disabled={resettingDb}
                        className="bg-rose-600 hover:bg-rose-700 text-white gap-2"
                      >
                        {resettingDb ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Resetting…
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            Yes, Reset Everything
                          </>
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {resetDbResult && (
                  <Alert
                    className={
                      resetDbResult.success
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                        : 'border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30'
                    }
                  >
                    <AlertDescription
                      className={
                        resetDbResult.success
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-700 dark:text-rose-300'
                      }
                    >
                      {resetDbResult.message}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Tab: Connections ─────── */}
        <TabsContent value="connections">
          <motion.div {...fadeIn}>
            <ConnectionsTab />
          </motion.div>
        </TabsContent>

        {/* ── Tab: Customize (owner/admin only) ─────── */}
        <TabsContent value="customize">
          <motion.div {...fadeIn}>
            <CustomizeTab />
          </motion.div>
        </TabsContent>

        {/* ── Tab: Phase 4 (tax rates, 2FA, WhatsApp) ─────── */}
        <TabsContent value="phase4">
          <motion.div {...fadeIn} className="space-y-4">
            <TaxRatesSection />
            <TwoFactorSection user={currentUser as { twoFactorEnabled?: boolean } | null} />
            <WhatsAppSection />
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}