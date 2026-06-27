# API Reference

Every endpoint in Liafon Stock Management. All endpoints return JSON unless noted. All mutations require authentication via session cookies (set by `/api/auth`).

## Authentication

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth` | POST | Login (with optional 2FA), logout, change password |
| `/api/auth` | GET | Get current session user |
| `/api/auth/request-reset` | POST | Request password reset email |
| `/api/auth/reset-password` | POST | Reset password with token |
| `/api/auth/2fa/enable` | POST | Initiate 2FA setup (returns QR + backup codes) |
| `/api/auth/2fa/verify` | POST | Complete 2FA enablement OR verify during login |
| `/api/auth/2fa/disable` | POST | Disable 2FA (requires password + TOTP) |

### POST /api/auth (login)
```json
// Request
{ "email": "owner@example.com", "password": "secret", "twoFactorCode": "123456" }

// Response (no 2FA enabled)
{ "success": true, "user": { "id": "...", "name": "...", "role": "owner" } }

// Response (2FA enabled, no code submitted)
{ "requiresTwoFactor": true, "userId": "...", "message": "2FA code required" }

// Response (invalid credentials)
{ "error": "Invalid email or password" }   // 401
```

### POST /api/auth (logout)
```json
{ "action": "logout" }
```

### POST /api/auth (change password)
```json
{ "action": "change_password", "currentPassword": "old", "newPassword": "new" }
```

## Inventory

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/parts` | GET | List parts (with cursor pagination + filters) |
| `/api/parts` | POST | Create a part |
| `/api/parts/[id]` | GET, PATCH, DELETE | Get / update / delete a part |
| `/api/parts/analysis` | GET | Low-stock analysis with recommendations |
| `/api/parts/[id]/alternatives` | GET, POST, DELETE | Manage interchangeable parts |
| `/api/stock` | POST | Adjust stock (manual adjustment) |
| `/api/inventory-snapshot` | GET | Point-in-time stock valuation |
| `/api/import` | POST | Bulk import parts from CSV/XLSX |

### GET /api/parts (cursor pagination)
```
GET /api/parts?cursor=<lastPartId>&limit=50&search=brake&category=Brakes&lowStock=true
```
```json
{
  "parts": [...],
  "total": 247,
  "limit": 50,
  "cursor": "abc123",
  "nextCursor": "def456",   // null when no more pages
  "hasMore": true
}
```

### GET /api/parts/analysis (the recommendation engine)
```
GET /api/parts/analysis?shopId=all&onlyLowStock=true
```
```json
{
  "parts": [
    {
      "partId": "...",
      "partNumber": "BRK-001",
      "name": "Front Brake Pads",
      "shopName": "Mumbai Shop",
      "currentStock": 2,
      "minStockLevel": 5,
      "isLowStock": true,
      "salesVelocityPerDay": 0.39,
      "daysOfStockLeft": 5.1,
      "lastSaleDaysAgo": 2,
      "profitMarginPercent": 51.1,
      "recommendation": "restock_now",
      "recommendationReason": "Selling 0.4/day, only 5 days of stock left. Margin 51.1% is healthy.",
      "suggestedRestockQuantity": 12,
      "priority": 2
    }
  ],
  "summary": {
    "totalParts": 247,
    "lowStockCount": 18,
    "restockNowCount": 5,
    "discontinueCount": 3,
    "deadStockValue": 14500
  },
  "perShopBreakdown": [
    { "shopId": "shop_a", "shopName": "Mumbai Shop", "lowStockCount": 8, "totalStockValue": 245000 }
  ]
}
```

