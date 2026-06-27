'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, Database, Cloud, CheckCircle2, XCircle, ExternalLink, Save, Loader2, TestTube, Puzzle, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ConnectionStatus {
  gmail: { configured: boolean; user?: string }
  database: { type: string; connected: boolean }
  cloud: { url?: string; key?: string }
}

export function ConnectionsTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [gmailUser, setGmailUser] = useState('')
  const [gmailPassword, setGmailPassword] = useState('')
  const [appBaseUrl, setAppBaseUrl] = useState('http://localhost:3000')
  const [cloudLicenseUrl, setCloudLicenseUrl] = useState('')
  const [cloudLicenseKey, setCloudLicenseKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [dbType, setDbType] = useState('sqlite')

  const checkStatus = useCallback(async () => {
    setLoading(true)
    try {
      // Check health endpoint for DB status
      const healthRes = await fetch('/api')
      if (!healthRes.ok) {
        setDbType('Disconnected')
        return
      }
      try {
        const health = await healthRes.json()
        setDbType(health?.database?.connected ? 'Connected' : 'Disconnected')
      } catch {
        // Non-JSON response — show as unknown rather than spinning forever
        setDbType('Unknown')
      }
    } catch {
      // Network error — also show as unknown (previously the UI showed
      // "Loading…" forever because setLoading(false) was never reached
      // when fetch threw).
      setDbType('Unknown')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const handleSaveGmail = async () => {
    setSaving(true)
    try {
      // Save to .env via API (or instruct user to edit .env manually)
      // Since we can't write to .env from the browser, we show instructions
      toast({
        title: 'Save these values to .env',
        description: `Add these lines to your .env file:\nGMAIL_USER=${gmailUser}\nGMAIL_APP_PASSWORD=${gmailPassword}\nAPP_BASE_URL=${appBaseUrl}\nThen restart the server.`,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestGmail = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: gmailUser }),
      })
      const data = await res.json()
      if (data.success) {
        toast({
          title: 'Test email sent!',
          description: `Check ${gmailUser} inbox for the test message.`,
        })
      } else {
        toast({
          title: 'Gmail not configured',
          description: data.error || 'Set GMAIL_USER and GMAIL_APP_PASSWORD in .env file, then restart.',
          variant: 'destructive',
        })
      }
    } catch {
      toast({ title: 'Test failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Connections</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure external services. Values are saved to the .env file — restart the server after changes.
        </p>
      </div>

      {/* Gmail Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              Gmail (Password Reset Emails)
            </div>
            <Badge variant={gmailUser ? 'default' : 'outline'} className="text-xs">
              {gmailUser ? 'Configured' : 'Not Set'}
            </Badge>
          </CardTitle>
          <CardDescription>Send password-reset verification links via Gmail</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Setup steps:</strong><br/>
              1. Enable 2-Step Verification:{' '}
              <a href="https://myaccount.google.com/security" target="_blank" rel="noopener" className="underline">
                Google Security <ExternalLink className="inline w-3 h-3" />
              </a><br/>
              2. Generate App Password:{' '}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="underline">
                App Passwords <ExternalLink className="inline w-3 h-3" />
              </a><br/>
              3. Enter values below → Save to .env → Restart server
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Gmail Address</Label>
              <Input
                type="email"
                value={gmailUser}
                onChange={(e) => setGmailUser(e.target.value)}
                placeholder="your-email@gmail.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">App Password (16 chars)</Label>
              <Input
                type="password"
                value={gmailPassword}
                onChange={(e) => setGmailPassword(e.target.value)}
                placeholder="abcd efgh ijkl mnop"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">App Base URL (where users access the app)</Label>
            <Input
              type="text"
              value={appBaseUrl}
              onChange={(e) => setAppBaseUrl(e.target.value)}
              placeholder="http://localhost:3000 or http://192.168.29.209:3000"
              className="h-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleSaveGmail} disabled={saving || !gmailUser} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Show Save Instructions
            </Button>
            <Button size="sm" variant="outline" onClick={handleTestGmail} disabled={testing || !gmailUser} className="gap-1.5">
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
              Test Email
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Database Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Database
            </div>
            <Badge variant="default" className="text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {dbType}
            </Badge>
          </CardTitle>
          <CardDescription>Current database connection status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Current:</strong> SQLite (local file at <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">data/liafon.db</code>)</p>
            <p><strong>Upgrade to PostgreSQL (cloud):</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Create free database at{' '}
                <a href="https://supabase.com" target="_blank" rel="noopener" className="underline text-primary">
                  Supabase <ExternalLink className="inline w-3 h-3" />
                </a>
              </li>
              <li>Copy the connection string</li>
              <li>Edit <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">prisma/schema.prisma</code>: change <code>provider = "sqlite"</code> to <code>"postgresql"</code></li>
              <li>Set <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">DATABASE_URL</code> in <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">.env</code></li>
              <li>Run <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">npx prisma db push</code></li>
              <li>Restart the server — all data now syncs to cloud</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Cloud License Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" />
              Cloud License Server (Developer)
            </div>
            <Badge variant={cloudLicenseUrl ? 'default' : 'outline'} className="text-xs">
              {cloudLicenseUrl ? 'Connected' : 'Not Set'}
            </Badge>
          </CardTitle>
          <CardDescription>Remote license validation (see DEVELOPER/CLOUD-LICENSE-SETUP.md)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Cloud License Server URL</Label>
            <Input
              type="text"
              value={cloudLicenseUrl}
              onChange={(e) => setCloudLicenseUrl(e.target.value)}
              placeholder="https://liafon-license-server.vercel.app"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">License Key</Label>
            <Input
              type="text"
              value={cloudLicenseKey}
              onChange={(e) => setCloudLicenseKey(e.target.value)}
              placeholder="LIAFON-XXXX-XXXX"
              className="h-9 text-sm"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              toast({
                title: 'Add to .env',
                description: `CLOUD_LICENSE_URL=${cloudLicenseUrl}\nCLOUD_LICENSE_KEY=${cloudLicenseKey}\nThen restart the server.`,
              })
            }}
            disabled={!cloudLicenseUrl}
            className="gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Instructions
          </Button>
        </CardContent>
      </Card>

      {/* Vercel Deployment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cloud className="w-4 h-4 text-primary" />
            Deploy to Cloud (Vercel)
          </CardTitle>
          <CardDescription>Host the app online 24/7 with a permanent URL</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>1. Push code to GitHub</p>
            <p>2. Import at{' '}
              <a href="https://vercel.com" target="_blank" rel="noopener" className="underline text-primary">
                Vercel <ExternalLink className="inline w-3 h-3" />
              </a>
            </p>
            <p>3. Set environment variables (DATABASE_URL, GMAIL_USER, etc.)</p>
            <p>4. Deploy → get permanent HTTPS URL</p>
            <p>5. Open on phone → Install as PWA</p>
          </div>
          <a href="https://vercel.com" target="_blank" rel="noopener">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Open Vercel
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Plugins & Extensions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Puzzle className="w-4 h-4 text-primary" />
            Plugins & Extensions
          </CardTitle>
          <CardDescription>Connect additional services and upload configuration files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Available plugins */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available Plugins</p>
            {[
              { name: 'WhatsApp (OpenWA)', desc: 'Send messages directly via API', status: 'Optional', url: 'https://github.com/openwa/openwa', envVars: 'OPENWA_API_URL, OPENWA_API_KEY' },
              { name: 'Barcode Scanner', desc: 'Scan barcodes with camera to look up parts', status: 'Planned', url: '', envVars: '' },
              { name: 'AI Stock Counter', desc: 'Count stock from photos using AI', status: 'Future', url: '', envVars: '' },
              { name: 'Supabase (PostgreSQL)', desc: 'Cloud database for multi-device sync', status: 'Optional', url: 'https://supabase.com', envVars: 'DATABASE_URL' },
              { name: 'Firebase (Auth + Push)', desc: 'Google authentication + push notifications', status: 'Future', url: 'https://firebase.google.com', envVars: '' },
            ].map((plugin) => (
              <div key={plugin.name} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{plugin.name}</p>
                  <p className="text-[11px] text-muted-foreground">{plugin.desc}</p>
                  {plugin.envVars && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">.env: {plugin.envVars}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant={plugin.status === 'Optional' ? 'default' : 'outline'}
                    className={`text-[10px] ${plugin.status === 'Planned' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : plugin.status === 'Future' ? 'bg-muted text-muted-foreground' : ''}`}
                  >
                    {plugin.status}
                  </Badge>
                  {plugin.url && (
                    <a href={plugin.url} target="_blank" rel="noopener">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Upload .env file */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upload .env Configuration</p>
            <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
                Upload a .env file to quickly configure all plugins at once. The file will replace your current .env.
              </AlertDescription>
            </Alert>
            <input
              type="file"
              accept=".env,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  const content = String(ev.target?.result || '')
                  // Parse env file and show instructions
                  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'))
                  toast({
                    title: 'Env file loaded',
                    description: `${lines.length} configuration lines found. Copy this content to your .env file:\n\n${lines.slice(0, 5).join('\n')}${lines.length > 5 ? '...' : ''}`,
                  })
                }
                reader.readAsText(file)
              }}
              className="hidden"
              id="env-upload"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => document.getElementById('env-upload')?.click()}
              className="gap-1.5 w-full"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload .env File
            </Button>
          </div>

          {/* Manual env editor */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Add Environment Variable</p>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="KEY"
                className="h-8 text-xs flex-1"
                id="env-key-input"
              />
              <Input
                type="text"
                placeholder="VALUE"
                className="h-8 text-xs flex-1"
                id="env-value-input"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => {
                  const key = (document.getElementById('env-key-input') as HTMLInputElement)?.value
                  const value = (document.getElementById('env-value-input') as HTMLInputElement)?.value
                  if (key && value) {
                    toast({
                      title: 'Add to .env',
                      description: `Add this line to your .env file:\n${key}=${value}\nThen restart the server.`,
                    })
                    ;(document.getElementById('env-key-input') as HTMLInputElement).value = ''
                    ;(document.getElementById('env-value-input') as HTMLInputElement).value = ''
                  }
                }}
              >
                <Save className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
