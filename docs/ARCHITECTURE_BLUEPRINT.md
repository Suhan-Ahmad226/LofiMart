# LofiMart Development Architecture Blueprint

Status: GOVERNING
Branch: development
Baseline: e74279f5dd7f5d89f74242ed66e50840e2a46548
Updated: 2026-10-07

This document is the implementation source of truth for the current architecture-hardening phase.

## Non-negotiable constraints

- development is the source-of-truth branch for this work.
- Next.js-only API architecture. Do not reintroduce Express/server.ts as an application runtime.
- Supabase Auth is the identity/session authority.
- Pathao is the only enabled courier provider for now.
- No destructive Prisma reset/drop or data-destructive cleanup.
- Prisma schema changes must be non-destructive and only after code/verification gates.
- Preserve existing working product behavior unless it conflicts with a security, accounting, or correctness requirement.
- Do not hide failures behind fake success or empty fallback payloads.

## P0 architecture order

1. API canonicalization
   - Canonical application endpoints live under /api/*.
   - Retire compatibility fallback and legacy API generations after reference migration.
   - Never fabricate successful responses for missing endpoints.

2. Authentication and RBAC
   - Supabase Auth remains the sole identity authority.
   - Consolidate authorization around the canonical server auth layer.
   - Enforce role, ownership, and tenant boundaries server-side.
   - Do not let a generic role helper silently broaden permissions.

3. Tenant isolation
   - Seller/admin dashboard data must be scoped to the authenticated tenant wherever the domain model is tenant-aware.
   - A seller request without a tenant context is rejected.
   - Cross-tenant target access is denied.

4. Commerce and orders
   - Server owns prices, discounts, platform fees, delivery fees, stock, warehouse allocation, payment method validation, and idempotency.
   - Multi-vendor shipment allocation must match the verified checkout quote exactly.
   - Order and shipment state transitions must be explicit and ownership checked.

5. Accounting and wallet
   - LedgerAccount + JournalEntry + JournalLine are the long-term accounting source of truth.
   - WalletTransaction is a wallet activity/read model during the migration, not a second independent accounting truth.
   - Balance mutation and its wallet transaction/reward record must be atomic.
   - Seller payable, commission, payout, refund, and platform-fee events must eventually post through the accounting boundary.

6. Logistics
   - Pathao remains the only enabled provider.
   - Courier core stays provider-neutral so additional adapters can be added later.
   - Quotes and bookings must preserve exact warehouse/pickup mapping.

## P1 hardening

- Courier reconciliation and failed-booking recovery.
- Seller/order/shipment ownership enforcement.
- Guest checkout duplicate protection.
- Safe API error mapping without leaking internals.
- Middleware performance and caching.
- Coupon eligibility and deterministic multi-warehouse rules.
- Dashboard query efficiency.
- Telegram/social integrations remain adapters and must not become order-domain dependencies.

## P2 cleanup

- Split oversized screens/components by domain responsibility.
- Remove dead/duplicate services only after reference analysis.
- Reduce duplicate API generations and compatibility helpers.
- Add focused unit/integration/E2E coverage for auth, tenant isolation, order state, accounting, and courier flows.
- Performance and observability cleanup.

## Verification gates

Every P0 implementation batch must pass, in order:

1. TypeScript/typecheck.
2. Lint/build.
3. Relevant tests.
4. Development deployment verification.
5. Only then consider a non-destructive Prisma migration.

## Current implementation batch

- Persist this blueprint in-repo.
- Retire fake-success compatibility behavior by returning HTTP 410.
- Enforce tenant context on seller earnings/stats.
- Make reward wallet mutation atomic and tenant-consistent.
- Continue next with canonical RBAC/ownership and ledger posting boundaries.
