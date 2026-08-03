# LofiMart — Commerce OS

A large-scale multi-vendor ecommerce platform built with **Next.js**, **Express.js**, **Prisma**, **PostgreSQL**, and **Redis**.

---

## Features

- **Multi-Vendor Marketplace** — Multiple sellers with independent dashboards
- **Customer Dashboard** — Orders, wallet, wishlist, loyalty rewards
- **Seller Dashboard** — Products, orders, inventory, analytics, courier management
- **Reseller Network** — Referral system, markup management, custom storefronts
- **Admin Dashboard** — Full platform management, accounting, POS, monitoring
- **AI Features** — Chatbot, recommendations, visual search, pricing optimization
- **Immersive Tech** — AR try-on, 3D product viewer, room visualizer
- **Payment Gateways** — bKash, Stripe, SSLCommerz, Cash on Delivery, Wallet
- **Courier Integration** — Pathao, RedX, Steadfast, Paperfly
- **Telegram Bot** — Order notifications, seller management via Telegram
- **Gamification** — Login streaks, spin wheel, missions, referral rewards
- **Accounting** — Double-entry bookkeeping, ledger, journal entries
- **PWA** — Offline support, push notifications, install prompt

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15+ (App Router, React Server Components) |
| Backend | Express.js (custom server) |
| Database | PostgreSQL (Prisma ORM, 72 models) |
| Cache | Redis (ioredis) |
| Queue | BullMQ (9 background workers) |
| Auth | Supabase (OAuth) + JWT + Redis sessions |
| Media | Cloudinary |
| AI | Google Gemini |
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

Complete technical documentation is available in the [`docs/`](./docs/) folder:

| Document | Description |
|----------|-------------|
| [Architecture](./docs/Architecture.md) | System architecture, design patterns, diagrams |
| [Database](./docs/Database.md) | Schema, 72 models, ER diagrams, multi-tenancy |
| [API Reference](./docs/API.md) | All endpoints with request/response examples |
| [Security](./docs/Security.md) | Security layers, encryption, audit logging |
| [Authentication](./docs/Authentication.md) | Auth flows, OAuth, session management |
| [RBAC](./docs/RBAC.md) | Roles, permissions, access control matrix |
| [Features](./docs/Features.md) | Complete feature catalog (30+ modules) |
| [Business Rules](./docs/Business-Rules.md) | Validation rules, constraints, workflows |
| [Order Flow](./docs/Order-Flow.md) | Order lifecycle, multi-vendor splitting |
| [Payment Flow](./docs/Payment-Flow.md) | Payment processing, gateway integration |
| [Seller Flow](./docs/Seller-Flow.md) | Seller lifecycle, onboarding, operations |
| [Error Handling](./docs/Error-Handling.md) | Error patterns, response formats |
| [Environment Variables](./docs/Environment-Variables.md) | All env vars with security notes |
| [Deployment](./docs/Deployment.md) | Docker, CI/CD, infrastructure |
| [Monitoring](./docs/Monitoring.md) | Health checks, logging, alerting |
| [Setup Guide](./docs/Setup.md) | Development environment setup |
| [Folder Structure](./docs/Folder-Structure.md) | Codebase organization |
| [Development Phases](./docs/Phases.md) | Roadmap and feature timeline |
| [Changelog](./docs/Changelog.md) | Version history |
| [AI Prompts](./docs/Prompts.md) | AI integration details |

---

## Project Structure

```
shop/
├── src/
│   ├── app/            # Next.js pages + API routes
│   ├── features/       # Feature modules (admin, seller, shop, AI, etc.)
│   ├── modules/        # Domain modules (accounting, inventory, RBAC, etc.)
│   ├── server/         # Express middleware, routes, security
│   ├── components/     # Shared React components
│   ├── lib/            # Utility libraries
│   ├── hooks/          # React hooks
│   ├── events/         # Domain event system
│   └── workers/        # BullMQ background workers
├── prisma/             # Database schema + seed
├── tests/              # Test suites (Vitest)
├── docs/               # Technical documentation
├── server.ts           # Custom Express server (17,000+ lines)
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