## Sales

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/sales` | GET | List sales (date range + search) |
| `/api/sales` | POST | Create a sale (with GST + discount + payment) |

### POST /api/sales
```json
{
  "partId": "abc123",
  "quantity": 2,
  "unitPrice": 4500,           // optional, defaults to part.sellingPrice
  "customerName": "Raj Kumar",
  "customerPhone": "9876543210",
  "customerId": "cust_abc",    // optional, links to Customer record
  "taxRate": 28,               // optional, auto-looked-up if omitted
  "isInterState": false,       // optional, auto-detected from GSTINs
  "discount": 100,             // optional
  "discountType": "flat",      // 'flat' | 'percent'
  "amountPaid": 9000,          // optional, defaults to totalPrice (fully paid)
  "paymentMethod": "upi",      // 'cash'|'card'|'upi'|'bank'|'cheque'|'other'
  "paymentReference": "UPI-12345",
  "allowBelowCost": false      // required true if unitPrice < costPrice
}
```
```json
// Response (201)
{
  "id": "sale_abc",
  "invoiceNumber": "INV-20240101-00001",
  "totalPrice": 11520,        // includes GST
  "taxableValue": 8900,       // after discount
  "cgstAmount": 1246,
  "sgstAmount": 1246,
  "igstAmount": 0,
  "amountPaid": 9000,
  "paymentStatus": "partial"
}
```

**Error responses:**
- `404` `PART_NOT_FOUND`
- `400` `PART_INACTIVE`
- `400` `INSUFFICIENT_STOCK: <available>`
- `400` `BELOW_COST: <unitPrice>:<costPrice>`
- `404` `CUSTOMER_NOT_FOUND`
- `400` `CREDIT_LIMIT_EXCEEDED: <outstanding>:<newAmount>:<limit>`

## Purchases & POs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/purchases` | GET, POST | List / create legacy purchase |
| `/api/purchase-orders` | GET, POST | List / create draft PO |
| `/api/purchase-orders/[id]` | PATCH | Approve / receive / cancel PO |

### POST /api/purchase-orders
```json
{
  "shopId": "shop_abc",
  "supplierId": "sup_abc",
  "notes": "Monthly restock",
  "lineItems": [
    {
      "partId": "part_abc",
      "quantity": 20,
      "unitCost": 2200,
      "totalCost": 44000,
      "batchNumber": "BATCH-2024-001",
      "expiryDate": "2026-12-31"
    }
  ]
}
```

### PATCH /api/purchase-orders/[id]
```json
{ "action": "approve" }    // 'approve' | 'receive' | 'cancel'
```
On `receive`: increments stock + creates Purchase records + creates Batches + creates StockLogs in a single transaction.

## Stock Transfers

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/stock-transfers` | GET, POST | List / create transfer |
| `/api/stock-transfers/[id]` | PATCH | Ship / receive / cancel |

### POST /api/stock-transfers
```json
{
  "fromShopId": "shop_a",
  "toShopId": "shop_b",
  "partId": "part_abc",
  "quantity": 5,
  "notes": "Urgent transfer"
}
```

### PATCH /api/stock-transfers/[id]
```json
{ "action": "ship" }    // 'ship' | 'receive' | 'cancel'
```
On `receive`: auto-creates the part at destination shop if it doesn't exist (copies cost/selling prices).

## Payments

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/payments` | GET, POST | List / record payment |
| `/api/payments/upi` | GET, POST | UPI QR generation + decoding + validation |

### POST /api/payments/upi (generate QR)
```json
{
  "action": "generate_qr",
  "payeeVpa": "merchant@okhdfcbank",
  "payeeName": "Liafon Auto Parts",
  "amount": 1500,
  "note": "Invoice INV-20240101-00001",
  "transactionRef": "sale_abc",
  "size": 256
}
```
```json
// Response
{
  "success": true,
  "qrCode": "data:image/png;base64,...",
  "deepLink": "upi://pay?pa=merchant@okhdfcbank&pn=Liafon+Auto+Parts&am=1500.00&tn=Invoice...",
  "size": 256
}
```

### POST /api/payments/upi (decode uploaded QR)
```json
{
  "action": "decode_qr",
  "imageBase64": "data:image/png;base64,iVBOR..."
}
```
```json
// Response
{
  "success": true,
  "rawText": "upi://pay?pa=customer@okicici&am=1500.00",
  "upi": {
    "payeeVpa": "customer@okicici",
    "amount": 1500,
    "isValid": true
  }
}
```

