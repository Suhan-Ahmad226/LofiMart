# System Architecture

## Executive Summary

LofiMart (Commerce OS) is a large-scale multi-vendor ecommerce platform built on a **dual-stack architecture** combining Next.js App Router (server-side rendering, API routes) with a custom Express.js HTTP server. The system supports customers, sellers, resellers, and administrators through role-based dashboards, integrated courier logistics, multiple payment gateways, AI-powered features, and a full accounting module.

**Key Technologies:**
- **Runtime:** Node.js (TypeScript)
- **Frontend:** Next.js 15+ (App Router, React Server Components)
- **Backend:** Express.js (custom server wrapping Next.js)
- **Database:** PostgreSQL (via Prisma ORM)
- **Cache/Pub-Sub:** Redis (ioredis)
- **Queue:** BullMQ (Redis-backed)
- **Auth:** Supabase (OAuth/email) + Custom JWT sessions
- **Realtime:** WebSocket (ws)
- **Containerization:** Docker + Docker Compose

---

## High-Level Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["Web Browser"]
        Mobile["Mobile PWA"]
        Telegram["Telegram Bot"]
    end

    subgraph "CDN / Edge"
        Cloudinary["Cloudinary (Media)"]
    end

    subgraph "Application Layer"
        NextJS["Next.js App Router<br/>(SSR/SSG/API Routes)"]
        Express["Express.js Server<br/>(Custom API: 200+ routes)"]
        WS["WebSocket Server<br/>(Real-time stock updates)"]
    end

    subgraph "Middleware Layer"
        Auth["Auth Middleware<br/>(JWT + Redis Sessions)"]
        RateLimit["Rate Limiter<br/>(Redis + in-memory fallback)"]
        CSRF["CSRF Protection"]
        CORS["CORS Protection"]
        Validation["Request Validation<br/>(Zod)"]
    end

    subgraph "Business Logic"
        Modules["Domain Modules<br/>(Accounting, Inventory,<br/>Logistics, Payments, RBAC)"]
        Workers["BullMQ Workers<br/>(9 queue processors)"]
        Events["Event System<br/>(Domain Events)"]
        AI["AI Features<br/>(Gemini Chatbot,<br/>Recommendations,<br/>Visual Search,<br/>Pricing Optimization)"]
    end

    subgraph "Data Layer"
        Prisma["Prisma ORM<br/>(72 models)"]
        PostgreSQL[("PostgreSQL<br/>(Primary DB)")]
        Redis[("Redis<br/>(Cache, Sessions,<br/>Queues, Pub-Sub)")]
    end

    subgraph "External Integrations"
        Supabase["Supabase<br/>(OAuth + Auth)"]
        bKash["bKash<br/>(Mobile Payment)"]
        Stripe["Stripe<br/>(Card Payments)"]
        SSLCommerz["SSLCommerz<br/>(Gateway)"]
        Pathao["Pathao Courier"]

        TelegramAPI["Telegram Bot API"]
    end

    Browser --> NextJS
    Mobile --> NextJS
    Telegram --> TelegramAPI
    NextJS --> Express
    NextJS --> Cloudinary
    Express --> Auth
    Express --> RateLimit
    Express --> CSRF
    Express --> CORS
    Express --> Validation
    Auth --> Modules
    Modules --> Prisma
    Prisma --> PostgreSQL
    Modules --> Redis
    Workers --> Redis
    Workers --> Prisma
    Events --> Redis
    Express --> Supabase
    Express --> bKash
    Express --> Stripe
    Express --> SSLCommerz
    Modules --> Pathao

    WS --> Redis
```

---

## Dual-Stack Server Architecture

The application runs two server stacks in a single Node.js process:

```mermaid
graph LR
    subgraph "Single Node.js Process"
        HTTP["HTTP Server<br/>(port 3000)"]
        
        subgraph "Next.js Handler"
            NApp["App Router Pages"]
            NAPI["API Route Handlers<br/>(/api/v2/*, /api/auth/*)"]
            SSR["Server Components"]
        end
        
        subgraph "Express Handler"
            EAPI["Express Routes<br/>(/api/* catch-all)"]
            SellerRoutes["Seller Routes"]
            AdminRoutes["Admin Routes"]
        end
        
        WebSocketServer["WebSocket Server<br/>(port 3001)"]
    end

    HTTP -->|"/*"| NApp
    HTTP -->|"/api/v2/*"| NAPI
    HTTP -->|"/api/*"| EAPI
    EAPI --> SellerRoutes
    EAPI --> AdminRoutes
    HTTP -.->|"Upgrade"| WebSocketServer
