import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/shops — CRUD for multi-shop / multi-branch.
 *
 * GET    /api/shops               — list all shops for the owner
 * POST   /api/shops { name, address, ... }  — create a new shop
 *
 * Owners can have unlimited shops. Each shop has its own inventory,
 * sales, purchases, customers, suppliers. Users can be assigned to a
 * shop (User.shopId) — they see only their shop's data.
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const shops = await db.shop.findMany({
      where: { ownerId: user.ownerId },
      include: {
        _count: {
          select: {
            spareParts: true,
            sales: true,
            users: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ shops, total: shops.length })
  } catch (error) {
    logApiError('shops/GET', error)
    return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { name, address, city, state, pincode, phone, email, gstin, latitude, longitude } = body as {
      name?: string
      address?: string
      city?: string
      state?: string
      pincode?: string
      phone?: string
      email?: string
      gstin?: string
      latitude?: number
      longitude?: number
    }

    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return NextResponse.json({ error: 'Shop name is required' }, { status: 400 })
    }

    const shop = await db.shop.create({
      data: {
        ownerId: user.ownerId,
        name: name.trim(),
        address: address?.trim() || '',
        city: city?.trim() || '',
        state: state?.trim() || '',
        pincode: pincode?.trim() || '',
        phone: phone?.trim() || '',
        email: email?.trim() || '',
        gstin: gstin?.trim().toUpperCase() || '',
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
      },
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'system',
      entityId: shop.id,
      summary: `Shop created: ${shop.name}`,
      metadata: { shopId: shop.id, name: shop.name, city: shop.city, state: shop.state },
    })

    return NextResponse.json(shop, { status: 201 })
  } catch (error) {
    logApiError('shops/POST', error)
    return NextResponse.json({ error: 'Failed to create shop' }, { status: 500 })
  }
}
