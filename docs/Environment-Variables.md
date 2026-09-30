# LofiMart Environment Variables

All secrets must remain outside source control. Use Vercel/environment-specific secret storage in deployed environments.

## Core application

| Variable | Required | Purpose |
|---|---:|---|
| `NODE_ENV` | Yes | Runtime mode |
| `PORT` | No | Application port |
| `FRONTEND_URL` | Yes | Server-side canonical frontend URL |
| `NEXT_PUBLIC_FRONTEND_URL` | Yes | Client-safe frontend URL |
| `LOW_STOCK_THRESHOLD` | No | Inventory alert threshold |
| `CACHE_TTL_SECONDS` | No | Default cache TTL |

## Database

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL pooled connection |
| `DIRECT_URL` | Yes | PostgreSQL direct connection for migrations |

Never expose database URLs to client code.

## Redis / application infrastructure

| Variable | Required | Purpose |
|---|---:|---|
| `REDIS_URL` | Yes | Redis connection |
| `REDIS_PREFIX` | No | Redis key namespace |
| `REDIS_COMMAND_TIMEOUT_MS` | No | Command timeout |
| `REDIS_CONNECT_TIMEOUT_MS` | No | Connection timeout |
| `REDIS_MAX_RETRIES_PER_REQUEST` | No | Redis retry limit |

Redis is used for application infrastructure such as cache, rate limiting, BullMQ and coordination. It is **not** the source of truth for authentication sessions.

## Authentication — Supabase

| Variable | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes* | Client-safe Supabase publishable key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Compatibility | Legacy key alias still accepted by compatibility code |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase admin key |
| `SUPABASE_AUTH_WEBHOOK_SECRET` | If used | Secret for the Supabase Auth deletion webhook |

* The preferred production configuration is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### Authentication security rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY`.
- Do not create a second LofiMart login JWT.
- Do not add an `access_token` authentication cookie.
- Do not store LofiMart authentication tokens in localStorage.
- Supabase owns the browser authentication session.

## Application signing and security secrets

`JWT_SECRET` is **not a user-authentication secret** in the current architecture. If retained by a server feature, it must be described according to that feature's actual purpose (for example, signing a Telegram invoice payload).

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Server-side application signing where explicitly required; not used to issue user login sessions |
| `CSRF_SECRET` | CSRF token generation/validation |
| `FIELD_ENCRYPTION_KEY` | Encryption of selected sensitive business fields |

Do not reuse one secret for unrelated security purposes.

## Pathao

| Variable | Required | Purpose |
|---|---:|---|
| `PATHAO_CLIENT_ID` | Yes | Pathao OAuth client ID |
| `PATHAO_CLIENT_SECRET` | Yes | Pathao OAuth client secret |
| `PATHAO_BASE_URL` | Yes | Pathao API base URL |
| `PATHAO_USERNAME` | Yes | Pathao merchant username |
| `PATHAO_PASSWORD` | Yes | Pathao merchant password |
| `PATHAO_BOOKING_ENDPOINT` | No | Optional booking endpoint override |
| `PATHAO_WEBHOOK_TOKEN` | No | Pathao webhook verification secret |

## Media

| Variable | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Yes | Client-safe Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes | Server-side Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Server-side Cloudinary API secret |

## Email / notifications

| Variable | Required | Purpose |
|---|---:|---|
| `SMTP_HOST` | If SMTP used | SMTP host |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | If SMTP used | SMTP username |
| `SMTP_PASS` | If SMTP used | SMTP password |
| `SMTP_FROM` | If SMTP used | Sender address |
| `TELEGRAM_BOT_TOKEN` | If Telegram used | Telegram bot credential |
| `TELEGRAM_BOT_USERNAME` | If Telegram used | Telegram bot username |
| `TELEGRAM_WEBHOOK_SECRET` | If used | Telegram webhook verification |

## Other integrations

See the corresponding feature documentation for provider-specific variables. Removed payment/courier providers must not be documented as active integrations.

## Secret classification

| Type | Examples | Client-safe? |
|---|---|---|
| Public | `NEXT_PUBLIC_*` | Usually yes |
| Server secret | `SUPABASE_SERVICE_ROLE_KEY`, `*_SECRET` | No |
| Infrastructure credential | `DATABASE_URL`, `REDIS_URL` | No |
| External API credential | `PATHAO_CLIENT_SECRET`, `CLOUDINARY_API_SECRET` | No |

## Production rules

1. Configure environment variables in the deployment platform.
2. Never commit real credentials.
3. Prefer the Supabase publishable key over the legacy anon-key alias.
4. Keep service-role and infrastructure secrets server-only.
5. Do not introduce environment variables for a removed custom authentication layer.
