# Deployment Environment Structure

## Frontend and App Runtime

- `FRONTEND_URL`
- `NODE_ENV=production`
- `APP_ENV=production`
- `NEXT_PUBLIC_API_BASE_URL`

## Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Database

- `DATABASE_URL`
- `DIRECT_URL`

## Session and Cache

- `JWT_SECRET`
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## Media

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_URL`

## Email

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `NOTIFY_FROM_EMAIL`

## OAuth Providers

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FACEBOOK_CLIENT_ID`
- `FACEBOOK_CLIENT_SECRET`

## Payments

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- optional `BKASH_*`
- optional `SSLCOMMERZ_*`

## Logistics

- `PATHAO_*`
- `STEADFAST_*`
- optional `REDX_*`

## Deployment Notes

- Vercel:
  - host the Next.js frontend and app routes
- Render:
  - host long-running backend workers or websocket/process workloads
- Supabase:
  - auth and Postgres
- Cloudflare:
  - DNS, WAF, CDN, SSL
