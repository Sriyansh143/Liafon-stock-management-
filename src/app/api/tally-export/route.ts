import { NextRequest, NextResponse } from 'next/server'
import { guardManager, logApiError, apiBadRequest } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const sp = request.nextUrl.searchParams
    const format = sp.get('format') || 'tally'
    const startDate = sp.get('startDate')
    const endDate = sp.get('endDate')
    if (!startDate || !endDate) return apiBadRequest('startDate + endDate required')
    if (!['tally', 'iif'].includes(format)) return apiBadRequest('format must be tally or iif')
    const start = new Date(startDate); const end = new Date(endDate)
    const sales = await db.sale.findMany({ where: { ownerId: user.ownerId, date: { gte: start, lte: end } }, include: { part: { select: { name: true, partNumber: true } } }, orderBy: { date: 'asc' } })

    let content = ''; let filename = ''; let contentType = ''
    if (format === 'tally') {
      content = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>${sales.map(s => `<TALLYMESSAGE><VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>${s.date.toISOString().slice(0,10)}</DATE><VOUCHERNUMBER>${s.invoiceNumber}</VOUCHERNUMBER><PARTYLEDGERNAME>${s.customerName}</PARTYLEDGERNAME><NARRATION>Invoice ${s.invoiceNumber}</NARRATION><ENVELOPE><LEDGERNAME>${s.customerName}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>${s.totalPrice.toFixed(2)}</AMOUNT></ENVELOPE><ENVELOPE><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${s.taxableValue.toFixed(2)}</AMOUNT></ENVELOPE></VOUCHER></TALLYMESSAGE>`).join('')}</REQUESTDATA></IMPORTDATA><!-- Powered by Liafon Stock Management --></BODY></ENVELOPE>`
      filename = `tally_${startDate.slice(0,10)}_to_${endDate.slice(0,10)}.xml`; contentType = 'application/xml'
    } else {
      const lines = ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO', '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO', '!ENDTRNS', '; Powered by Liafon Stock Management']
      for (const s of sales) { const d = s.date.toISOString().slice(0,10); lines.push(`TRNS\tINVOICE\t${d}\tAccounts Receivable\t${s.customerName}\t${s.totalPrice.toFixed(2)}\t${s.invoiceNumber}\tInvoice`); lines.push(`SPL\tINVOICE\t${d}\tSales Income\t${s.customerName}\t${(-s.taxableValue).toFixed(2)}\t${s.invoiceNumber}\t${s.part?.name}`); lines.push('ENDTRNS') }
      content = lines.join('\n'); filename = `quickbooks_${startDate.slice(0,10)}_to_${endDate.slice(0,10)}.iif`; contentType = 'text/plain'
    }
    await logUserActivity(user, { action: 'EXPORT', entityType: 'sale', summary: `Exported ${format.toUpperCase()}: ${filename}`, metadata: { format, filename, bytes: content.length } })
    return new NextResponse(content, { status: 200, headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': String(content.length), 'Cache-Control': 'no-store' } })
  } catch (error) { logApiError('tally-export/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
