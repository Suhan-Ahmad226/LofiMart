# Production Security Checklist

## Authentication

- Supabase email/password login works
- Google OAuth works
- Facebook OAuth works
- email verification works
- forgot/reset password works
- `/api/auth/supabase/exchange` validates tokens correctly
- `/api/auth/supabase/provision` works for verification-required signups

## Session Security

- `access_token` cookie is `HttpOnly`
- `refresh_token` cookie is `HttpOnly`
- `Secure` cookies are enabled in production
- logout clears cookies and revokes refresh token
- logout-all revokes all sessions

## Route Protection

- `/account/*` redirects when logged out
- `/seller/*` redirects when logged out
- `/reseller-dashboard/*` redirects when logged out
- `/admin/*` redirects when logged out
- backend role checks are enforced on all privileged APIs

## API Security

- rate limiting enabled
- CSRF token endpoint works
- origin checks enabled for mutations
- Zod validation used on write endpoints
- no service role key leaked to browser

## File Upload Security

- Cloudinary signatures are server-generated only
- upload MIME type is validated
- file size limits enforced
- seller/admin ownership checks enforced before attaching uploads

## Infrastructure

- Vercel production env variables set
- Render production env variables set
- Supabase auth redirect URLs set
- Cloudflare SSL enabled
- database backups verified
- Redis/queue connectivity verified

## Observability

- request logging enabled
- auth exchange failures monitored
- admin actions auditable
- session issues traceable with login activity records
