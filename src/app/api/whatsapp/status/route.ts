import { NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'

export async function GET(
  request: Parameters<typeof guardAuth>[0]
) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const openwaApiUrl = process.env.OPENWA_API_URL
    const openwaApiKey = process.env.OPENWA_API_KEY
    const openwaSession = process.env.OPENWA_SESSION || 'default'

    // Check if OpenWA is configured
    if (!openwaApiUrl || !openwaApiKey) {
      return NextResponse.json({
        connected: false,
        method: 'none',
        sessionName: openwaSession,
        message: 'OpenWA API not configured',
      })
    }

    try {
      const response = await fetch(
        `${openwaApiUrl}/sessions/${openwaSession}/status`,
        {
          method: 'GET',
          headers: {
            apikey: openwaApiKey,
          },
        }
      )

      if (response.ok) {
        const data = await response.json()
        return NextResponse.json({
          connected: true,
          method: 'openwa',
          sessionName: openwaSession,
          data,
        })
      }

      return NextResponse.json({
        connected: false,
        method: 'openwa',
        sessionName: openwaSession,
        status: response.status,
        message: 'OpenWA session not connected',
      })
    } catch (error) {
      console.error('OpenWA status check error:', error)
      return NextResponse.json({
        connected: false,
        method: 'openwa',
        sessionName: openwaSession,
        message: error instanceof Error ? error.message : 'Failed to connect to OpenWA',
      })
    }
  } catch (error) {
    logApiError('whatsapp/status', error)
    return NextResponse.json(
      { error: 'Failed to check WhatsApp status' },
      { status: 500 }
    )
  }
}
