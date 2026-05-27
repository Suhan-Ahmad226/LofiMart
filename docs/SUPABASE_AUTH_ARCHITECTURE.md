# Supabase Auth Architecture

## Identity Model

- `Supabase` is the identity provider for:
  - email/password sign-in
  - Google OAuth
  - Facebook OAuth
  - password recovery
  - email verification
- application roles, workspaces, and vendor onboarding remain in the app database

## Session Model

1. The browser authenticates with Supabase.
2. The client sends the Supabase access token to `/api/auth/supabase/exchange`.
3. The server validates the Supabase token server-side.
4. The server provisions or updates the local user record.
5. The server issues the app session:
   - `access_token`
   - `refresh_token`
6. The frontend stores the app access token for API authorization and receives secure session cookies.

## Provisioning Flow

- `register` with immediate Supabase session:
  - sign up in Supabase
  - exchange token on the backend
  - create or update local user/workspace
- `register` with email verification required:
  - sign up in Supabase
  - call `/api/auth/supabase/provision`
  - create local user/workspace without forcing app login

## Security Rules

- never trust frontend roles
- always validate Supabase session on the server
- always validate app session before reading protected resources
- role checks happen in:
  - Express auth middleware
  - Next API `secureApiRoute`
  - dashboard route middleware redirect

## Protected Surfaces

- `/account/*`
- `/seller/*`
- `/reseller-dashboard/*`
- `/admin/*`

These are redirected to `/login` when no app access cookie exists.

## Recommended Production Settings

- enable Supabase email verification
- restrict OAuth redirect URLs to exact production domains
- keep `SUPABASE_SERVICE_ROLE_KEY` server-only
- rotate JWT and provider secrets on compromise
- monitor auth exchange and provision failure logs
