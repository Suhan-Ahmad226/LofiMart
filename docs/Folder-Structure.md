# Folder Structure

## Root Directory

```
shop/
  .github/                    CI/CD workflows
    workflows/ci.yml          GitHub Actions pipeline
  prisma/                     Database schema and seed
    schema.prisma             72 models, 1498 lines
    seed.ts                   Database seeding script
  public/                     Static assets
  src/                        Application source code
  tests/                      Test suites
  docs/                       Documentation
  Dockerfile                  Container build
  docker-compose.yml          Local development services
  server.ts                   Custom Express server (17000+ lines)
  package.json                Dependencies and scripts
  next.config.ts              Next.js configuration
  tsconfig.json               TypeScript configuration
  vitest.config.mjs           Test configuration
  .env.example                Environment template
```

---

## Source Directory (src/)

```
src/
  index.css                   Global styles
  middleware.ts                Next.js middleware
  types.ts                    Shared TypeScript types

  app/                        Next.js App Router
    layout.tsx                Root layout
    page.tsx                  Homepage
    (admin)/                  Admin dashboard (23 pages)
    (auth)/                   Auth pages (login, register, forgot/reset password)
    (bazaar)/                 Marketplace discovery (5 pages)
    (content)/                Static content (17 pages)
    (immersive)/              AR/3D features (4 pages)
    (reseller)/               Reseller dashboard (9 pages)
    (seller)/                 Seller dashboard (18 pages)
    (shop)/                   Public storefront (11 pages)
    (user)/                   Customer dashboard (9 pages)
    auth/callback/            OAuth callback
    payment/bkash/            bKash payment callbacks
    api/                      API routes (~80 endpoints)
      auth/                   Authentication APIs
      v2/                     Versioned APIs
      admin/                  Admin APIs
      seller/                 Seller APIs
      payments/               Payment processing
      orders/                 Order management
      products/               Product catalog
      cart/                   Shopping cart
      logistics/              Courier management
      telegram/               Telegram bot
      ai/                     AI features

  components/                 React components
    3d/                       3D viewer components
    ai/                       AI feature components
    analytics/                Analytics components
    animations/               Animation components
    ar/                       AR components
    auth/                     Auth UI components
    conversion/               Conversion tracking
    Inventory/                Inventory dashboard
    media/                    Media upload components
    profile/                  Profile management
    reseller/                 Reseller components
    seller/                   Seller components
    ui/                       Shared UI primitives

  data/                       Static data files
    bangladesh-addresses.json

  events/                     Domain event system
    commerce.ts               Commerce events
    contracts.ts              Event types
    inventory.ts              Inventory events
    logistics.ts              Logistics events
    publisher.ts              Event publisher

  features/                   Feature modules
    admin/                    Admin (screens + services)
    ai/                       AI (components + hooks + screens)
    auth/                     Auth (components + screens + services)
    bazaar/                   Marketplace discovery
    courier/                  Courier core, provider registry, and Pathao adapter
    customer/                 Customer dashboard screens
    inventory/                Inventory (components + hooks + services + state)
    pos/                      POS payment gateways
    public/                   Public content pages
    reseller/                 Reseller (components + screens)
    seller/                   Seller (components + screens + lib)
    shared/                   Shared infrastructure
      analytics/              Analytics components
      animations/             Animation components
      app/                    App chrome/providers
      components/             Shared components
      immersive/              AR/3D infrastructure
      layout/                 Layout components
      media/                  Media services
      orders/                 Order components
      profile/                Profile components
      pwa/                    PWA components
      services/               Core services
        cache/                Redis caching
        database/             Prisma + tenant context
        media/                Cloudinary upload
        messaging/            Redis client
        monitoring/           Error tracker
        platform/             Commerce channels, footer config
        security/             Field encryption
      state/                  UserContext
      ui/                     Shared UI primitives
    shop/                     Storefront (components + screens + state)
    telegram_bot/             Telegram bot services

  hooks/                      React hooks

  lib/                        Utility libraries
    api-response.ts           API response helpers
    api.ts                    Client-side API helpers
    auth-ui.ts                Auth UI utilities
    bangladesh-address.ts     Address validation
    blog.ts                   Blog utilities
    browser-actions.ts        Browser actions
    client-cache.ts           Client-side caching
    cloudinary.ts             Cloudinary config
    commerce-channels.ts      Channel configuration
    env.ts                    Environment variable parsing
    logger.ts                 Structured logger
    navigation.tsx            Navigation config
    role-navigation.ts        Role-based navigation
    sellerApproval.ts         Seller approval logic
    server.ts                 Server utilities
    skuLabel.ts               SKU formatting
    utils.ts                  General utilities

  modules/                    Domain modules
    accounting/               Double-entry bookkeeping
    inventory/                Inventory management
    logistics/                Logistics/courier
    payments/                 Payment processing
    profile/                  Profile validation (Zod)
    rbac/                     Role-based access control

  server/                     Express server infrastructure
    auth.ts                   Authentication middleware
    httpCache.ts              HTTP caching
    rateLimit.ts              Rate limiting
    serializers.ts            Data serializers
    middleware/                Express middleware
      corsProtection.ts       CORS protection
      errorHandler.ts         Error handling
      requestLogging.ts       Request logging
      validation.ts           Zod validation
    next/                     Next.js route helpers
      apiSecurity.ts          Secure API route helper
      requireDashboardAccess.ts  Dashboard guard
      requireUser.ts          User extraction
    routes/                   Express route definitions
      auth.ts                 Auth routes (1001 lines)
      context.ts              Route dependency injection
      logistics.ts            Logistics routes
      logisticsHelpers.ts     Logistics utilities
      orders.ts               Order routes (1704 lines)
      seller.ts               Seller routes (1532 lines)
      serializers.ts          Route serializers
      users.ts                User routes
    security/                 Security utilities
      cookies.ts              Cookie options
      csrf.ts                 CSRF protection
      origin.ts               Origin validation

  services/                   Legacy services
    database/prisma.ts        Prisma client
    inventoryApi.ts           Inventory API client

  types/                      TypeScript type definitions
    inventory.ts              Inventory types

  utils/                      Utility functions
    offlineStorage.ts         PWA offline storage

  workers/                    Background job processors
    index.ts                  Worker entry point
    queue.ts                  Queue definitions (9 queues)
```

