# LofiMart Development Setup

## Prerequisites

| Software | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime |
| npm | Current supported version | Package manager |
| PostgreSQL | Supported project version | Primary database |
| Redis | Supported project version | Cache, queues and application infrastructure |
| Git | Latest | Version control |

## Quick start

```bash
git clone <repository-url>
cd LofiMart
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Required Supabase configuration

Set:

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
SUPABASE_SERVICE_ROLE_KEY="your-server-only-service-role-key"
```

The preferred configuration uses the publishable key. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is retained only as compatibility fallback in existing code and should not be introduced in new code.

## Authentication development model

```text
Browser
  ↓
Supabase Auth
  ↓
Supabase SSR session
  ↓
LofiMart server authentication
  ↓
Prisma User
  ↓
RBAC
```

Do not configure a separate LofiMart JWT secret for browser login. Do not create an `access_token` cookie or localStorage auth token.

## Database

Use the project's existing Prisma migrations.

```bash
npx prisma generate
npx prisma migrate deploy
```

For local development, use the normal Prisma workflow approved for the project. Do not run destructive database reset commands against production.

## Redis

Redis is required for application infrastructure used by caching, rate limiting, queues and coordination.

```bash
redis-server
```

Verify:

```bash
redis-cli ping
```

## Development checks

```bash
npm run lint
npm run test
npm run build
```

## Authentication troubleshooting

### Supabase client not configured

Verify:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### API returns 401

Check:

1. the Supabase session exists;
2. the access token is valid;
3. the request uses `Authorization: Bearer <token>` when calling a token-authenticated API directly;
4. the matching Prisma `User.supabaseAuthId` exists;
5. the user is not blocked or deactivated.

### Do not troubleshoot with legacy auth

Do not add:

- `access_token` cookies;
- custom JWT generation;
- Redis authentication sessions;
- localStorage authentication tokens;
- local bcrypt verification.

Those are not part of the current architecture.

## Production deployment

Configure Supabase and server secrets in the deployment platform. Never commit production credentials to the repository.
