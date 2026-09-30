# LofiMart Database Architecture

## Overview

LofiMart uses PostgreSQL through Prisma. Supabase Auth maintains its own Auth identity data, while LofiMart's Prisma schema stores marketplace/business data.

The important identity relationship is:

```text
Supabase auth.users.id
        │
        │ supabaseAuthId
        ▼
Prisma User
        │
        ├── role
        ├── tenant
        ├── seller/store state
        ├── profile
        └── marketplace relationships
```

Prisma `User` is the LofiMart business identity; it is not a password-verification system.

## Authentication-related data

### User

The `User` model stores application/business identity such as:

- LofiMart user ID;
- `supabaseAuthId`;
- email/profile data;
- role;
- tenant;
- seller/store state;
- account status;
- marketplace relationships.

Authentication credentials and browser session lifecycle are owned by Supabase Auth.

### Authentication-related historical models

If older schema objects such as session/password-reset/verification records remain in the database for migration compatibility, they must not be treated as the current authentication authority.

Before removing or migrating any historical schema object, inspect live usage and migration history. Do not run destructive production migrations solely to clean documentation.

## Core business models

| Area | Examples |
|---|---|
| Marketplace | User, Product, Category, Store, Tenant |
| Orders | Order, OrderItem, OrderShipment, Invoice |
| Inventory | Warehouse, InventoryItem, InventoryMovement, StockReservation |
| Payments | PaymentTransaction, Refund, PayoutMethod, PayoutTransaction |
| Seller/reseller | Seller/store relationships, ResellerMarkup, ResellerCommission |
| Security | AuditLog, VerificationSubmission, VerificationDocument, UserRiskFlag |
| Community | CommunityPost, comments, likes, reports |
| Notifications | NotificationPreference, UserNotification, PushSubscription |
| Accounting | LedgerAccount, JournalEntry, JournalLine, Expense |

## Tenant isolation

LofiMart uses request-scoped tenant context and Prisma extensions for application-level tenant scoping.

Application code should use the tenant-aware Prisma client unless a deliberate cross-tenant operation is required.

## Security rules

1. Never store a password in plaintext.
2. Do not use Prisma `User` as a replacement for Supabase Auth.
3. Do not add a second login-session table unless the architecture is explicitly redesigned.
4. Authorization must derive from the verified Supabase identity plus Prisma role/ownership data.
5. Keep financial, audit and ownership records server-side.
6. Use transactions for multi-record business operations.

## Schema changes

- Inspect the current Prisma schema before changing authentication-related models.
- Prefer non-destructive migrations.
- Never reset or drop production data as part of auth cleanup.
- Historical migration files are immutable records and should not be rewritten to make documentation look current.
