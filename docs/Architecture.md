# LofiMart System Architecture

## Current platform

LofiMart is a multi-vendor ecommerce platform using Next.js, Prisma/PostgreSQL, Redis, BullMQ, Cloudinary, WebSocket and Pathao Courier.

Authentication is intentionally separated from business identity:

- **Supabase Auth** owns credentials, identity, OAuth and browser sessions.
- **Prisma** owns the LofiMart business user/profile, role, tenant and marketplace state.
- **LofiMart RBAC** owns permissions and resource ownership.

## High-level architecture

```text
                         Browser
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
     Storefront          Auth UI          Dashboard
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                     Next.js App
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       Supabase          Prisma             Redis
         Auth          PostgreSQL       Cache/limits/queues
          │                 │                 │
          │                 └──────┬──────────┘
          │                        │
          └──── supabaseAuthId ───► LofiMart User
                                   │
                                   ▼
                              RBAC / Ownership
                                   │
                                   ▼
                            Business modules
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
          Pathao                Cloudinary           BullMQ/Workers
```

## Authentication boundary

```text
Supabase Auth
  ├── email/password
  ├── email OTP
  ├── Google/Facebook OAuth
  ├── session
  └── refresh
        │
        │ supabaseAuthId
        ▼
Prisma User
  ├── profile
  ├── role
  ├── tenant
  ├── seller/store state
  └── blocked/deactivated state
        │
        ▼
LofiMart RBAC
  ├── permissions
  └── resource ownership
```

There is no second LofiMart login JWT or Redis-backed authentication session.

## Request pipeline

```text
Request
  ↓
Next.js middleware
  ↓
Supabase SSR client
  ↓
getClaims() — verify/refresh session
  ↓
Route handler / server component
  ↓
getUser() when a current Auth user record is required
  ↓
Prisma User by supabaseAuthId
  ↓
RBAC + ownership
  ↓
Business logic
```

For APIs that receive a Bearer token, `src/server/auth.ts` passes that Supabase access token to `supabase.auth.getUser(token)` and then resolves the matching Prisma user.

## Supabase client layers

The project uses separate browser/server Supabase clients.

- Browser code uses the client-safe Supabase URL and publishable key.
- Server code uses the SSR/server client.
- The Supabase service-role key is server-only.
- Middleware is responsible for session refresh on Next.js 15 through `src/middleware.ts`.

## Business/data architecture

### Prisma/PostgreSQL

Prisma stores:

- users and profiles;
- products and stores;
- orders and shipments;
- inventory and warehouses;
- seller/reseller data;
- accounting records;
- audit/security records.

### Redis

Redis is infrastructure, not authentication authority.

Current uses include:

- caching;
- rate limiting;
- BullMQ backing;
- coordination/recovery workflows;
- other short-lived application state.

### BullMQ

BullMQ workers handle asynchronous application jobs such as notifications, inventory, analytics and recovery workflows.

### Cloudinary

Cloudinary handles managed media uploads and lifecycle operations.

### Pathao

Pathao is the currently active courier integration. Shipment booking, tracking and reconciliation are handled by the logistics domain.

## Authorization architecture

```text
Supabase verified identity
        ↓
Prisma User
        ↓
Role
        ↓
Permission
        ↓
Resource ownership / tenant scope
        ↓
Business operation
```

Client-provided `role`, `userId` or `sellerId` must not be treated as an authorization source.

## Important authentication invariants

1. Supabase is the only authentication authority.
2. Prisma `User` is the business identity linked by `supabaseAuthId`.
3. The legacy `access_token` cookie is not accepted as authentication.
4. LofiMart does not mint a separate login JWT/refresh pair.
5. LofiMart does not store its own login tokens in localStorage.
6. Redis must not become a parallel authentication-session authority.
7. `getClaims()` is used for verified session protection.
8. `getUser()` is used when a fresh Auth user record is required.
9. `getSession()` is used only when the raw Supabase session/token is explicitly needed.
10. Authorization always derives from the verified identity plus server-side Prisma/RBAC data.

## Documentation rule

This file describes the current architecture. Historical migrations may document previous designs, but historical custom JWT/Redis authentication must never be presented as the current system.