---

## Route Groups Summary

| Group | Purpose | Pages | Auth |
|-------|---------|-------|------|
| (admin) | Admin dashboard | 23 | Admin only |
| (auth) | Authentication | 4 | No |
| (bazaar) | Marketplace discovery | 5 | No |
| (content) | Static content | 17 | No |
| (immersive) | AR/3D features | 4 | No |
| (reseller) | Reseller dashboard | 9 | Reseller only |
| (seller) | Seller dashboard | 18 | Seller only |
| (shop) | Public storefront | 11 | No |
| (user) | Customer dashboard | 9 | Customer+ |
| api | API routes | ~80 | Varies |

---

## Feature Module Pattern

```
features/{module}/
  README.md           Module description
  components/         UI components
  hooks/              React hooks
  screens/            Page components
  services/           Business logic
  state/              React context
  lib/                Utilities
```

Each subdirectory has an index.ts barrel export.

---

## Domain Module Pattern

```
modules/{module}/
  index.ts            Module factory + exports
  contracts.ts        Interfaces, types, repository contracts
  application.ts      Business logic (use cases)
```

---

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| server.ts | 17,096 | Custom Express server with all routes |
| prisma/schema.prisma | 1,498 | Database schema (72 models) |
| src/server/serializers.ts | 1,536 | Data serialization |
| src/server/routes/orders.ts | 1,704 | Order routes |
| src/server/routes/seller.ts | 1,532 | Seller routes |
| src/features/auth/services/sessionStore.ts | 252 | JWT + Redis session management |
| src/workers/queue.ts | 408 | BullMQ queue definitions |
| src/features/shared/state/UserContext.tsx | 278 | Client auth state |
| src/features/shared/services/database/prisma.ts | 89 | Tenant-scoped Prisma client |
| src/lib/env.ts | 335 | Environment variable parsing |

---

## Known Limitations

1. Monolithic server.ts (17000+ lines)
2. Mixed Express and Next.js routing
3. Legacy services/ directory duplication
4. Some modules have incomplete barrel exports

## Future Improvements

1. Split server.ts into route modules
2. Remove legacy services/ directory
3. Enforce barrel exports across all modules
4. Add path aliases for cleaner imports
5. Implement strict module boundaries

---
