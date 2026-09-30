# LofiMart — Commerce OS

A large-scale multi-vendor ecommerce platform built with **Next.js**, **Express.js**, **Prisma**, **PostgreSQL**, and **Redis**.

> **Current payment model:** checkout is **Cash on Delivery only**. Online gateways (Stripe, bKash, SSLCommerz) have been removed. See [CHANGES.md](./CHANGES.md) and the [Full Audit Report](./PROJECT_FULL_AUDIT_REPORT.md).

---

## Features

- **Multi-Vendor Marketplace** — Multiple sellers with independent dashboards
- **Customer Dashboard** — Orders, wallet, loyalty rewards
- **Seller Dashboard** — Products, orders, inventory, analytics, courier management
- **Reseller Network** — Referral system, markup management, custom storefronts
- **Admin Dashboard** — Full platform management, monitoring, flash sales, coupons
- **Cash on Delivery** — Checkout collects orders COD; collect-on-delivery settlement
- **Courier Integration** — Pathao (provider registry ready for more couriers)
- **Telegram Bot** — Order notifications, seller management via Telegram
- **Loyalty & Rewards** — Reward points, referral credits
- **Push Notifications** — Browser push via web-push

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15+ (App Router, React Server Components) |
| Backend | Express.js (custom server) |
| Database | PostgreSQL (Prisma ORM, 72 models) |
| Cache | Redis (ioredis) |
| Queue | BullMQ (10 background workers) |
| Auth | Supabase (OAuth) + JWT + Redis sessions |
| Media | Cloudinary |
| Realtime | WebSocket (ws) |
| Container | Docker + Docker Compose |

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

Open [http://localhost:3000](http://localhost:3000).

---

## Documentation

Complete technical documentation is available in the [`docs/`](./docs/) folder. The current, authoritative audit is in [**`PROJECT_FULL_AUDIT_REPORT.md`**](./PROJECT_FULL_AUDIT_REPORT.md).

| Document | Description |
|----------|-------------|
| [Architecture](./docs/Architecture.md) | System architecture, design patterns, diagrams |
| [Database](./docs/Database.md) | Schema, 72 models, ER diagrams, multi-tenancy |
| [API Reference](./docs/API.md) | All endpoints with request/response examples |
| [Security](./docs/Security.md) | Security layers, encryption, audit logging |
| [Authentication](./docs/Authentication.md) | Auth flows, OAuth, session management |
| [RBAC](./docs/RBAC.md) | Roles, permissions, access control matrix |
| [Business Rules](./docs/Business-Rules.md) | Validation rules, constraints, workflows |
| [Order Flow](./docs/Order-Flow.md) | Order lifecycle, multi-vendor splitting |
| [Seller Flow](./docs/Seller-Flow.md) | Seller lifecycle, onboarding, operations |
| [Error Handling](./docs/Error-Handling.md) | Error patterns, response formats |
| [Environment Variables](./docs/Environment-Variables.md) | All env vars with security notes |
| [Deployment](./docs/Deployment.md) | Docker, CI/CD, infrastructure |
| [Monitoring](./docs/Monitoring.md) | Health checks, logging, alerting |
| [Setup Guide](./docs/Setup.md) | Development environment setup |
| [Folder Structure](./docs/Folder-Structure.md) | Codebase organization |
| [Changelog](./docs/Changelog.md) | Version history |

> Note: `docs/Features.md`, `docs/Phases.md`, `docs/Payment-Flow.md`, `docs/PROJECT_DOCUMENTATION.md` still describe removed features (AI, AR/3D, bKash/Stripe, POS, PWA) and are kept as historical records. The current state is reflected in this README and `PROJECT_FULL_AUDIT_REPORT.md`.

---

## Project Structure

```
shop/
├── src/
│   ├── app/            # Next.js pages + API routes
│   ├── features/       # Feature modules (shop, seller, admin, courier, orders, push, …)
│   ├── modules/        # Domain modules (rbac, inventory, logistics, reservation, …)
│   ├── server/         # Express middleware, routes, controllers, services, security
│   ├── components/     # Shared React components
│   ├── lib/            # Utility libraries
│   ├── hooks/          # React hooks
│   ├── events/         # Domain event system
│   └── workers/        # BullMQ background workers (10 queues/processors)
├── prisma/             # Database schema + seed
├── tests/              # Test suites (Vitest)
├── docs/               # Technical documentation
├── server.ts           # Express entrypoint (bootstrap lives in src/server/)
├── Dockerfile          # Container build
└── docker-compose.yml  # Local development services
```

---

## Default Credentials (Development)

| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | `admin@amarshop.local` | `ChangeMe123!` | admin |
| Seller | `seller@amarshop.local` | `ChangeMe123!` | seller |

> **Warning:** Change these credentials before deploying to production.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |
| `npx prisma migrate dev` | Create migration |
| `npx prisma db seed` | Seed database |
| `npx prisma studio` | Open Prisma Studio |

---

## License

Private — All rights reserved.
