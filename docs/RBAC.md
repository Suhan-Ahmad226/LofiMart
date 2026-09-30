# LofiMart RBAC

## Purpose

LofiMart separates **authentication** from **authorization**.

Supabase Auth establishes the authenticated identity. LofiMart RBAC determines what that authenticated LofiMart user may access.

```text
Supabase Auth
    │
    ▼
supabaseAuthId
    │
    ▼
Prisma User
    │
    ├── role
    ├── tenant
    ├── seller/store ownership
    └── account status
    │
    ▼
LofiMart RBAC
    │
    ├── permission checks
    └── resource ownership checks
```

## Roles

| Role | Main scope |
|---|---|
| `guest` | Public storefront |
| `customer` | Own account and orders |
| `seller` | Own products, inventory, orders and store operations |
| `reseller` | Reseller/catalog/order functionality |
| `admin` | Platform administration |

Roles are defined in `src/modules/rbac/roles.ts`.

## Permissions

Permissions are defined in `src/modules/rbac/permissions.ts` and evaluated by `src/modules/rbac/authorize.ts`.

The current permission families include:

- `catalog:read`
- `catalog:write`
- `orders:read`
- `orders:write`
- `inventory:read`
- `inventory:write`
- `users:read`
- `users:write`
- `admin:access`

## Server authorization flow

```text
HTTP request
   ↓
Supabase identity verification
   ↓
Prisma User lookup by supabaseAuthId
   ↓
blocked/deactivated check
   ↓
role validation
   ↓
permission check
   ↓
resource ownership check
   ↓
handler
```

The core authentication helpers are in `src/server/auth.ts`.

## Dashboard access

`requireDashboardAccess()` resolves the current Supabase-authenticated user and checks the allowed LofiMart roles.

Typical dashboard routes:

- `/account`
- `/seller`
- `/reseller-dashboard`
- `/admin`

A missing authenticated user is redirected to login. An authenticated user without the required role is redirected away from the protected dashboard.

## API access

API handlers should authenticate first and authorize second.

Preferred pattern:

```ts
const result = await requireApiUser(request);

if (result instanceof Response) {
  return result;
}

const user = result;

// Then apply role/permission/ownership checks.
```

For reusable permission checks:

```ts
const forbidden = requirePermission(user, 'orders:write');

if (forbidden) {
  return forbidden;
}
```

## Ownership

Role checks alone are not enough.

Seller/customer resources must also be scoped to the authenticated LofiMart user or tenant. Never accept `userId`, `sellerId`, `role`, or equivalent authorization fields from an untrusted request body when they can be derived from the authenticated identity.

## Account status

Authentication succeeds only when:

1. Supabase identifies the user;
2. a matching Prisma `User` exists;
3. the LofiMart role is recognized;
4. the account is not blocked;
5. the account is not deactivated.

## Security boundary

The following are **not** authorization authorities:

- client-side role state;
- URL parameters;
- request-body `role`;
- request-body `userId`;
- an `access_token` cookie;
- an unverified Supabase session object;
- Redis session records from the old authentication design.

## Current authentication boundary

Supabase owns:

- credentials;
- identity;
- OAuth;
- browser session;
- refresh.

LofiMart owns:

- business profile;
- roles;
- permissions;
- seller/store state;
- tenant membership;
- resource ownership;
- account blocking/deactivation.

This boundary must remain explicit when adding new features.