```

### Request Routing Logic

1. **Next.js App Router** handles: SSR pages, `/api/v2/*` endpoints, `/api/auth/*` endpoints
2. **Express.js** handles: `/api/*` catch-all (200+ routes), seller/admin routes, logistics, payments
3. **WebSocket** handles: real-time stock updates on separate port (3001)

---

## Domain Module Architecture

The business logic is organized into domain modules following a clean architecture pattern:

```mermaid
graph TB
    subgraph "Domain Modules"
        ACC["Accounting Module"]
        INV["Inventory Module"]
        LOG["Logistics Module"]
        PAY["Payments Module"]
        RBAC["RBAC Module"]
        PROF["Profile Module"]
    end

    subgraph "Module Pattern"
        Contracts["contracts.ts<br/>(Interfaces + Types)"]
        Application["application.ts<br/>(Use Cases)"]
        Services["services/<br/>(External Adapters)"]
    end

    Contracts --> Application
    Application --> Services

    subgraph "Event System"
        Publisher["EventPublisher"]
        CommerceEvents["Commerce Events"]
        InventoryEvents["Inventory Events"]
        LogisticsEvents["Logistics Events"]
    end

    Application --> Publisher
    Publisher --> CommerceEvents
    Publisher --> InventoryEvents
    Publisher --> LogisticsEvents
```

Each module follows the pattern:
- **`contracts.ts`** — TypeScript interfaces, input/output types, repository contracts
- **`application.ts`** — Business logic factory functions (use cases)
- **`services/`** — External service adapters (courier APIs, payment gateways)

---

## Data Flow Architecture

### Event-Driven Processing

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Module
    participant DB as PostgreSQL
    participant Queue as BullMQ Queue
    participant Worker
    participant External

    Client->>API: Request
    API->>Module: Execute use case
    Module->>DB: Read/Write data
    Module->>Queue: Enqueue async job
    Module-->>API: Response
    API-->>Client: 200 OK

    Queue->>Worker: Dequeue job
    Worker->>External: Call external service
    Worker->>DB: Update status
    Worker->>Queue: Enqueue follow-up job (optional)
```

### Cache Strategy

```mermaid
graph LR
    Request["Incoming Request"] --> CacheCheck{"Redis Cache<br/>Hit?"}
    CacheCheck -->|"Hit"| ReturnCache["Return Cached"]
    CacheCheck -->|"Miss"| FetchDB["Fetch from DB"]
    FetchDB --> SetCache["Set in Redis<br/>(TTL-based)"]
    SetCache --> ReturnFresh["Return Fresh"]
```

**Cache Layers:**
- **Product data:** `product:{id}` with configurable TTL
- **Inventory:** `inventory:*` invalidated on stock changes
- **Commerce channel settings:** `platform:commerce-channel-settings` (5 min TTL)
- **Seller dashboard:** `seller:{id}:*` with prefix invalidation
- **bKash tokens:** `payments:bkash:tokenized:token` with skew-aware expiry

---

## Multi-Tenancy Architecture

```mermaid
graph TB
    subgraph "Tenant Context"
        ALS["AsyncLocalStorage<br/>(Request-scoped)"]
        TenantID["tenantId"]
    end

    subgraph "Prisma Extension"
        Filter["Automatic Tenant Filter"]
        Inject["Automatic Tenant Injection"]
    end

    ALS --> TenantID
    TenantID --> Filter
    TenantID --> Inject
    Filter -->|"findUnique/findMany"| Where["WHERE tenantId = ?"]
    Inject -->|"create/upsert"| Data["data.tenantId = ?"]
```

**Tenant-scoped models:** User, Product, Order, Warehouse, Tenant, Store

The Prisma client is extended with middleware that automatically:
- Adds `tenantId` to WHERE clauses on reads
- Injects `tenantId` into data on writes
- Can be bypassed with `bypass: true` in the tenant context

---

## Frontend Architecture

### Route Groups

| Route Group | Purpose | Auth Required |
|------------|---------|---------------|
| `(shop)` | Public storefront (cart, checkout, products, search) | No |
| `(content)` | Static content (blog, about, terms, help) | No |
| `(immersive)` | AR/3D features (try-on, room visualizer) | No |
| `(bazaar)` | Marketplace discovery (affiliate, loyalty, reseller) | No |
| `(auth)` | Login, register, password reset | No |
| `(user)` | Customer dashboard (orders, wallet, wishlist) | Yes |
| `(seller)` | Seller dashboard (products, orders, analytics) | Yes |
| `(reseller)` | Reseller dashboard (catalog, earnings, network) | Yes |
| `(admin)` | Admin dashboard (all management) | Yes |

### Component Architecture

```mermaid
graph TB
    subgraph "Feature Modules (features/)"
        ShopFeatures["Shop Features<br/>(Cart, Checkout, Products)"]
        SellerFeatures["Seller Features<br/>(Dashboard, Products, Orders)"]
        AdminFeatures["Admin Features<br/>(All Admin Screens)"]
        AIFeatures["AI Features<br/>(Chatbot, Stylist, Voice)"]
        AuthFeatures["Auth Features<br/>(Login, Register)"]
        InventoryFeatures["Inventory Features<br/>(Warehouses, Stock)"]
        ResellerFeatures["Reseller Features<br/>(Catalog, Earnings)"]
        CourierFeatures["Courier Features<br/>(Pathao)"]
    end

    subgraph "Shared Components (features/shared/)"
        UI["UI Components<br/>(Skeleton, Feedback, Image)"]
        Layout["Layout Components<br/>(Dashboard, App)"]
        Services["Services<br/>(Cache, DB, Media, Redis)"]
        State["State Management<br/>(UserContext)"]
        PWA["PWA Components"]
    end

    subgraph "Page Components (app/)"
        Pages["Next.js Pages<br/>(Route Groups)"]
    end

    Pages --> ShopFeatures
    Pages --> SellerFeatures
    Pages --> AdminFeatures
    Pages --> AIFeatures
    ShopFeatures --> UI
    SellerFeatures --> UI
    AdminFeatures --> UI
```

---

## Background Job Architecture

```mermaid
graph TB
    subgraph "9 BullMQ Queues"
        Q1["inventory-alerts"]
        Q2["cache-warmup"]
        Q3["email"]
        Q4["order-processing"]
        Q5["payment-processing"]
        Q6["notifications"]
        Q7["analytics"]
        Q8["stock-updates"]
        Q9["cart-recovery"]
    end

    subgraph "Queue Producers"
        API["API Routes"]
        Modules["Domain Modules"]
        Events["Event Handlers"]
    end

    subgraph "Workers"
        W1["Inventory Worker"]
        W2["Cache Worker"]
        W3["Email Worker"]
        W4["Order Worker"]
        W5["Payment Worker"]
        W6["Notification Worker"]
        W7["Analytics Worker"]
        W8["Stock Worker"]
        W9["Cart Recovery Worker"]
    end

    API --> Q1 & Q2 & Q3 & Q4 & Q5 & Q6 & Q7 & Q8 & Q9
    Modules --> Q1 & Q4 & Q5
    Events --> Q7 & Q8

    Q1 --> W1
    Q2 --> W2
    Q3 --> W3
    Q4 --> W4
    Q5 --> W5
    Q6 --> W6
    Q7 --> W7
    Q8 --> W8
    Q9 --> W9
```

---

## Security Architecture

```mermaid
graph TB
    subgraph "Request Pipeline"
        Client["Client Request"]
        BotBlock["Bot Blocking<br/>(middleware.ts)"]
        CORS["CORS Check"]
        SecurityHeaders["Security Headers"]
        RateLimit["Rate Limiting"]
        CSRF["CSRF Validation"]
        Auth["Authentication<br/>(JWT + Redis)"]
        RBAC["Authorization<br/>(Role + Permission)"]
        Validation["Input Validation<br/>(Zod)"]
        Handler["Route Handler"]
    end

    Client --> BotBlock --> CORS --> SecurityHeaders --> RateLimit --> CSRF --> Auth --> RBAC --> Validation --> Handler
```

---

## Known Limitations

1. **Monolithic `server.ts`** — The Express server file exceeds 17,000 lines, making it difficult to maintain and test
2. **No GraphQL layer** — All data fetching is through REST, leading to potential over/under-fetching
3. **Single-process WebSocket** — WebSocket server runs in the same process; no horizontal scaling for real-time features
4. **In-memory fallback cache** — When Redis is unavailable, the system falls back to in-memory cache which doesn't persist across restarts
5. **No CDN for API responses** — Only media assets benefit from Cloudinary CDN; API responses are not edge-cached

## Future Improvements

1. **Extract Express routes** into separate modules with dependency injection
2. **Add GraphQL/Apollo** for flexible client-side data queries
3. **Externalize WebSocket** to a dedicated Redis Pub/Sub-backed service
4. **Implement API gateway** pattern for rate limiting and authentication
5. **Add OpenTelemetry** for distributed tracing across services
6. **Migrate to microservices** for payment, logistics, and AI features
7. **Add edge functions** for geo-distributed API caching
