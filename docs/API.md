# LofiMart API Reference

## Current API authentication

LofiMart APIs use **Supabase Auth** for authentication.

Authenticated requests should send:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

The server validates the token with Supabase and resolves the matching Prisma `User` by `supabaseAuthId`. Roles and permissions are then checked by LofiMart RBAC.

The legacy LofiMart login-token/session endpoints are not part of the current authentication architecture.

## Authentication endpoints

### Register

```
POST /api/auth/register
```

Creates/links the Supabase identity and the LofiMart business user.

### Login

```
POST /api/auth/login
```

Authenticates through Supabase Auth.

### Supabase session exchange

```
POST /api/auth/supabase/exchange
```

Accepts a verified Supabase access token when the browser OAuth/registration flow needs to synchronize the Supabase identity with the LofiMart Prisma user.

This endpoint does **not** mint a second LofiMart login session.

### OAuth callback

```
GET /auth/callback
```

Handles the browser Supabase OAuth/PKCE callback.

### Password reset

Password reset/change operations are handled through the current Supabase-backed auth flow. Do not implement a separate local password-token session system.

### Logout

Logout signs out the Supabase session. It does not revoke a separate LofiMart JWT/Redis session because no such authentication session exists.

## Authentication implementation rules

- Supabase is the identity authority.
- `src/server/auth.ts` resolves the authenticated LofiMart user.
- `src/middleware.ts` verifies/refreshes the SSR session with `getClaims()`.
- `getUser()` is used when the current Auth user record is required.
- `getSession()` is used only when the raw Supabase session/token is explicitly needed.
- The legacy `access_token` cookie is not accepted.
- Do not add custom login JWTs, custom refresh tokens or Redis-backed login sessions.

## Other API groups

The application also exposes APIs for:

- products and categories;
- carts and checkout;
- orders and invoices;
- seller operations;
- admin operations;
- reseller operations;
- inventory and warehouses;
- Pathao logistics;
- notifications;
- media;
- Telegram;
- accounting and reporting.

Refer to the route handlers under `src/app/api/` and the domain modules under `src/modules/` for the authoritative implementation.

## Logistics

Current courier integration is Pathao-only.

Typical endpoints include:

```
GET  /api/logistics/providers
GET  /api/logistics/locations
GET  /api/logistics/stores
POST /api/logistics/stores
POST /api/logistics/shipments/:shipmentId/sync
POST /api/logistics/webhooks/:provider
POST /api/seller/courier/bookings
GET  /api/admin/logistics/diagnostics
```

Provider resolution is registry-based and unregistered providers are rejected.

## Authorization

Authentication and authorization are separate:

```text
Supabase identity
      ↓
Prisma User
      ↓
Role
      ↓
Permission
      ↓
Ownership / tenant scope
      ↓
API handler
```

Never trust `userId`, `sellerId` or `role` from an untrusted request body when the value can be derived from the authenticated identity.

## Public API

Public storefront endpoints may be accessed without authentication where the route explicitly permits it.

Guest checkout is supported, but authenticated identity must never be inferred from arbitrary client input.

## Source of truth

This document describes the current authentication boundary. Route-level implementation in `src/app/api/` and `src/server/` is authoritative when endpoint details change.
