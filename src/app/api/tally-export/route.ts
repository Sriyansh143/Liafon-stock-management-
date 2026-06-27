import { NextRequest, NextResponse } from 'next/server'
import { guardManager, logApiError, apiBadRequest } from '@/lib/api-utils'
import { generateTallyXml, generateQuickBooksIif } from '@/lib/tally-export'
import { logUserActivity } from '@/lib/activity'

/**
 * GET /api/tally-export?format=<tally|iif>&startDate=...&endDate=...
 *
 * Generates accounting export files:
 *   - format=tally  → Tally XML (for TallyPrime / Tally ERP 9)
 *   - format=iif    → QuickBooks IIF (Intuit Interchange Format)
 *
 * Returns the file as a downloadable attachment.
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'tally'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) return apiBadRequest('startDate and endDate are required')
    if (!['tally', 'iif'].includes(format)) return apiBadRequest('format must be tally or iif')

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return apiBadRequest('Invalid date format. Use ISO strings.')
    }

    let content: string
    let filename: string
    let contentType: string

    if (format === 'tally') {
      content = await generateTallyXml(user.ownerId, start, end)
      filename = `tally_sales_${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.xml`
      contentType = 'application/xml'
    } else {
      content = await generateQuickBooksIif(user.ownerId, start, end)
      filename = `quickbooks_${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.iif`
      contentType = 'text/plain'
    }

    await logUserActivity(user, {
      action: 'EXPORT',
      entityType: 'sale',
      summary: `Exported ${format.toUpperCase()} file: ${filename} (${content.length} bytes)`,
      metadata: { format, filename, startDate, endDate, bytes: content.length },
    })

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(content.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logApiError('tally-export/GET', error)
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 })
  }
}
