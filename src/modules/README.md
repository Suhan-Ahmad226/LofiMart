# Commerce OS Modules

`src/modules` is now the application and domain layer for the Commerce OS.

Layering rules
- `modules/` owns business rules, use cases, contracts, and module composition.
- `services/` owns infrastructure adapters such as Prisma, Redis, and third-party integrations.
- `server/` owns HTTP/auth/rate-limit adapters and framework-facing middleware.
- `events/` owns domain-event contracts and publishers.
- `workers/` owns queue orchestration and background processors.

Current vertical slice
- `inventory/contracts.ts`: module ports and domain-facing types
- `inventory/application.ts`: inventory use cases
- `inventory/index.ts`: dependency wiring for the inventory module

Target module map
- `rbac/`: roles, permissions, authorization helpers
- `catalog/`: products, variants, pricing, categories
- `cart/`: cart state, promotions, totals
- `checkout/`: checkout orchestration, payment intents
- `orders/`: order lifecycle, fulfillment, refunds
- `inventory/`: stock, warehouses, movements, supplier POs
- `vendors/`: seller onboarding, commissions, settlements
- `logistics/`: shipping rules, courier adapters, tracking
- `accounting/`: ledger, journals, tax, payouts
- `analytics/`: events, KPIs, funnels, dashboards
- `notifications/`: email/push/SMS flows and templates
- `engagement/`: reward coins, streaks, referrals, missions, spin-wheel logic
- `tenancy/`: tenant provisioning, memberships, tenant-level settings and governance