## Customers & Suppliers

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/customers` | GET, POST | List / create customer |
| `/api/suppliers` | GET, POST | List / create supplier |
| `/api/departments` | GET, POST | List / create department |
| `/api/departments/[id]` | PATCH, DELETE | Update / delete department |

## Shops

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/shops` | GET, POST | List / create shop |

## Tax Rates

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/tax-rates` | GET, POST | List / upsert per-category GST rate |

## Reports

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/reports` | GET | Sales/purchases/inventory reports (JSON) |
| `/api/reports/pdf?type=pl\|gst\|inventory` | GET | PDF report (downloadable) |

```
GET /api/reports/pdf?type=gst&startDate=2024-01-01&endDate=2024-12-31
→ Content-Type: application/pdf
→ Content-Disposition: attachment; filename="GSTR1_2024-01-01_to_2024-12-31.pdf"
```

## WhatsApp

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/whatsapp/send` | POST | Send via legacy OpenWA (deprecated) |
| `/api/whatsapp/status` | GET | Legacy OpenWA status |
| `/api/whatsapp/baileys/send` | POST | Send via free Baileys (recommended) |
| `/api/whatsapp/baileys/status` | GET, POST | Get QR / connection status / logout |

### POST /api/whatsapp/baileys/send
```json
{ "to": "919876543210", "message": "Hello from Liafon" }
```

### GET /api/whatsapp/baileys/status
```json
{
  "connected": false,
  "qrCode": "data:image/png;base64,...",   // when not connected
  "viaExternalServer": true                 // true on Vercel
}
```

### POST /api/whatsapp/baileys/status (logout)
```json
{ "action": "logout" }
```

## Voice & Video

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/voice/call` | GET, POST | Initiate voice call OR generate Jitsi room |

### POST /api/voice/call (voice)
```json
{ "action": "call", "to": "919876543210", "from": "911234567890", "ttsText": "Hello" }
```

### POST /api/voice/call (video)
```json
{ "action": "video_room", "customerName": "Raj Kumar" }
```
```json
{ "success": true, "roomUrl": "https://meet.jit.si/abc12345", "provider": "jitsi" }
```

## Backup & Restore

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/backup` | GET | List backups (local + Supabase Storage) |
| `/api/backup` | POST | Create backup / restore / trigger missed |
| `/api/backup?download=<filename>` | GET | Download (redirects to signed URL) |
| `/api/backup?filename=<filename>` | DELETE | Delete backup |
| `/api/reset-database` | POST | Factory reset (owner-only) |

### POST /api/backup
```json
// Full backup
{ "type": "full" }

// Range backup
{ "type": "range", "preset": "weekly" }   // 'weekly' | 'monthly' | 'custom'

// Custom range
{ "type": "range", "preset": "custom", "startDate": "2024-01-01", "endDate": "2024-12-31" }

// Restore
{ "type": "restore", "filename": "backup_full_2024-01-15T10-30-00.json" }

// Trigger missed daily backup
{ "type": "missed" }
```

## Users

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/users` | GET, POST | List / create user |
| `/api/users` | PATCH | Update user (role, isActive, password) |

## Customization

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/customization` | GET, POST, DELETE | Get / save / reset field+page permissions |
| `/api/customization/me` | GET | Get permissions for current user |

## Audit

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/activity` | GET | List activity log entries |
| `/api/audit/cleanup` | GET, POST | Get stats / trigger retention cleanup |

## Setup & System

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/setup` | GET, POST | First-run status / seed demo data |
| `/api/seed` | POST | Owner-initiated re-seed (dev only) |
| `/api/license` | GET, POST | License status / activate / deactivate |
| `/api/notifications` | GET | Get low-stock notifications |
| `/api/test-email` | POST | Send test email (admin only) |
| `/api/cron/backup` | GET, POST | Vercel Cron endpoint (CRON_SECRET protected) |
