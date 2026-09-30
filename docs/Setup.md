# Development Setup

## Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18+ | Runtime |
| npm | 9+ | Package manager |
| PostgreSQL | 14+ | Primary database |
| Redis | 7+ | Cache, sessions, queues |
| Git | Latest | Version control |

Optional: Docker and Docker Compose for containerized development.

---

## Quick Start

```bash
# Clone
git clone <repository-url>
cd shop

# Install
npm install

# Environment
cp .env.example .env

# Database
npx prisma migrate dev
npx prisma db seed

# Run
npm run dev
```

Open http://localhost:3000.

---

## Environment Setup

### Required Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/lofimart?schema=public"
DIRECT_URL="postgresql://user:password@localhost:5432/lofimart?schema=public"
REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
JWT_SECRET="your-256-bit-secret"
CSRF_SECRET="your-csrf-secret"
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"
NEXT_PUBLIC_FRONTEND_URL="http://localhost:3000"
```

---

## Database Setup

### Option A: Local PostgreSQL

```bash
createdb lofimart
npx prisma migrate dev
npx prisma db seed
npx prisma studio
```

### Option B: Docker PostgreSQL

```bash
docker run -d --name lofimart-postgres \
  -e POSTGRES_DB=lofimart \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:16-alpine

npx prisma migrate dev
npx prisma db seed
```

### Seed Data

- Admin user: admin@amarshop.local / ChangeMe123!
- Seller user: seller@amarshop.local / ChangeMe123!
- 8 product categories
- 2 sample products
- 2 coupons
- 1 banner, 1 blog post
- 2 ledger accounts

---

## Redis Setup

```bash
# Local
redis-server

# Docker
docker run -d --name lofimart-redis -p 6379:6379 redis:7-alpine

# Verify
redis-cli ping
```

---

## Development Server

```bash
npm run dev
```

Starts: Next.js dev server (port 3000), WebSocket server (port 3001), 9 BullMQ workers.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| npm run dev | Start development server |
| npm run build | Build for production |
| npm start | Start production server |
| npm run lint | Run ESLint |
| npm run test | Run Vitest tests |
| npx prisma migrate dev | Create and apply migration |
| npx prisma migrate deploy | Apply pending migrations |
| npx prisma db seed | Seed database |
| npx prisma studio | Open Prisma Studio GUI |
| npx prisma generate | Regenerate Prisma client |

---

## Testing

```bash
npm run test
npx vitest run tests/server/
npx vitest run tests/lib/
```

### Test Structure

```
tests/
  server/
    validation.test.ts
    origin.test.ts
    logisticsHelpers.test.ts
    httpCache.test.ts
    csrf.test.ts
    cookies.test.ts
  lib/
    utils.test.ts
    sellerApproval.test.ts
    security.test.ts
    roleNavigation.test.ts
    exports.test.ts
    browserActions.test.ts
    blog.test.ts
    bangladesh.test.ts
    apiResponse.test.ts
```

---

## Docker Development

```bash
docker compose up -d
docker compose logs -f app
docker compose down
docker compose up -d --build
```

---

## Common Issues

| Error | Solution |
|-------|----------|
| Can't reach database server | Ensure PostgreSQL is running and DATABASE_URL is correct |
| connect ECONNREFUSED 127.0.0.1:6379 | Ensure Redis is running |
| PrismaClientKnownRequestError | Run npx prisma generate |
| listen EADDRINUSE :::3000 | Kill existing process or change PORT |

---

## Known Limitations

1. No hot module replacement for server-side code
2. Database seeding is destructive
3. No local email sending (requires SMTP relay)
4. WebSocket development requires separate port

## Future Improvements

1. Docker Compose with pre-configured services
2. Development seed scripts with more test data
3. Local email testing (Mailhog/Mailpit)
4. Development dashboard for queue monitoring

---
