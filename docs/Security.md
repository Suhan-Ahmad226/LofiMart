# LofiMart Security Architecture

## Current authentication boundary

LofiMart uses Supabase Auth as the authentication and identity authority.

```text
Browser
   │
   ▼
Supabase SSR session / Bearer token
   │
   ▼
Supabase verification
   │
   ▼
Prisma User by supabaseAuthId
   │
   ▼
LofiMart RBAC + ownership
   │
   ▼
Business API
```

The application does **not** maintain a second custom login JWT/refresh-token session system.

## Authentication controls

### Supabase Auth

Supabase handles:

- email/password authentication;
- email OTP;
- Google/Facebook OAuth;
- session and refresh-token lifecycle;
- identity verification.

### Server-side verification

`src/middleware.ts` uses:

```ts
await supabase.auth.getClaims();
```

This verifies the session token and allows Supabase SSR session refresh.

`src/server/auth.ts` uses `getUser()` when the server needs the current Supabase user record, including Bearer-token requests.

### Legacy authentication explicitly removed

The following are not valid authentication mechanisms:

- custom LofiMart login JWTs;
- custom LofiMart refresh tokens;
- Redis-backed login sessions;
- `access_token` cookies;
- localStorage LofiMart auth tokens;
- local bcrypt password verification.

Do not reintroduce these as a parallel authentication layer.

## Authorization

After authentication:

1. resolve the Supabase user;
2. load the matching Prisma `User`;
3. validate the LofiMart role;
4. reject blocked/deactivated accounts;
5. check permissions;
6. check tenant/resource ownership.

See `docs/RBAC.md`.

## Session handling

Supabase SSR stores the browser session in cookies through `@supabase/ssr`.

The server should use:

- `getClaims()` for verified claims/protection;
- `getUser()` when a fresh Auth user record is required;
- `getSession()` only when the raw access/refresh session is explicitly required.

A raw `getSession()` user object must not be treated as the server authorization source.

## CSRF and origin protection

LofiMart retains its application-level CSRF and origin controls where required by state-changing endpoints.

Authentication and CSRF solve different problems:

- authentication verifies identity;
- CSRF/origin controls reduce unauthorized browser-originated state changes.

Do not remove CSRF/origin checks merely because Supabase manages sessions.

## Rate limiting

Redis remains an infrastructure dependency for application rate limiting and other workloads.

Rate limiting is not an authentication session store.

Auth-sensitive routes should retain appropriate request throttling and abuse controls.

## Security headers

Middleware applies security headers including:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- production HSTS
- production Permissions-Policy

## Secrets

Never expose server-only secrets to the browser.

Important examples:

- `SUPABASE_SERVICE_ROLE_KEY` — server only;
- field-encryption secrets — server only;
- webhook secrets — server only;
- infrastructure credentials — server only.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-safe Supabase configuration values.

## Encryption

LofiMart uses field-level encryption for selected sensitive business data at rest.

This encryption is separate from user authentication. Do not describe its encryption key as a JWT signing key unless the implementation actually uses it for that purpose.

## Redis

Redis is used for application infrastructure such as:

- caching;
- rate limiting;
- BullMQ;
- coordination/recovery workflows.

Redis is **not** the source of truth for the user's authenticated session.

## Common security mistakes to avoid

Do not:

1. trust a client-provided role;
2. trust a client-provided user ID for authorization;
3. authenticate from the legacy `access_token` cookie;
4. create a second custom login JWT;
5. store LofiMart auth tokens in localStorage;
6. use `getSession()` alone as server authorization;
7. expose the Supabase service-role key;
8. bypass ownership checks because a user has a valid role.

## Operational rule

When modifying authentication code, update:

- `src/server/auth.ts`;
- `src/middleware.ts`;
- Supabase client utilities;
- relevant tests;
- `docs/Authentication.md`;
- `docs/RBAC.md`;
- this document.

The Supabase-based architecture must remain the single source of truth for authentication.
