'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Mail,
  User,
  ArrowLeft,
  Package,
  AlertCircle,
  CheckCircle2,
  Database,
  Crown,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const ROLE_INFO: Record<string, { label: string; desc: string; color: string }> = {
  owner: { label: 'Owner', desc: 'Full access + user management', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  admin: { label: 'Admin', desc: 'Full access except user management', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  manager: { label: 'Manager', desc: 'Dashboard, inventory, sales, purchases, reports', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  user: { label: 'User', desc: 'Dashboard, inventory, sales only', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

// Demo credentials shown ONLY in development mode (process.env.NODE_ENV
// is replaced at build time by Next.js, so this entire block — including
// the passwords — is dead-code-eliminated from the production bundle).
//
// The server-side /api/setup endpoint refuses to seed mock users outside
// dev, so even if these were visible in prod they couldn't grant access.
//
// These passwords MUST match what /api/seed creates (see src/lib/seed.ts).
// If you change one, change the other.
const DEV_DEMO_HINTS: ReadonlyArray<{
  email: string
  password: string
  role: 'owner' | 'admin' | 'manager' | 'user'
}> =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        { email: 'owner@liafon.com', password: 'owner123', role: 'owner' },
        { email: 'admin@liafon.com', password: 'admin123', role: 'admin' },
        { email: 'manager@liafon.com', password: 'manager123', role: 'manager' },
        { email: 'user@liafon.com', password: 'user123', role: 'user' },
      ]

type View = 'login' | 'setup' | 'loading'

// Fetch with timeout — generous 60s cap because the first dev compile
// of any API route can take 20–40s on slower machines.
function fetchWithTimeout(url: string, ms: number = 60000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout))
}

export default function LoginPage() {
  const [view, setView] = useState<View>('loading')
  const [needsSeed, setNeedsSeed] = useState(false)
  const [hasDemoUsers, setHasDemoUsers] = useState(false)

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Forgot-password flow state
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotResult, setForgotResult] = useState<{
    message: string
    devResetUrl?: string
  } | null>(null)

  // Password-reset flow state (when user clicks the email link)
  const [resetMode, setResetMode] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Setup form state
  const [setupName, setSetupName] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirm, setSetupConfirm] = useState('')

  // Track setTimeout handles so we can cancel them on unmount
  const autoLoginTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const seedReloadTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup any pending timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoLoginTimer.current) clearTimeout(autoLoginTimer.current)
      if (seedReloadTimer.current) clearTimeout(seedReloadTimer.current)
    }
  }, [])

  // Check first-run status on mount + read query params (?expired=1, ?reset-password=TOKEN)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)

      // Show "session expired" message if redirected from a 401
      if (params.get('expired') === '1') {
        setError('Your session has expired. Please sign in again.')
      }

      // Password-reset flow — user clicked the link from their email
      const resetTokenParam = params.get('reset-password')
      const resetEmailParam = params.get('email')
      if (resetTokenParam && resetEmailParam) {
        setResetToken(resetTokenParam)
        setResetEmail(resetEmailParam)
        setResetMode(true)
        setView('login')
        return // skip the setup-check — we're in reset mode
      }
    }
    let cancelled = false
    fetchWithTimeout('/api/setup', 60000)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.firstRun) {
          setView('setup')
        } else {
          setView('login')
          setNeedsSeed(Boolean(data.needsSeed))
          setHasDemoUsers(Boolean(data.hasDemoUsers))
        }
      })
      .catch(() => {
        if (!cancelled) setView('login')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Login handler ────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithTimeout('/api/auth', 60000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      // Try to parse JSON; if it fails, show a helpful error
      let data: { success?: boolean; user?: unknown; error?: string } = {}
      try {
        data = await res.json()
      } catch {
        setError(
          `Server returned an unexpected response (HTTP ${res.status}). ` +
            'Check the dev server console for errors.'
        )
        return
      }

      if (res.ok && data.user) {
        window.location.href = '/'
      } else {
        setError(data.error || `Login failed (HTTP ${res.status})`)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error'
      setError(
        `Network error: ${message}. Make sure the dev server is running on port 3000.`
      )
    } finally {
      setLoading(false)
    }
  }

  // ─── Forgot-password handler ─────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail.trim()) {
      setError('Please enter your email address')
      return
    }
    setForgotLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout('/api/auth/request-reset', 30000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForgotResult({
          message: data.message || 'If an account with that email exists, a reset link has been sent.',
          devResetUrl: data.devResetUrl,
        })
      } else {
        setError(data.error || 'Failed to send reset link')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  // ─── Reset-password handler (user clicked email link) ────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || !confirmNewPassword) {
      setError('Please enter and confirm your new password')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match')
      return
    }
    setResetLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout('/api/auth/reset-password', 30000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          email: resetEmail,
          newPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSuccess(data.message || 'Password reset successfully. You can now sign in.')
        setResetMode(false)
        // Clear the URL params
        window.history.replaceState({}, '', '/')
        // Pre-fill the email so they can sign in immediately
        setEmail(resetEmail)
        setPassword('')
      } else {
        setError(data.error || 'Failed to reset password')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setResetLoading(false)
    }
  }

  // ─── First-run setup handler ──────────────────────────────────────────────
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!setupName.trim() || !setupEmail.trim() || !setupPassword.trim()) {
      setError('All fields are required')
      return
    }
    if (setupPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (setupPassword !== setupConfirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetchWithTimeout('/api/users', 60000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setupName,
          email: setupEmail,
          password: setupPassword,
          role: 'owner', // forced to owner on first run by the API
        }),
      })

      let data: { success?: boolean; user?: { name?: string }; error?: string } = {}
      try {
        data = await res.json()
      } catch {
        setError(
          `Server returned an unexpected response (HTTP ${res.status}). ` +
            'Check the dev server console for errors.'
        )
        return
      }

      if (res.ok && data.success) {
        setSuccess(
          `Owner account "${data.user?.name || ''}" created! Signing you in...`
        )
        // Auto-login the new owner. Use a tracked timeout so we can cancel
        // it if the component unmounts before the 800ms elapses.
        autoLoginTimer.current = setTimeout(async () => {
          try {
            const loginRes = await fetchWithTimeout('/api/auth', 60000, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: setupEmail, password: setupPassword }),
            })
            if (loginRes.ok) {
              window.location.href = '/'
            } else {
              setView('login')
              setEmail(setupEmail)
              setError(
                'Account created. Please sign in with your new credentials.'
              )
            }
          } catch {
            setView('login')
            setEmail(setupEmail)
            setError(
              'Account created. Please sign in with your new credentials.'
            )
          }
        }, 800)
      } else {
        setError(data.error || `Setup failed (HTTP ${res.status})`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`Network error: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  // ─── Seed demo data handler ───────────────────────────────────────────────
  const handleSeedDemo = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout('/api/setup', 60000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSuccess('Demo data loaded! Refreshing dashboard...')
        seedReloadTimer.current = setTimeout(() => window.location.reload(), 1000)
      } else {
        setError(data.error || 'Failed to load demo data')
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load demo data'
      )
    } finally {
      setLoading(false)
    }
  }

  const fillMock = (cred: { email: string; password: string; role: string }) => {
    setEmail(cred.email)
    // Pre-fill with the actual seeded password (matches src/lib/seed.ts).
    // The user must still click "Sign In" — this is a UX shortcut, not
    // a security bypass. Demo users only exist in dev / first-run
    // seeded databases.
    setPassword(cred.password)
    setError(null)
  }

  // ─── Loading screen (while checking setup status) ─────────────────────────
  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-6 h-6 mx-auto text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            Loading… (first compile may take 20–30s)
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            If this takes more than a minute, check the dev server console for errors.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {/* Subtle dot-grid background instead of colored blobs */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, oklch(0.5 0 0 / 0.04) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">
          {/* Header — solid indigo, no gradient, no decorative circles */}
          <div
            className={`px-6 sm:px-8 pt-7 pb-6 text-white relative ${
              view === 'setup' ? 'bg-amber-600' : 'bg-primary'
            }`}
          >

            <div className="relative">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg mb-4"
              >
                {view === 'setup' ? (
                  <Crown className="w-7 h-7" />
                ) : (
                  <Package className="w-7 h-7" />
                )}
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="text-2xl font-bold tracking-tight"
              >
                {view === 'setup'
                  ? 'Create Owner Account'
                  : 'Liafon Stock Management'}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="text-primary-foreground/80 text-sm mt-1"
              >
                {view === 'setup'
                  ? 'Set up the first admin account to get started'
                  : 'Auto Spare Parts Shop System'}
              </motion.p>
            </div>
          </div>

          {/* Form */}
          <div className="p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {view === 'setup' ? (
                // ─── First-run Setup Form ─────────────────────────────────
                <motion.form
                  key="setup"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleSetup}
                  className="space-y-4"
                >
                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                    <Sparkles className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-sm text-amber-700 dark:text-amber-300">
                      <strong>First-run setup.</strong> Create your owner
                      account. This will have full access to all features
                      including user management.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label htmlFor="setup-name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="setup-name"
                        type="text"
                        placeholder="e.g. Shop Owner"
                        value={setupName}
                        onChange={(e) => {
                          setSetupName(e.target.value)
                          if (error) setError(null)
                        }}
                        className="pl-10 h-11 bg-muted/30 border-border focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                        autoComplete="name"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="setup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="setup-email"
                        type="email"
                        placeholder="owner@yourshop.com"
                        value={setupEmail}
                        onChange={(e) => {
                          setSetupEmail(e.target.value)
                          if (error) setError(null)
                        }}
                        className="pl-10 h-11 bg-muted/30 border-border focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="setup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="setup-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min 6 characters"
                        value={setupPassword}
                        onChange={(e) => {
                          setSetupPassword(e.target.value)
                          if (error) setError(null)
                        }}
                        className="pl-10 pr-10 h-11 bg-muted/30 border-border focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={0}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="setup-confirm">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="setup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        value={setupConfirm}
                        onChange={(e) => {
                          setSetupConfirm(e.target.value)
                          if (error) setError(null)
                        }}
                        className="pl-10 h-11 bg-muted/30 border-border focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="alert"
                      aria-live="polite"
                    >
                      <Alert variant="destructive" className="py-2.5 px-3">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="text-sm">
                          {error}
                        </AlertDescription>
                      </Alert>
                    </motion.div>
                  )}

                  {success && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="status"
                      aria-live="polite"
                    >
                      <Alert className="py-2.5 px-3 border-primary/30 bg-primary/5 dark:border-primary/40 dark:bg-primary/10">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        <AlertDescription className="text-sm text-primary">
                          {success}
                        </AlertDescription>
                      </Alert>
                    </motion.div>
                  )}

                  <Button
                    type="submit"
                    disabled={
                      loading ||
                      !setupName.trim() ||
                      !setupEmail.trim() ||
                      !setupPassword.trim() ||
                      !setupConfirm.trim()
                    }
                    className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-lg shadow-amber-600/20 hover:shadow-amber-600/30 transition-all duration-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{' '}
                        Creating Account...
                      </>
                    ) : (
                      <>
                        <Crown className="w-4 h-4 mr-2" /> Create Owner Account
                      </>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setView('login')
                      setError(null)
                      setSuccess(null)
                    }}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Login
                  </button>
                </motion.form>
              ) : (
                // ─── Login Form ───────────────────────────────────────────
                <motion.form
                  key="login"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          if (error) setError(null)
                        }}
                        className="pl-10 h-11 bg-muted/30 border-border focus-visible:ring-primary/30 focus-visible:border-primary"
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          if (error) setError(null)
                        }}
                        className="pl-10 pr-10 h-11 bg-muted/30 border-border focus-visible:ring-primary/30 focus-visible:border-primary"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={0}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="alert"
                      aria-live="polite"
                    >
                      <Alert variant="destructive" className="py-2.5 px-3">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="text-sm">
                          {error}
                        </AlertDescription>
                      </Alert>
                    </motion.div>
                  )}

                  {success && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="status"
                      aria-live="polite"
                    >
                      <Alert className="py-2.5 px-3 border-primary/30 bg-primary/5 dark:border-primary/40 dark:bg-primary/10">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        <AlertDescription className="text-sm text-primary">
                          {success}
                        </AlertDescription>
                      </Alert>
                    </motion.div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !email.trim() || !password.trim()}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors duration-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{' '}
                        Signing in...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" /> Sign In
                      </>
                    )}
                  </Button>

                  {/* Load demo data button (visible when DB has users but no parts) */}
                  {needsSeed && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSeedDemo}
                      disabled={loading}
                      className="w-full h-11 border-primary/30 text-primary hover:bg-primary/5 dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10"
                    >
                      <Database className="w-4 h-4 mr-2" />
                      Load Demo Data (parts, customers, suppliers)
                    </Button>
                  )}

                  {/* Quick Login (Demo) — only show if demo users actually
                      exist in the database (created by /api/seed) AND we're
                      in dev mode. In production, DEV_DEMO_HINTS is empty so
                      this section is never rendered. */}
                  {hasDemoUsers && DEV_DEMO_HINTS.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            Quick Demo Login (dev only)
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {DEV_DEMO_HINTS.map((cred) => (
                          <button
                            key={cred.email}
                            type="button"
                            onClick={() => fillMock(cred)}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border hover:bg-muted/80 transition-all duration-150 text-left group"
                          >
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                cred.role === 'owner'
                                  ? 'bg-amber-500'
                                  : cred.role === 'admin'
                                  ? 'bg-blue-500'
                                  : cred.role === 'manager'
                                  ? "bg-violet-500"
                                  : 'bg-slate-400'
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground capitalize">
                                {cred.role}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {cred.email}
                              </p>
                              {/* SECURITY: do NOT render the password here.
                                  Previously the password was shown in plain
                                  text under each demo button — visible to
                                  anyone looking over the user's shoulder
                                  and to anyone inspecting the bundle. The
                                  "quick fill" button alone is sufficient
                                  UX for dev. */}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Register Owner + Forgot Password links */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        // Always allow registration — multiple owners supported
                        setError(null)
                        setView('setup')
                      }}
                      className="text-primary hover:text-primary/80 font-medium hover:underline"
                    >
                      Create Account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setForgotOpen(true)
                        setForgotResult(null)
                        setForgotEmail(email || '')
                      }}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* ── Forgot Password Dialog ─────────────────────────────────── */}
            {forgotOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                onClick={() => setForgotOpen(false)}
              >
                <div
                  className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Reset your password
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter your email and we&apos;ll send you a verification link
                      to reset your password.
                    </p>
                  </div>

                  {forgotResult ? (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">
                          {forgotResult.message}
                        </p>
                      </div>
                      {forgotResult.devResetUrl && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                            Dev mode — email not configured
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Click the link below to reset your password:
                          </p>
                          <a
                            href={forgotResult.devResetUrl}
                            className="block text-xs text-primary underline break-all"
                          >
                            {forgotResult.devResetUrl}
                          </a>
                        </div>
                      )}
                      <Button
                        onClick={() => {
                          setForgotOpen(false)
                          setForgotResult(null)
                        }}
                        className="w-full"
                        size="sm"
                      >
                        Close
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="forgot-email" className="text-xs font-medium">
                          Email Address
                        </Label>
                        <Input
                          id="forgot-email"
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setForgotOpen(false)}
                          disabled={forgotLoading}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          className="flex-1"
                          disabled={forgotLoading}
                        >
                          {forgotLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Sending…
                            </>
                          ) : (
                            'Send Reset Link'
                          )}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* ── Reset Password Form (when user clicks email link) ──────── */}
            {resetMode && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Set a new password
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter your new password for{' '}
                      <strong>{resetEmail}</strong>
                    </p>
                  </div>
                  <form onSubmit={handleResetPassword} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-xs font-medium">
                        New Password
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-new-password" className="text-xs font-medium">
                        Confirm New Password
                      </Label>
                      <Input
                        id="confirm-new-password"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      className="w-full"
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Resetting…
                        </>
                      ) : (
                        'Reset Password'
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-5 border-t border-border">
              <p className="text-center text-[11px] text-muted-foreground">
                Powered by Liafon Software
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
