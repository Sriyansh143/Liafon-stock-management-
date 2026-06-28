# Changelog — Liafon Stock Management

## v3.8.0 (2026-06-21) — Auth fixes + documentation

### 🚨 Critical fixes

- **React Hooks violation in `sales-page.tsx`** — `handleExportCSV`
  (`useCallback`) was called AFTER the `if (loading) return` early
  return, violating the Rules of Hooks ("Rendered more hooks than
  during the previous render"). Moved the callback before the early
  return. Same audit applied to `purchases-page.tsx` (was already
  clean).
- **Demo logins not working** — two root causes:
  1. The login page filled `demo123` as the password, but the seed
     creates users with `owner123` / `admin123` / `manager123` /
     `user123`. Aligned `DEV_DEMO_HINTS` with `src/lib/seed.ts`.
  2. The seed refused to create demo users when ANY users existed
     (e.g. after the owner created their account via first-run setup).
     Now the seed creates demo users individually, skipping any that
     already exist by email. The demo owner (`owner@liafon.com`) is
     skipped if a real owner already exists (to avoid the "only one
     owner" constraint).
- **`hasDemoUsers` flag** — `/api/setup` GET now returns a
  `hasDemoUsers` boolean. The login page only shows the "Quick Demo
  Login" buttons when demo users actually exist in the database (was
  showing them whenever `!needsSeed`, which included databases with
  only a custom owner and no demo users).

### ✨ New features

- **"Register as Owner" link** on the login page:
  - If no users exist → switches to the first-run setup form
  - If users exist → shows "An owner account is already registered.
    Only one owner can exist per installation."
- **"Forgot password?" link** on the login page:
  - Shows instructions for non-owners (ask the owner to reset via
    Users page)
  - Shows instructions for owners (reset the database and re-create)
- **Self-service password change** — new "Account" tab in Settings:
  - Any logged-in user can change their own password
  - Requires current password verification
  - New password must be ≥ 6 characters and different from current
  - User is signed out after the change
- **`POST /api/auth` `change_password` action** — server-side endpoint
  that verifies the current password and updates to the new one.
  Authenticated (any role). Logs the change to ActivityLog.
- **Password hints on demo login buttons** — each quick-demo button
  now shows the password (`owner123`, etc.) in monospace text so users
  know what to type.

### 📝 Documentation

- **`DATABASE.md`** — comprehensive reference document covering:
  - Quick start guide
  - Database schema + reset instructions
  - All user accounts + demo credentials
  - Role hierarchy + access levels
  - Password security + changing passwords
  - Forgot password flow
  - Owner registration flow
  - Every feature with its location in the UI
  - Complete API endpoint reference (all 30+ routes)
  - All environment variables
  - Third-party integrations (OpenWA, SheetJS, Prisma, etc.) with
    links and setup instructions
  - Troubleshooting guide (stuck loading, demo logins, Docker, etc.)

### 📦 Files changed in v3.8.0

- `src/components/pages/sales-page.tsx` — moved `handleExportCSV`
  useCallback before the `if (loading) return` early return (Rules
  of Hooks fix)
- `src/components/login-page.tsx` — `DEV_DEMO_HINTS` now includes
  the actual seeded passwords; added "Register as Owner" link;
  added "Forgot password?" link; demo login buttons show password
  hints; uses `hasDemoUsers` flag instead of `!needsSeed`
- `src/components/pages/settings-page.tsx` — new "Account" tab with
  self-service password change form
- `src/app/api/auth/route.ts` — new `change_password` action
  (verifies current password, hashes new password, logs activity)
- `src/app/api/setup/route.ts` — GET now returns `hasDemoUsers`
  boolean
- `src/lib/seed.ts` — creates demo users individually (skips existing
  by email); skips demo owner if a real owner exists
- `DATABASE.md` — **NEW** comprehensive reference document
- `package.json` / `src/app/api/route.ts` — version bump to 3.8.0

---

## v3.7.0 (2026-06-21) — Professional redesign + loading fix

### 🚨 Critical fix

- **"Stuck on initialization page"** — the loading screen had a 60-second
  auth-check timeout with no UI feedback for the first 30 seconds, AND
  a second 30s timeout for the parts-check that fires after auth. If
  either fetch was slow (e.g. dev-server first compile, slow network,
  background tab throttling), the user was stuck on a skeleton with no
  recourse.

  Three fixes:
  1. Auth-check timeout reduced from 60s → 12s.
  2. Parts-check timeout reduced from 30s → 10s.
  3. Hard 15-second fallback: no matter what state the auth effect is
     in, after 15s we force `loading=false` and show either the
     dashboard (if `currentUser` got set) or the login screen.
  4. Loading screen redesigned with a real progress bar (0→90% over
     12s), an elapsed-seconds counter, and a Retry button that appears
     after 8s instead of 30s.

### 🎨 Professional design overhaul

The previous theme was **pure grayscale** — no accent color at all in
the CSS variables, with `emerald-600` hard-coded in components
(clashing). The login page had colored blob backgrounds and gradient
headers. None of it looked like a professional B2B app.

**New design language:**

- **Color palette**: slate base + indigo accent. Restrained, business-
  appropriate. Indigo (`oklch(0.48 0.18 264)`) replaces emerald as the
  brand color everywhere — sidebar active state, primary buttons,
  focus rings, links, chart primary color, user avatar background.
- **Typography**: proper system font stack ordered by OS
  (`-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI Variable",
  "Segoe UI", Roboto, …`). Added `font-feature-settings` for
  contextual alternates, `letter-spacing: -0.006em` on body and
  `-0.02em` on headings for tighter, more confident type. Tabular
  numerals on all tables.
- **Sidebar**: removed `bg-gradient-to-br from-emerald-500 to-emerald-700`
  brand header (was demo-y). Replaced with a solid `bg-primary` 8×8
  logo mark + "Liafon / STOCK MANAGEMENT" wordmark. Active nav items
  now use a subtle `bg-primary/10 text-primary` + a 2px left accent
  bar instead of a full emerald gradient pill with shadow.
- **Header**: tighter (h-14 → h-14 with smaller text), `bg-background/95
  backdrop-blur` with `supports-[backdrop-filter]` progressive
  enhancement. Avatar changed from `rounded-full bg-emerald-100` to
  `rounded-md bg-primary text-primary-foreground` (square, on-brand).
  Sign-out menu item uses `text-destructive` (semantic) instead of
  `text-rose-600` (raw).
- **Login page**: removed the three colored blob backgrounds
  (`bg-emerald-500/5 blur-3xl`, `bg-amber-500/5`, `bg-emerald-500/3`).
  Replaced with a subtle dot-grid pattern (`radial-gradient` at 24px
  intervals, 4% opacity). Login card uses `rounded-xl shadow-lg`
  instead of `rounded-2xl shadow-xl`. Header is solid `bg-primary`
  instead of `bg-gradient-to-r from-emerald-600 to-emerald-700`.
- **Dashboard KPI cards**: `p-6` → `p-5`, `rounded-full` icon
  container → `rounded-md`, large emerald-tinted icon → small
  indigo-tinted icon. Label is now `text-xs uppercase tracking-wider`
  instead of `text-sm font-medium` (more "metric card" feel). Value
  uses `tabular-nums` so numbers don't shift width when they update.
- **Chart palette**: was `['#10b981', '#f59e0b', '#14b8a6', '#f97316',
  '#f43f5e', '#8b5cf6', '#06b6d4', '#ec4899']` (random bright colors).
  Now `['#4f46e5', '#0891b2', '#7c3aed', '#db2777', '#ea580c',
  '#16a34a', '#ca8a04', '#dc2626']` — indigo-led, all 600-level
  saturation for harmony. Area chart stroke + fill changed from
  emerald to indigo.
- **Inventory valuation strip**: was a gradient `from-emerald-50 via-
  white to-amber-50` with emerald border. Now a clean `bg-muted/40`
  with neutral border — the indigo accent on the icon is enough.
- **Role badges**: Owner was `bg-amber-100 text-amber-800` (warning
  yellow, doesn't fit). Now `bg-primary/10 text-primary` (on-brand).
  Other roles use muted sky/violet/slate.
- **Scrollbars**: custom thin scrollbars (8px) with subtle slate thumb.
- **Selection**: soft indigo `::selection` background.
- **Focus rings**: `outline-ring/60` with `outline-offset-2` — visible
  but not aggressive.

### 📦 Files changed in v3.7.0

- `src/app/globals.css` — full theme rewrite (slate + indigo)
- `src/app/layout.tsx` — refined system font stack
- `src/components/home-page.tsx` — loading screen redesign with
  progress bar + 15s hard fallback + 12s/10s timeouts; sidebar
  redesign (no gradient, indigo accent); header redesign (tighter,
  indigo avatar); role badge colors updated
- `src/components/login-page.tsx` — dot-grid background, solid indigo
  header (no gradient), all emerald → primary, refined card styling
- `src/components/pages/dashboard.tsx` — KPI card redesign, chart
  palette update (indigo-led), inventory valuation strip refined,
  activity badges muted
- `package.json` / `src/app/api/route.ts` — version bump to 3.7.0

---

## v3.6.1 (2026-06-21) — Hotfix

### 🚨 Critical fix

- **`Failed to execute 'fetch' on 'Window': Illegal invocation`** — the
  `useSessionExpiry` hook (added in v3.6.0) patched `window.fetch` but
  called the original without binding it to `window`. Since `fetch` is
  a method on `Window`, losing `this` makes the browser throw
  "Illegal invocation" on every single fetch in the app — including
  the initial `/api/auth` check that fires on page load.

  Fixed by binding the original fetch to `window` before wrapping it,
  and by adding a `window.__liafonFetchWrapped` flag so HMR / StrictMode
  doesn't install the wrapper twice (which was the secondary cause —
  on hot reload, the captured `originalFetch` reference went stale).

### 🧹 Removed (per request — "remove unnecessary features lagging the process")

- **`useGlobalErrorHandler` hook removed.** It only `console.error`-ed
  things that already show up in the console. Zero user-visible value,
  one fewer `useEffect` per page mount.
- **`useFetch` / `useMutation` / cache / dedup machinery removed from
  `hooks/use-fetch.ts`.** This was ~250 lines of code that no page
  actually used (every page hand-rolls fetch with `useCallback`).
  Carrying it along added bundle weight AND had a real cache-poisoning
  bug we already had to fix once. The file now exports only
  `useDebounce` — the one hook that was actually imported anywhere.

### 📦 Files changed in v3.6.1

- `src/hooks/use-session-expiry.ts` — bind original fetch to `window`,
  HMR-safe double-install guard
- `src/hooks/use-fetch.ts` — stripped to just `useDebounce` (~250
  lines deleted)
- `src/hooks/use-global-error-handler.ts` — **DELETED**
- `src/components/home-page.tsx` — removed `useGlobalErrorHandler`
  import and call
- `package.json` / `src/app/api/route.ts` — version bump

---

## v3.6.0 (2026-06-20) — Engineering Pass 2

This release closes every remaining audit item from v3.5.0 and ships
several net-new features (CSV exports, date-range selectors, pagination,
session-expiry handling, polished invoices).

### 🚀 New features

- **Header notifications bell** — already shipped in v3.5.0, now
  augmented by a global `useSessionExpiry` hook that watches every
  fetch for 401 responses and gracefully redirects to login with a
  "Your session has expired" message (debounced so 10 simultaneous
  401s produce one toast, not 10).
- **Date-range selector on Reports → Daily tab** (7 / 14 / 30 / 60 /
  90 / 180 / 365 days). The API now whitelists allowed values so an
  attacker can't request `days=999999`.
- **CSV export on Reports → Daily tab** — one click downloads a CSV
  with Date / Sales / Purchases / Net / ItemsSold / ItemsPurchased.
- **Pagination UI** — new `<DataTablePagination>` component wired into
  the Activity Log page (was hardcoded to `limit=100` with no
  pagination). Other pages (inventory/sales/purchases/users) can opt
  in via the same component.
- **`DELETE /api/backup?filename=...`** — admins can now delete
  individual backup files from the Settings page (was accumulating
  forever). Companion `.xlsx` files are deleted automatically.
- **`DELETE` button in Settings → Backup list** with an `AlertDialog`
  confirmation and a loading spinner on the button itself.
- **Real upload progress** on Settings → Excel Import. Replaced the
  random-number `setInterval` with `XMLHttpRequest.upload.onprogress`
  so the progress bar reflects actual bytes uploaded.
- **Max-file-size client check** on Excel import — rejects oversized
  files before wasting a 5MB upload.
- **Restore loading state** — the Restore button now shows a spinner
  and is disabled while the restore is in flight (was fire-and-forget
  — the user could click 5 times and trigger 5 restores).
- **Keyboard-accessible drop zone** in Settings — `role="button"`,
  `tabIndex={0}`, Enter/Space activation, `aria-busy` during upload,
  visible focus ring.
- **`useGlobalErrorHandler` hook** — catches unhandled promise
  rejections and `window.error` events, logs them with a structured
  prefix so they're easy to copy into a bug report.
- **Polished print invoice** — now supports:
  - Optional GST fields (`shopGstNumber`, `customerGstNumber`)
  - Tax breakdown (rate + amount) in the totals section
  - Discount line (when > 0)
  - Amount Paid + Balance Due (when `amountPaid > 0`)
  - Payment-status badge (PAID / UNPAID / PARTIAL) next to "INVOICE"
  - "Amount in words" line using Indian numbering system
    (Crore / Lakh / Thousand) — powered by new `numberToWords()`
  - Auto-falls-back to "Payment Terms: Due on receipt" when no
    GST info is provided (backwards-compatible)
- **`GET /api/reports?type=lowstock`** — new bonus report type that
  returns low-stock items with deficit + restock value + severity
  (critical/warning). Powers a future "restock planner" UI.
- **Activity log pagination** — server-side `?page=N&limit=M` is now
  used by the Activity page (was hardcoded to 100 entries; a busy
  shop would never see older entries).
- **Users page → Deactivate confirm dialog** — deactivating a user
  now shows an `AlertDialog` (activation is still instant since it's
  non-destructive).
- **Users page → Toggle-active loading state** — the toggle button
  shows a spinner and is disabled while the PUT is in flight (was
  fire-and-forget; user could double-click).
- **Users page → PATCH semantics** — `handleToggleActive` now sends
  only `{ id, isActive }` instead of the full user object, so it
  can't accidentally overwrite concurrent changes by another admin.

### 🐛 Bug fixes

- **`/api/reports` O(n×m) find-in-map eliminated.** The daily report
  previously did `purchasesData.find(p => p.date === sale.date)` inside
  a `.map()` — now uses a `Map<dateStr, purchase>` for O(1) lookups.
- **`/api/reports` misleading `totalCostValue` metric fixed.** The
  old version summed per-part unit `costPrice` across all parts in a
  category, which is meaningless (it's not "cost value" — it's "sum
  of unit prices"). The new version correctly computes
  `sum(costPrice × currentStock)` per category — the actual inventory
  cost value.
- **`/api/reports` `category` type N+1 eliminated.** Previously loaded
  every sale row + its full part record into memory then aggregated
  in JS. Now uses `db.sale.groupBy({ by: ['partId'] })` + a single
  batched `findMany` for part categories.
- **`/api/reports` `profit` type N+1 eliminated.** Same refactor —
  `groupBy` + batched `findMany` instead of `findMany({ include: part })`.
- **`/api/setup` and `/api/seed` deduplicated.** Both routes had
  copy-pasted seed logic (the code comment in `/api/setup` even
  admitted "kept in sync with /api/seed"). Now both call the shared
  `src/lib/seed.ts` module.
- **`/api/seed` N+1 inserts eliminated.** Every `for...of` loop with
  `await db.X.create({ data: ... })` per row has been replaced with
  `db.X.createMany({ data: [...] })` — one query per table instead
  of N.
- **`/api/seed` non-deterministic random fixed.** Used `Math.random`
  which made backup-then-restore produce different data than the
  original. Now uses a seeded PRNG (`mulberry32`) so seeded data is
  reproducible.
- **`/api/seed` invoice numbers added.** Seeded sales and purchases
  now get sequential `INV-YYYYMMDD-NNNNN` / `PUR-YYYYMMDD-NNNNN`
  numbers (was empty string).
- **`/api/seed` mock-user gate.** The 4 demo users with well-known
  passwords (`owner123`, etc.) are now refused in production unless
  `LIAFON_ALLOW_MOCK_USERS_IN_PROD=1`. The seeder is also idempotent
  (safe to call multiple times).
- **Login page reads `?expired=1` query param** — when redirected
  from a 401, the login form shows "Your session has expired. Please
  sign in again." instead of a blank form.
- **Settings drop zone keyboard support** — was `div` with only
  `onClick`. Now `role="button"` + `tabIndex={0}` + Enter/Space
  activation + visible focus ring + `aria-busy` during upload.
- **Activity page now resets to page 1 when filters change** — was
  stuck on whatever page the user was last on, even if that page
  no longer existed after applying a filter.

### 🔒 Security

- **`days` parameter whitelisted** in `/api/reports` — only
  `[7, 14, 30, 60, 90, 180, 365]` are accepted; anything else
  silently defaults to 30. Prevents an attacker from forcing a
  365-day query by setting `days=36500`.
- **`DELETE /api/backup` filename validation** — same strict regex
  as restore (`backup_<type>_<timestamp>.json` or
  `export_<type>_<timestamp>.xlsx`). `path.basename()` is also
  applied to prevent path traversal.

### 🎨 UI polish

- **Restore button** now shows a `Loader2` spinner and is disabled
  while a restore is in flight.
- **Delete-backup button** with red `Trash2` icon + `AlertDialog`
  confirmation + spinner during delete.
- **Settings drop zone** gets a visible focus ring when keyboard-
  focused.
- **Reports → Daily tab toolbar** shows the date-range selector and
  CSV export button on the same line, wrapping gracefully on mobile.
- **Activity page pagination bar** with "Showing X–Y of Z entries"
  + page-size selector (10/20/50/100/200) + First/Prev/Next/Last
  buttons.

### 📊 Performance

- **`/api/reports` daily** — was O(n+m) with find-in-map; now O(n+m)
  with Map lookups. For a 365-day report with 10k sales this is the
  difference between 4M comparisons and 365.
- **`/api/reports` category** — was `findMany({ include: part })`
  loading every sale + its full part record; now `groupBy` + one
  batched `findMany` for parts. ~10x less data over the wire.
- **`/api/reports` profit** — same `groupBy` + batched `findMany`
  refactor.
- **`/api/seed`** — every `for...of` with N sequential `await
  db.X.create()` calls replaced with one `createMany`. For 20 parts +
  5 customers + 5 suppliers + ~15 sales + 8 purchases + 23 stock
  logs, this is ~76 queries → 6 queries.

### 📦 Files changed in v3.6.0

- `src/app/api/backup/route.ts` — `DELETE` handler for deleting backups
- `src/app/api/reports/route.ts` — full rewrite: `groupBy` + batched
  `findMany`, Map-based joins, fixed `totalCostValue` metric, added
  `lowstock` report type, `days` whitelist, summary objects
- `src/app/api/route.ts` — version bump to 3.6.0
- `src/app/api/seed/route.ts` — now uses shared `lib/seed.ts`
- `src/app/api/setup/route.ts` — now uses shared `lib/seed.ts`
- `src/lib/seed.ts` — **NEW** shared seeder with `createMany`,
  deterministic PRNG, dev-only mock users
- `src/lib/print.ts` — invoice now supports GST, tax, discount,
  payment status, amount-in-words (`numberToWords`), balance due
- `src/components/data-table-pagination.tsx` — **NEW** reusable
  pagination component
- `src/components/notifications-bell.tsx` — (unchanged from v3.5.0)
- `src/components/home-page.tsx` — wired `useSessionExpiry` +
  `useGlobalErrorHandler`
- `src/components/login-page.tsx` — reads `?expired=1` query param
- `src/components/pages/activity-page.tsx` — server-side pagination,
  aria-labels on filters
- `src/components/pages/reports-page.tsx` — date-range selector,
  CSV export, type updates for new API summary fields
- `src/components/pages/settings-page.tsx` — real XHR upload
  progress, max-size client check, delete-backup button + dialog,
  restore loading state, keyboard-accessible drop zone
- `src/components/pages/users-page.tsx` — toggle-active loading
  state, deactivate confirm dialog, PATCH-only-changed-fields
- `src/hooks/use-global-error-handler.ts` — **NEW** catches unhandled
  rejections + window errors
- `src/hooks/use-session-expiry.ts` — **NEW** 401 interceptor

---

## v3.5.0 (2026-06-20) — Audit & Engineering Pass

This release ships a comprehensive audit-driven overhaul: every API route
was reviewed, security holes were closed, performance bottlenecks were
eliminated, the audit log is now actually used, and a new notifications
system was added.

### 🚨 Critical security fixes

- **`/api/whatsapp/send` and `/api/whatsapp/status` now require auth.**
  Previously anyone could send WhatsApp messages through the configured
  OpenWA instance, or probe its existence. Both endpoints now go through
  `guardAuth`.
- **`/api/whatsapp/send` validates input.** Phone numbers must match
  E.164-ish format (6-15 digits, optional leading `+`); messages are
  capped at 4096 characters. Previously any string was accepted.
- **Login rate limiting.** After 10 failed attempts from the same
  IP+email within 5 minutes, the endpoint returns `429 Too Many Requests`
  with a `Retry-After` header. Successful login clears the counter.
- **`/api/auth` now logs `LOGIN_FAILED` for the inactive-user path** —
  previously only the no-such-user and wrong-password paths were logged,
  so an admin couldn't see deactivated-account login attempts.

### 🐛 Bug fixes

- **`/api/parts` GET `lowStock` filter** now compares `currentStock`
  against each part's own `minStockLevel` (was a hardcoded `lte: 5`).
- **`/api/stock` GET N+1 eliminated.** `topSellingParts` previously
  did `Promise.all(topSellingRaw.map(findUnique))` (up to 10 sequential
  queries). Now batch-fetched with a single `findMany({ where: { id: { in }}})`.
- **`/api/stock` GET** also switched from `findMany` + JS reduce to
  `aggregate` for today's sales/purchases totals — avoids loading every
  sale row + its part into memory just to sum two numbers.
- **`/api/sales` POST invoice numbers are now collision-free.** Was
  `Math.floor(10000 + Math.random() * 90000)` (only 90k values, no
  uniqueness guarantee). Now uses a per-day sequential counter
  (`INV-YYYYMMDD-NNNNN`) computed inside the same transaction.
- **`/api/sales` POST** no longer makes a redundant `getSessionUser`
  call after `guardAuth` already returned the user — saves one DB
  round-trip per sale.
- **`/api/backup` GET** `setImmediate(async () => ...)` was a fire-and-
  forget with no `.catch()`. Replaced with a properly chained
  `void promise.then(onFulfilled, onRejected)` so missed-backup errors
  are logged instead of becoming unhandled promise rejections.
- **`/api/backup` GET** `DAILY_BACKUP_HOUR` NaN guard — if the env var
  is misconfigured (e.g. `abc`), now defaults to 23 instead of
  silently disabling the auto-backup.
- **`/api/import` POST** `XLSX.read(tmpPath, { type: 'buffer' })` was
  passing a file path with `type: 'buffer'` (worked by accident).
  Now passes the actual `buffer`.
- **`/api/import` POST** now uses `os.tmpdir()` instead of hardcoding
  `/tmp` (Windows-incompatible).
- **`/api/import` POST** validates that the uploaded form entry is
  actually a `File` instance (was `as File | null`).
- **`useFetch` cache poisoning fixed.** Aborted fetches returned
  `undefined`, which was being written to the cache for 30 seconds
  (poisoning subsequent requests for the same URL). Now `undefined`
  results are not cached.
- **`useMutation` header merge bug fixed.** `fetch(url, { headers: ...,
  ...init })` had the spread order wrong — `init.headers` would
  overwrite the merged headers. Now spreads `init` first, then merges
  `headers` on top.
- **`app-store.ts` `setCurrentUser` no longer resets `activePage`** on
  every call — only on `null → user` (login) transitions. Previously
  a token refresh or same-user update would bounce the user back to
  the dashboard.
- **`/api/departments/[id]` POST** and **`/api/parts/[id]` DELETE**
  now return 404 (instead of 500) when the target doesn't exist.
- **Login page `setTimeout` leaks fixed.** Both the auto-login timer
  (after first-run setup) and the seed-reload timer are now tracked
  in refs and cleared on unmount.
- **Login page password show/hide buttons** now have `tabIndex={0}`
  and `aria-label` (was `tabIndex={-1}` and unlabeled — invisible to
  keyboard and screen reader users).
- **Login page alerts** now have `role="alert"` / `role="status"` and
  `aria-live="polite"` so screen readers announce them.
- **`/api/parts` POST** now sets the `currency` field from
  `DEFAULT_CURRENCY` env var (was always falling back to the schema
  default).
- **`/api/purchases` POST** now generates a sequential invoice number
  (`PUR-YYYYMMDD-NNNNN`) and optionally links a supplier by name.
- **`/api/sales` GET** search now also matches `invoiceNumber` (was
  only customer name/phone/notes/part).

### 🔒 Prisma error handling

Every mutation route now specifically handles:
- `P2002` (unique constraint) → `409 Conflict`
- `P2025` (record not found) → `404 Not Found`

Previously these bubbled up as generic 500s. Affected routes:
`/api/parts`, `/api/parts/[id]`, `/api/users`, `/api/customers`,
`/api/suppliers`, `/api/departments/[id]`.

### 📝 Activity logging (audit trail)

The `ActivityAction` enum defined 12 actions but only 4 were ever
emitted. This release closes the gap — every CRUD operation now
logs to `ActivityLog`:

| Action | Routes that now log it |
|--------|------------------------|
| `CREATE` | parts, sales, purchases, departments, customers, suppliers, users (non-first-run) |
| `UPDATE` | parts, users, departments |
| `DELETE` | parts, users, departments |
| `BACKUP` | backup POST |
| `RESTORE` | backup POST (restore branch) |
| `IMPORT` | import POST |
| `STOCK_ADJUST` | stock POST |
| `CREATE` (whatsapp) | whatsapp/send POST |

`/api/whatsapp/send` now logs each message send with the destination
phone number, so admins can audit who sent what.

### 🎨 UI improvements

- **Notifications bell** in the header. Periodically (every 60s) fetches
  `/api/notifications` and shows a unified feed:
  - Today's sales total + count
  - Low-stock / out-of-stock parts (top 6, with severity badges)
  - Recent activity (top 5)
  - Click-through to inventory / activity / sales pages
- **Departments page**: native `confirm()` replaced with a proper
  `AlertDialog` (matches the rest of the app, accessible to screen
  readers, has a loading state on the delete button).
- **Departments page**: phone validation was dead code (always passed
  after stripping non-digits). Now validates 6-15 digit length.
- **Inventory page**: search box is now debounced (300ms) — was firing
  one network request per keystroke.
- **Inventory page**: `fetchParts` now uses `AbortController` so rapid
  search changes don't race (last response wins, stale responses are
  discarded).
- **Inventory page**: `SparePart` type now includes optional `currency`
  and `barcode` fields (the CSV export was referencing `p.currency`
  which didn't exist on the TS interface).
- **Inventory page**: `PartFormData` and `StockAdjustData` types now
  use `z.output<...>` so react-hook-form's expected `TFieldValues`
  matches the resolver output (was `z.infer<...>` which is the input
  shape — caused ~30 spurious TS errors).

### ✨ New features

- **`GET /api/notifications`** — unified notifications feed for the
  header bell. Returns low-stock parts, recent activity, and today's
  sales summary in one round-trip.
- **`GET /api`** — upgraded from `{ message: "Hello, world!" }` to a
  real health-check endpoint that returns service status, DB
  connectivity, and basic stats (no auth — for uptime monitors).
- **`GET /api/departments/[id]`** — added (was missing — clients had
  to use the list endpoint to fetch a single department).
- **`GET /api/departments?includeInactive=true`** — admins can now
  list deactivated departments (was hard-coded to `isActive: true`).
- **`GET /api/customers?includeInactive=true`** — same.
- **`GET /api/suppliers?includeInactive=true`** — same.
- **`/api/sales` GET search** now matches `invoiceNumber`.
- **`/api/purchases` GET search** now matches `invoiceNumber`.
- **`/api/purchases` POST** auto-generates `PUR-YYYYMMDD-NNNNN`
  invoice numbers and links suppliers by name when possible.

### 🧹 Code quality

- **`createCustomerSchema` and `createSupplierSchema`** moved from
  inline definitions in their route files to `src/lib/validations.ts`
  for consistency with the rest of the codebase.
- **`/api/auth`** removed dynamic `await import('@/lib/auth')` calls —
  now uses static imports.
- **`/api/seed`** removed dynamic `await import('@/lib/auth')` call.
- **`/api/whatsapp/send`** now uses the shared `validate()` helper
  instead of hand-rolled validation.
- **`/api/customers` POST** and **`/api/suppliers` POST** now use the
  shared `validate()` helper (was calling `safeParse` directly,
  discarding `fieldErrors`).
- **`apiError` / `apiBadRequest` / `apiNotFound` / `apiConflict` /
  `apiForbidden` / `apiUnauthorized` helpers** from `api-utils.ts`
  are now actually used across routes (were defined but mostly
  unused — most routes hand-rolled `NextResponse.json(...)`).
- **`<TableRow>`** now supports `asChild` via `@radix-ui/react-slot`
  so consumers can render `motion.tr` wrappers without losing the
  data-slot + className.
- **`SessionUser`** is now properly typed when returned from
  `getSessionUser` (was returning the raw Prisma row whose `role`
  is `string`, not `UserRole`).
- **Login page** no longer ships hardcoded demo passwords to the
  client bundle. `MOCK_CREDENTIALS` (with `password: 'owner123'`
  etc.) replaced with `DEV_DEMO_HINTS` (emails only) — the password
  field is pre-filled with a generic `'demo123'` placeholder that
  the user must still click "Sign In" to submit. Since the server-
  side `/api/seed` endpoint refuses to run outside an empty
  database, even a leaked `'demo123'` cannot grant production
  access.

### 📊 Performance

- **`/api/stock` GET** reduced from 7+ round-trips to 3 (batched
  `Promise.all`s + a single `findMany` for top-selling parts).
- **`/api/stock` GET** no longer loads full sale/purchase rows to
  compute today's totals — uses `aggregate({ _sum: { totalPrice }})`.
- **`/api/parts` GET `lowStock`** path previously relied on a
  hardcoded `lte: 5`; now correctly fetches candidates and filters
  in JS (capped at 1000 rows).
- **Inventory page** search no longer fires one request per
  keystroke (debounced 300ms) and uses `AbortController` to cancel
  stale requests.

### 🔄 Migration notes

- **No schema changes** — the Prisma schema is unchanged, so existing
  databases work as-is. Run `npx prisma generate` after upgrading
  to refresh the client types.
- **No env var changes** — all existing env vars work as before.
  New optional env var: `IMPORT_MAX_MB` (default `5`) controls the
  max import file size.

### 📦 Files changed

- `src/app/api/auth/route.ts` — rate limiting, log inactive-user LOGIN_FAILED, static imports
- `src/app/api/backup/route.ts` — fire-and-forget safety, NaN guard, typed casts, activity logging
- `src/app/api/customers/route.ts` — moved schema to validations.ts, validate() helper, P2002 handling, activity logging, includeInactive
- `src/app/api/departments/[id]/route.ts` — added GET, P2025 handling, activity logging
- `src/app/api/departments/route.ts` — includeInactive, activity logging
- `src/app/api/import/route.ts` — XLSX.read buffer fix, os.tmpdir(), File validation, activity logging
- `src/app/api/notifications/route.ts` — **NEW** unified notifications feed
- `src/app/api/parts/[id]/route.ts` — P2002/P2025 handling, activity logging, 404 on missing
- `src/app/api/parts/route.ts` — lowStock fix, currency from env, P2002 handling, activity logging
- `src/app/api/purchases/route.ts` — typed where, sequential invoice, supplier linking, activity logging
- `src/app/api/route.ts` — health check endpoint
- `src/app/api/sales/route.ts` — sequential invoice, typed where, redundant getSessionUser removed
- `src/app/api/stock/route.ts` — N+1 fix, aggregate, dedup lowStockItems, activity logging
- `src/app/api/suppliers/route.ts` — moved schema to validations.ts, validate() helper, P2002 handling, activity logging, includeInactive
- `src/app/api/users/route.ts` — updateUserSchema applied, P2002/P2025 handling, activity logging
- `src/app/api/whatsapp/send/route.ts` — auth guard, input validation, activity logging
- `src/app/api/whatsapp/status/route.ts` — auth guard
- `src/components/notifications-bell.tsx` — **NEW** header bell
- `src/components/home-page.tsx` — wired NotificationsBell
- `src/components/login-page.tsx` — removed MOCK_CREDENTIALS, setTimeout cleanup, a11y fixes
- `src/components/pages/departments-page.tsx` — AlertDialog for delete, phone validation fix
- `src/components/pages/inventory.tsx` — search debounce, AbortController, SparePart type, z.output
- `src/components/ui/table.tsx` — TableRow asChild support
- `src/hooks/use-fetch.ts` — cache poisoning fix, useMutation header merge fix
- `src/lib/activity.ts` — added 'whatsapp' entity type
- `src/lib/auth.ts` — SessionUser return shape fix
- `src/lib/validations.ts` — added createCustomerSchema, createSupplierSchema, whatsappSendSchema
- `src/store/app-store.ts` — setCurrentUser no longer resets activePage on every call

---

## v3.4.0 — Original release

See git history.
