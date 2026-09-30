# LofiMart Authentication

## Current architecture

LofiMart uses **Supabase Auth as the single authentication and identity authority**.

Prisma is not a second authentication provider. The local `User` table represents the LofiMart business identity linked to the Supabase identity through `supabaseAuthId`.

```text
                    SUPABASE AUTH
        ┌─────────────────────────────────┐
        │ Email/password                   │
        │ Email OTP                        │
        │ Google/Facebook OAuth             │
        │ Session + refresh                 │
        │ Identity / credential verification│
        └────────────────┬────────────────┘
                         │ supabaseAuthId
                         ▼
                 LOFIMART PRISMA
        ┌─────────────────────────────────┐
        │ User profile                    │
        │ role                             │
        │ seller/store state               │
        │ tenant                           │
        │ blocked/deactivated state        │
        └────────────────┬────────────────┘
                         ▼
                  LOFIMART RBAC
                         ▼
                API / dashboard access
```

## What is authoritative?

| Concern | Authority |
|---|---|
| User identity | Supabase Auth |
| Password verification | Supabase Auth |
| Email OTP | Supabase Auth / configured LofiMart verification flow |
| OAuth identity | Supabase Auth |
| Browser session | Supabase SSR session |
| Access-token verification | Supabase Auth |
| Business profile | Prisma `User` |
| Marketplace role | Prisma `User.role` + LofiMart RBAC |
| Seller/store ownership | Prisma |
| Block/deactivation | Prisma |
| Permissions | LofiMart RBAC |

## Server authentication flow

For an authenticated API request:

```text
Request
  │
  ├─ Authorization: Bearer <Supabase access token>
  │          │
  │          └─► supabase.auth.getUser(token)
  │
  └─ no Bearer token
             │
             └─► Supabase SSR cookie session
                        │
                        ▼
                 verified Supabase user
                        │
                        ▼
              Prisma User by supabaseAuthId
                        │
                        ├─ role validation
                        ├─ blocked check
                        └─ deactivated check
                        │
                        ▼
                AuthenticatedUser
```

Implementation: `src/server/auth.ts`.

### Important rule

The Prisma `User` row does not replace Supabase identity verification. A request must first resolve to a valid Supabase identity, then the corresponding LofiMart user is loaded.

## Middleware

LofiMart runs Supabase SSR middleware in `src/middleware.ts`.

The middleware:

1. Creates a Supabase SSR client using request/response cookies.
2. Calls `supabase.auth.getClaims()` to verify/refresh the session.
3. Preserves Supabase cookies on the response.
4. Applies security headers and route-specific cache controls.

For Next.js 15, `middleware.ts` is the correct convention. Supabase's current documentation recommends `getClaims()` for protecting pages/data and reserves `getSession()` for cases where the raw session/token is actually needed.

## OAuth callback

`src/app/auth/callback/page.tsx` handles the browser OAuth callback.

The callback can:

- exchange a PKCE authorization code with `exchangeCodeForSession()`;
- handle a Supabase session returned in the OAuth callback;
- obtain the raw Supabase access token when the LofiMart account-link/exchange flow requires it;
- call the LofiMart Supabase exchange endpoint;
- resolve/create the local Prisma user;
- enforce the requested role/registration flow;
- redirect to the appropriate dashboard.

The callback may call `getSession()` because it needs the raw Supabase access token for the exchange. The returned client-side session object is not used as the server's authorization authority.

## Email OTP

OTP policy is intentionally separate from application login JWTs:

- 6-digit OTP
- 5-minute expiry
- maximum 5 verification attempts
- 60-second resend cooldown
- no automatic verification bypass
- no custom login JWT issuance

Email delivery is configured through the selected Supabase/email delivery setup.

## API authentication

Authenticated API routes use:

- `getCurrentUser()`
- `requireUser()`
- `requireApiUser()`
- `secureApiRoute()`

Role/permission checks are applied after authentication.

Bearer example:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

The old `access_token` cookie is intentionally ignored.

## Authorization

Authentication answers **who is this?**

Authorization answers **what may this user do?**

The authorization chain is:

```text
Supabase verified identity
        ↓
Prisma User
        ↓
LofiMart role
        ↓
Permission / ownership check
        ↓
Resource access
```

Roles:

- `guest`
- `customer`
- `seller`
- `reseller`
- `admin`

Admin access is granted by explicit RBAC rules, not by trusting a client-provided role.

## Session model

There is **no separate LofiMart login-session store** that competes with Supabase.

Do not reintroduce:

- custom application access JWTs;
- custom application refresh tokens;
- `access_token` authentication cookies;
- localStorage-based LofiMart authentication tokens;
- Redis-backed authentication sessions.

Redis is still used by LofiMart for non-auth workloads such as caching, rate limiting, BullMQ and recovery/coordination workflows.

## Security notes

- Never trust a role or user ID supplied by the client request body.
- Never use an unverified cookie payload as the authenticated identity.
- Use `getClaims()` in server middleware/protection where claim verification is sufficient.
- Use `getUser()` when the current Auth user record must be fetched from Supabase.
- Use `getSession()` only when the raw access/refresh session is explicitly required.
- Keep the Supabase service-role key server-only.
- Do not add a second authentication system without an explicit architecture decision.

## Migration status

The legacy custom JWT/Redis authentication path has been removed from the current authentication code path. Documentation should describe only the Supabase-based architecture above.

Historical migration notes may mention the old system, but they must be clearly labelled as historical and must not be presented as the current implementation.
