# LofiMart — Commerce OS

A Bangladesh-focused multi-vendor ecommerce platform built with Next.js, React, Prisma/PostgreSQL, Redis, BullMQ, Cloudinary and Supabase Auth.

> **Current authentication authority:** Supabase Auth is the sole authority for user identity, credentials and browser sessions. LofiMart's Prisma `User` record stores business profile, role, tenant and marketplace state. LofiMart does **not** issue a separate application login JWT or use an `access_token` cookie.

## Features

- Multi-vendor marketplace
- Customer, seller, reseller and admin dashboards
- Cash on Delivery checkout
- Pathao Courier integration
- Product, inventory and warehouse management
- Seller stores and marketplace orders
- Telegram notifications/operations
- Cloudinary media management
- Push notifications
- Role-based access control

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15+ (App Router, React 19) |
| Backend | Next.js API/Server Components plus existing server compatibility code |
| Database | PostgreSQL (Prisma ORM) |
| Cache | Redis (ioredis) |
| Queue | BullMQ |
| Authentication | Supabase Auth + `@supabase/ssr` |
| Authorization | LofiMart RBAC + Prisma business identity |
| Media | Cloudinary |
| Realtime | WebSocket (ws) |
| Courier | Pathao |

## Authentication Architecture

```text
Browser
  │
  ├── Email/password
  ├── Email OTP
  └── Google/Facebook OAuth
  │
  ▼
Supabase Auth
  │
  ├── Identity
  ├── Credentials
  ├── Session / refresh
  └── OAuth
  │
  │ supabaseAuthId
  ▼
Prisma User
  │
  ├── profile
  ├── role
  ├── seller/store state
  ├── tenant
  └── blocked/deactivated state
  │
  ▼
LofiMart RBAC
  │
  ▼
Protected pages / API routes
```

### Authentication rules

- Supabase Auth is the identity/session authority.
- Server authorization uses a verified Supabase identity and then loads the matching Prisma `User`.
- API callers may use `Authorization: Bearer <Supabase access token>`.
- Browser sessions are managed by Supabase SSR cookies.
- Middleware uses `supabase.auth.getClaims()` to verify/refresh the session.
- Server user resolution uses `supabase.auth.getUser()` when a current Auth user record is required.
- The legacy LofiMart `access_token` cookie is not an authentication source.
- LofiMart does not create a second login JWT/refresh-token session layer.
- Redis remains infrastructure for cache, queues, rate limiting and other application workloads; it is not the source of truth for authentication sessions.
- `getSession()` is used only where the raw Supabase session/access token is explicitly needed; its user object is not used as a server authorization authority.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/Architecture.md) | Current system and authentication architecture |
| [Authentication](./docs/Authentication.md) | Supabase Auth flows and server authorization |
| [RBAC](./docs/RBAC.md) | Roles, permissions and ownership rules |
| [Security](./docs/Security.md) | Security controls and authentication boundaries |
| [Database](./docs/Database.md) | Prisma/PostgreSQL data model |
| [API Reference](./docs/API.md) | API endpoints |
| [Environment Variables](./docs/Environment-Variables.md) | Runtime configuration |
| [Setup Guide](./docs/Setup.md) | Development setup |

## Project Structure

```text
src/
├── app/            # Next.js pages and API routes
├── features/       # Feature modules
├── modules/        # Domain modules and RBAC
├── server/         # Server utilities and compatibility code
├── lib/            # Shared utilities and Supabase clients
└── workers/        # BullMQ workers

prisma/             # Prisma schema, migrations and seed
docs/               # Technical documentation
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |

Private project — All rights reserved.
