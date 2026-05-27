# Production Launch Runbook

This document is the practical go-live checklist for LofiMart.

## What "production ready" means here

The codebase is build-clean and the major storefront, admin, seller, reseller, courier, refund, notification, and inventory workflows are wired.

Live deployment still requires real infrastructure and live credentials:

- domain + DNS
- SSL
- production database
- production Redis
- production email
- production payment credentials
- production courier credentials
- production media credentials
- real JWT secret

## Minimum required environment variables

Copy `.env.example` to `.env` and replace all placeholders before launch.

Important:

- production boot now fails fast if critical env values are missing
- placeholder values like `example.com`, `replace_me`, `YOUR_PROJECT_REF` are not allowed
- partial provider setup is also blocked
  - example: setting only `PATHAO_CLIENT_ID` without the rest of the Pathao fields will stop boot
  - same rule applies to RedX, SMTP, Google OAuth, Cloudinary, and web push

Critical variables:

- `FRONTEND_URL`
- `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Strongly recommended before public launch:

- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `NOTIFY_FROM_EMAIL`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

If using Stripe:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- if using a live Stripe secret, webhook secret must also be live and configured before boot

If using SSLCommerz:

- `SSLCOMMERZ_STORE_ID`
- `SSLCOMMERZ_STORE_PASSWORD`
- set `SSLCOMMERZ_IS_SANDBOX=false` for live

If using Pathao:

- `PATHAO_CLIENT_ID`
- `PATHAO_CLIENT_SECRET`
- `PATHAO_BASE_URL`
- `PATHAO_USERNAME`
- `PATHAO_PASSWORD`
- `PATHAO_BOOKING_ENDPOINT`
- `PATHAO_WEBHOOK_TOKEN`

If using RedX:

- `REDX_API_KEY`
- `REDX_SECRET_KEY`
- `REDX_BASE_URL`
- `REDX_BOOKING_ENDPOINT`
- `REDX_TRACKING_ENDPOINT`
- `REDX_WEBHOOK_TOKEN`

## Recommended production stack

- App server: Docker
- Reverse proxy: Nginx or managed platform proxy
- Database: managed Postgres or Supabase Postgres
- Cache/queues: managed Redis
- Process model:
  - `app`
  - `worker`

## Docker-based launch

### 1. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 2. Run migrations

If the app container is named by Compose:

```bash
docker compose -f docker-compose.prod.yml exec app npm run prisma:deploy
```

If seed data is needed:

```bash
docker compose -f docker-compose.prod.yml exec app npm run seed
```

### 3. Verify containers

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs app --tail=200
docker compose -f docker-compose.prod.yml logs worker --tail=200
```

## Health checks

Expected endpoints:

- app health: `/api/health`
- public config: `/api/config/public`

Quick check:

```bash
curl -I https://your-domain.com/api/health
curl https://your-domain.com/api/config/public
```

## Pre-launch checklist

- homepage loads
- login works
- register works
- social auth callback URLs are correct
- checkout works
- payment webhook configured
- email verification works
- password reset works
- push notification prompt works only when configured
- admin dashboard loads
- seller dashboard loads
- inventory page loads
- worker process is running
- Redis queue health is normal
- Pathao/RedX config status shows ready if intended

## Launch-day smoke test

1. Open homepage
2. Register a customer account
3. Log in
4. Add product to cart
5. Complete a test checkout
6. Confirm order appears in:
   - customer orders
   - seller orders
   - admin orders
7. Confirm notification creation
8. Confirm worker logs are healthy
9. Confirm low-stock and inventory pages load
10. Confirm one admin and one seller can log in successfully

## Reverse proxy / SSL

Before real traffic:

- point DNS to the server
- configure HTTPS
- force HTTPS redirect
- proxy app traffic to port `3000`
- allow webhook routes from payment/courier providers

## Worker requirement

Do not launch only the web app.

The worker must also be running for:

- notifications
- email queue
- analytics queue
- payment processing queue
- stock update queue
- cart recovery queue

## Post-launch monitoring

Watch these pages first:

- `/admin/dashboard`
- `/admin/performance`
- `/admin/logistics`
- `/admin/payments`
- `/admin/inventory`

Watch for:

- failed payments
- delivery exceptions
- stale inventory queue
- low-stock spikes
- performance alerts

## Important limitation

This runbook prepares deployment, but actual "live" status still depends on real production services and credentials being available.

Without:

- deploy target access
- domain access
- SSL access
- live provider credentials

the site cannot be made publicly live from code changes alone.
