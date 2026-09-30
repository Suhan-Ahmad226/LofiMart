# LofiMart Folder Structure

## Root

```text
LofiMart/
├── src/
│   ├── app/            # Next.js App Router pages and API routes
│   ├── features/       # Feature modules
│   ├── modules/        # Domain modules
│   ├── server/         # Server helpers, middleware and compatibility routes
│   ├── lib/            # Shared utilities and Supabase clients
│   ├── components/     # Shared UI
│   └── workers/        # BullMQ workers
├── prisma/             # Prisma schema, migrations and seed
├── docs/               # Technical documentation
├── tests/              # Test suites
├── public/             # Static assets
└── .github/            # CI/CD
```

## Authentication-related files

```text
src/
├── middleware.ts                 # Supabase SSR session refresh/verification
├── server/auth.ts                # AuthenticatedUser + server auth helpers
├── lib/client.ts                 # Browser Supabase client
├── lib/server.ts                 # Server Supabase client
├── lib/auth-ui.ts                # Auth UI/session exchange helpers
├── app/auth/callback/             # OAuth callback
├── app/api/auth/                  # Supabase-backed auth endpoints
├── features/auth/                 # Login/register/OTP UI and flows
├── features/shared/state/
│   └── UserContext.tsx            # Client-side profile/auth state
└── modules/rbac/                  # Roles and permissions
```

## Authentication boundary

```text
Supabase Auth
     ↓
supabaseAuthId
     ↓
Prisma User
     ↓
LofiMart RBAC
     ↓
Protected route
```

There is no current `sessionStore.ts)-based application login system. Redis remains application infrastructure for cache, queues, rate limiting and coordination.

## Domain modules

```text
modules/
├── accounting/
├── inventory/
├── logistics/
├── payments/
├── profile/
└── rbac/
```

Each module may contain contracts, application/use-case logic and services/adapters.

## Shared infrastructure

```text
features/shared/
├── components/
├── layout/
├── media/
├── orders/
├── profile/
├── services/
│   ├── cache/
│   ├── database/
│   ├── media/
│   ├── messaging/
│   ├── monitoring/
│   ├── platform/
│   └── security/
├── state/
└── ui/
```

## Important rule

When changing authentication, update the implementation and its tests together with:

- `docs/Authentication.md`
- `docs/RBAC.md`
- `docs/Security.md`
- `docs/Architecture.md`

Historical authentication code or migration records may remain only when they are required for migration/history. They must not be treated as the active authentication path.
