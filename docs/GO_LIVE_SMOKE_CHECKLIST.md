# Go-Live Smoke Checklist

Use this checklist immediately before public launch. The goal is to verify the real production environment, not just local build health.

## Pre-Launch Setup

- Confirm `FRONTEND_URL` uses your real HTTPS domain.
- Confirm `CORS_ALLOWED_ORIGINS` includes only real production origins.
- Confirm `NODE_ENV=production`.
- Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set.
- Confirm `DATABASE_URL` and `DIRECT_URL` point to the production database.
- Confirm `REDIS_URL` works from the production server.
- Confirm `JWT_SECRET` is rotated and production-only.
- Confirm `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and sender emails are valid.
- Confirm `PATHAO_*` live credentials are set.
- Confirm disabled payment methods stay disabled if you are launching with COD only.
- Confirm all exposed secrets from previous local configs have been rotated.

## Build and Server Health

1. Run:
   ```powershell
   npm run lint
   npm run build
   ```
2. Start the production server build or deployed app.
3. Open:
   - `/`
   - `/api/health`
   - `/api/config/public`
   - `/api/public/commerce-config`
4. Expected:
   - no 500 errors
   - no endless loading
   - homepage loads with products, categories, and seller sections

## Auth Flow

### Customer Login

1. Open `/login`
2. Sign in with a real test customer account
3. Expected:
   - no loading loop
   - redirected to account page or previous path
   - session persists on refresh

### Customer Registration

1. Open `/register`
2. Create a fresh test customer account
3. Expected:
   - success message
   - verification flow starts correctly
   - no duplicate-account crash

### Seller Login

1. Sign in with a seller account
2. Open:
   - `/seller/dashboard`
   - `/seller/onboarding`
   - `/seller/settings`
3. Expected:
   - grouped sidebar loads
   - onboarding status loads
   - no permission error

### Reseller Login

1. Sign in with a reseller account
2. Open:
   - `/reseller-dashboard/overview`
   - `/reseller-dashboard/onboarding`
   - `/reseller-dashboard/settings`
3. Expected:
   - onboarding progress visible
   - dashboard widgets render

### Admin Login

1. Sign in with an admin account
2. Open:
   - `/admin/dashboard`
   - `/admin/settings`
   - `/admin/logistics`
3. Expected:
   - readiness cards render
   - payment/courier toggles load correctly

## Customer Commerce Flow

### Browse and Search

1. Open `/shop`
2. Search from header and `/search`
3. Open 2-3 product pages
4. Expected:
   - search results return
   - product pages render image, price, seller, reviews
   - no console crash

### Cart

1. Add products to cart
2. Change quantity
3. Remove an item
4. Expected:
   - cart total updates correctly
   - duplicate cart items merge safely

### Checkout

1. Open `/checkout`
2. Add or select an address
3. Confirm only enabled payment methods are shown
4. Place a COD order
5. Expected:
   - validation works
   - order success page loads
   - no unavailable payment option is selectable

### Customer Orders

1. Open `/account/orders`
2. Open the new order detail page
3. Open `/track`
4. Expected:
   - order appears
   - shipment rows show
   - courier event summary renders if available

## Seller Flow

### Product Flow

1. Open `/seller/products`
2. Add a product from `/seller/products/add`
3. Edit the product
4. Expected:
   - save works
   - SKU and variant data persist

### Courier Flow

1. Open `/seller/pickup-locations`
2. Verify a Pathao-linked location exists
3. Open `/seller/courier`
4. Use `Book in Pathao` on a valid shipment if available
5. Use `Sync Pathao`
6. Expected:
   - only enabled courier providers are shown
   - booking response returns success or actionable error
   - synced event/status updates shipment state

### Seller Orders

1. Open `/seller/orders`
2. Search by order code or SKU
3. Expected:
   - active/history lists load
   - no ownership leak from other sellers

## Reseller Flow

1. Open `/reseller-dashboard/catalog`
2. Add reseller-ready products
3. Open `/reseller-dashboard/shop`
4. Copy/storefront link if available
5. Expected:
   - catalog renders
   - reseller pricing logic holds
   - storefront is accessible if published

## Admin Operations

### Payment and Courier Toggles

1. Open `/admin/settings`
2. Check channel toggles
3. If launching COD + Pathao only:
   - checkout payments: COD only
   - manual order payments: COD only
   - couriers: Pathao only
4. Expected:
   - disabled options do not show in customer/seller UI
   - backend rejects disabled channels

### Logistics

1. Open `/admin/logistics`
2. Load Pathao token info, stores, and price test
3. Expected:
   - panel loads without crash
   - responses are readable

### Inventory and Orders

1. Open `/admin/inventory`
2. Open `/admin/orders`
3. Expected:
   - load-more behavior works
   - sticky toolbars render
   - no broken filters

## POS Flow

1. Open `/admin/pos`
2. Add at least one product
3. Complete a cash sale
4. Print receipt preview
5. Expected:
   - order persists
   - stock deducts
   - receipt popup opens or shows a clear blocked-popup message

## Notifications and Messaging

1. Trigger a few actions:
   - save settings
   - copy a link
   - create an address
2. Expected:
   - toast messages appear
   - inline notices show in forms where appropriate
   - no browser `alert()` usage

## Homepage and Public UX

1. Open `/`
2. Check:
   - hero banner
   - category cards
   - top seller section
   - bestseller section
   - category-wise product blocks
3. Expected:
   - no misleading sync warnings
   - seller section shows top public storefronts
   - empty states are graceful, not broken

## Failure Checks

Test at least one negative case for each:

- invalid login
- empty cart checkout
- unauthorized access to `/api/v2/*` protected routes
- invalid address selection
- invalid coupon

Expected:
- proper `401`, `403`, or `400` response
- readable error message
- no crash, no stack trace in UI

## Launch Decision

Safe to go live only if all are true:

- lint passes
- build passes
- auth works
- COD checkout works
- Pathao booking or sync works for at least one real shipment
- admin settings toggles work
- seller and customer dashboards load without runtime errors
- no blocking 500s in server logs

## Known Non-Code Launch Risks

Even after code passes, do not launch until these are confirmed:

- production DNS and SSL are live
- SMTP deliverability works
- database and Redis are reachable from production
- Supabase auth redirect URLs match the real domain
- Pathao webhook/callback URLs are reachable from the internet
