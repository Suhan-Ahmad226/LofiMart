# LofiMart — Complete Project Documentation

> **Generated:** 2026-07-12 | **Version:** 1.0  
> **Platform:** AI-Powered Multi-Vendor E-Commerce Marketplace

---

# 1. Website Overview

| Field | Detail |
|---|---|
| **Website Name** | LofiMart |
| **Tagline** | AI-Powered E-Commerce |
| **Purpose** | Full-featured multi-vendor marketplace with AI capabilities, reseller network, POS, gamification, and delivery logistics |
| **Target Users** | Customers (Bangladesh-focused), Sellers/Merchants, Resellers, Admins |
| **Domain** | Primary domain served via custom Express server wrapping Next.js |

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router) + React 19 |
| **Language** | TypeScript 5.8 |
| **Styling** | Tailwind CSS v4 + `tw-animate-css` |
| **Database** | PostgreSQL (Supabase) via Prisma 6.19 |
| **Auth** | Supabase Auth (email/password, Google OAuth, Facebook OAuth) + JWT tokens |
| **Cache** | Redis (Upstash) + in-memory |
| **Queue** | BullMQ (Redis-backed) |
| **Payments** | Stripe, bKash, SSLCommerz |
| **File Storage** | Cloudinary |
| **Email** | Nodemailer (SMTP) + Resend |
| **SMS** | Configurable provider (Pathao/RedX/Steadfast) |
| **Real-time** | WebSocket (ws library, port 3101) |
| **Push Notifications** | Web Push API |
| **AI** | Google Gemini (`@google/genai`) |
| **3D/AR** | Three.js + React Three Fiber + Drei |
| **Animations** | Framer Motion |
| **Charts** | Recharts |
| **Server** | Custom Express server (`server.ts`, 16,828 lines) |
| **Validation** | Zod v4 |
| **Testing** | Vitest (unit) + Playwright (e2e) |
| **PWA** | Service Worker + manifest.json |
| **Courier** | Pathao, Steadfast, RedX (Bangladesh logistics) |
| **Telegram** | Bot integration for seller notifications & invoices |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Client (Browser)                │
│  Next.js App Router + React 19 + Tailwind v4    │
│  Service Worker (sw.js)                         │
│  WebSocket Client                               │
└──────────────────┬──────────────────────────────┘
                   │ HTTP / WSS
┌──────────────────▼──────────────────────────────┐
│            Custom Express Server (server.ts)      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Next.js │ │ REST API │ │  WebSocket Server │ │
│  │  Handler │ │ (Express)│ │  (ws, port 3101)  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  BullMQ Workers (separate process)          │ │
│  │  inventory-alerts, email, cart-recovery...  │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────┘
                   │
    ┌──────────────┼──────────────────┐
    │              │                  │
┌───▼───┐    ┌────▼────┐    ┌───────▼───────┐
│Postgres│    │  Redis  │    │  Cloudinary   │
│(Supa)  │    │(Upstash)│    │  (Media CDN)  │
└────────┘    └─────────┘    └───────────────┘
```

## Folder Structure

```
shop/
├── prisma/
│   └── schema.prisma              # 72 models, PostgreSQL
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── icon.svg                   # App icon
│   ├── offline.html               # Offline fallback
│   └── sw.js                      # Service worker
├── server.ts                      # Custom Express server (16,828 lines)
├── src/
│   ├── app/                       # Next.js App Router (180 files)
│   │   ├── layout.tsx             # Root layout (fonts, metadata, providers)
│   │   ├── page.tsx               # Home page
│   │   ├── robots.ts              # SEO robots
│   │   ├── sitemap.ts             # SEO sitemap
│   │   ├── api/                   # 97 API route handlers
│   │   ├── (admin)/               # Admin dashboard
│   │   ├── (auth)/                # Auth pages
│   │   ├── (bazaar)/              # Bazaar/experimental features
│   │   ├── (content)/             # Public content pages
│   │   ├── (immersive)/           # 3D/AR experiences
│   │   ├── (reseller)/            # Reseller dashboard
│   │   ├── (seller)/              # Seller dashboard
│   │   ├── (shop)/                # Shop/public commerce
│   │   └── (user)/                # Customer dashboard
│   ├── components/                # 49 reusable components
│   ├── features/                  # 276 files across 14 feature modules
│   │   ├── admin/                 # Admin screens & services
│   │   ├── ai/                    # AI features (stylist, chatbot, voice)
│   │   ├── auth/                  # Authentication
│   │   ├── bazaar/                # Bazaar features
│   │   ├── courier/               # Courier integrations
│   │   ├── customer/              # Customer dashboard
│   │   ├── inventory/             # Inventory management
│   │   ├── pos/                   # Point of Sale + payments
│   │   ├── public/                # Public content pages
│   │   ├── reseller/              # Reseller module
│   │   ├── seller/                # Seller module
│   │   ├── shared/                # Shared UI, state, services
│   │   ├── shop/                  # Shop/commerce features
│   │   └── telegram_bot/          # Telegram bot integration
│   ├── hooks/                     # 11 custom hooks
│   ├── lib/                       # 20 utility/library files
│   ├── services/                  # 2 service files
│   ├── utils/                     # 1 utility file
│   └── workers/                   # BullMQ queue workers
├── package.json
├── tsconfig.json
├── next.config.ts
└── postcss.config.mjs
```

---

# 2. User Roles

| Role | Description | Permissions |
|---|---|---|
| **Guest** | Unauthenticated visitor | Browse products, view public pages, search, add to cart (local), view community |
| **Customer** | Registered buyer | All guest permissions + checkout, order history, wishlist, reviews, wallet, rewards, address management, profile, notifications, community posting |
| **Seller** | Merchant/vendor | Product CRUD, order management, inventory management, flash sale participation, coupons, payout management, courier integration, manual orders, analytics, storefront customization, Telegram notifications, support tickets |
| **Reseller** | Affiliate seller | Browse reseller catalog, set markups, create manual orders, track commissions, manage network referrals, earnings/payouts, promotions, storefront settings |
| **Admin** | Platform administrator | Full platform access: user management, seller approval, order override, product moderation, content management (banners, blog, about), category management, flash sale campaigns, coupons, accounting, inventory (all warehouses), payments, returns, reviews moderation, community moderation, logistics diagnostics, gamification config, settings, performance monitoring, analytics |

---

# 3. Pages

## Public Pages

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 1 | **Home** | `/` | Landing page with hero, categories, featured products, flash sale, banners | Public |
| 2 | **Shop** | `/shop` | Product browsing with filters, sorting, pagination | Public |
| 3 | **Categories** | `/categories` | Category listing page | Public |
| 4 | **Product Detail** | `/product/[slug]` | Product details with gallery, reviews, variants, size predictor, Q&A | Public |
| 5 | **Search** | `/search` | Search results with suggestions | Public |
| 6 | **Flash Sale** | `/flash-sale` | Active flash sale products with countdown | Public |
| 7 | **Cart** | `/cart` | Shopping cart with quantity management | Public (guest OK) |
| 8 | **Checkout** | `/checkout` | Multi-step checkout with payment selection | Auth required |
| 9 | **Order Success** | `/order-success` | Post-order confirmation | Auth required |
| 10 | **Compare** | `/compare` | Product comparison page | Public |
| 11 | **Seller Store** | `/store/[slug]` | Individual seller storefront | Public |
| 12 | **Referral Landing** | `/r/[code]` | Referral code landing page | Public |
| 13 | **About** | `/about` | Company about page | Public |
| 14 | **Contact** | `/contact` | Contact form | Public |
| 15 | **Blog** | `/blog` | Blog listing | Public |
| 16 | **Blog Post** | `/blog/[slug]` | Individual blog post | Public |
| 17 | **Help** | `/help` | Help center/FAQ | Public |
| 18 | **Privacy Policy** | `/privacy` | Privacy policy | Public |
| 19 | **Terms** | `/terms` | Terms of service | Public |
| 20 | **Returns** | `/returns` | Returns policy | Public |
| 21 | **Track Order** | `/track` | Order tracking page | Public |
| 22 | **Community** | `/community` | Community feed | Public |
| 23 | **Seller Profile** | `/seller-profile/[id]` | Public seller profile | Public |
| 24 | **Wishlist (content)** | `/wishlist` | Wishlist content page | Public |

## Auth Pages

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 25 | **Login** | `/login` | Email/password + OAuth login | Guest |
| 26 | **Register** | `/register` | Account creation with role selection | Guest |
| 27 | **Forgot Password** | `/forgot-password` | Password reset request | Guest |
| 28 | **Reset Password** | `/reset-password` | Password reset form | Token required |
| 29 | **OAuth Callback** | `/auth/callback` | Supabase OAuth callback handler | Guest |

## Customer Dashboard

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 30 | **Account Overview** | `/account` | Account dashboard | Customer |
| 31 | **Dashboard** | `/account/dashboard` | Customer dashboard | Customer |
| 32 | **Orders** | `/account/orders` | Order history | Customer |
| 33 | **Order Detail** | `/account/orders/[id]` | Single order detail | Customer |
| 34 | **Invoice** | `/account/orders/[id]/invoice` | Order invoice | Customer |
| 35 | **Wishlist** | `/account/wishlist` | Saved wishlist items | Customer |
| 36 | **Addresses** | `/account/addresses` | Address management | Customer |
| 37 | **Wallet** | `/account/wallet` | Wallet balance & transactions | Customer |
| 38 | **Rewards** | `/account/rewards` | Gamification rewards | Customer |
| 39 | **Notifications** | `/account/notifications` | Notification center | Customer |
| 40 | **Settings** | `/account/settings` | Profile settings | Customer |

## Seller Dashboard

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 41 | **Seller Home** | `/seller` | Seller entry redirect | Seller |
| 42 | **Dashboard** | `/seller/dashboard` | Seller dashboard with analytics | Seller |
| 43 | **Products** | `/seller/products` | Product management | Seller |
| 44 | **Add Product** | `/seller/products/add` | Create new product | Seller |
| 45 | **Edit Product** | `/seller/products/edit/[id]` | Edit product | Seller |
| 46 | **Bulk Upload** | `/seller/products/bulk` | Bulk product upload | Seller |
| 47 | **Orders** | `/seller/orders` | Order management | Seller |
| 48 | **Inventory** | `/seller/inventory` | Stock management | Seller |
| 49 | **Earnings** | `/seller/earnings` | Revenue & payouts | Seller |
| 50 | **Payouts** | `/seller/payouts` | Payout history | Seller |
| 51 | **Payout Locations** | `/seller/payout-locations` | Bank/mobile money accounts | Seller |
| 52 | **Pickup Locations** | `/seller/pickup-locations` | Warehouse/pickup points | Seller |
| 53 | **Marketing** | `/seller/marketing` | Marketing center | Seller |
| 54 | **Coupons** | `/seller/marketing/coupons` | Coupon management | Seller |
| 55 | **Promotions** | `/seller/marketing/promotions` | Promotional campaigns | Seller |
| 56 | **Ads** | `/seller/marketing/ads` | Advertising management | Seller |
| 57 | **Flash Sale** | `/seller/flash-sale` | Flash sale participation | Seller |
| 58 | **Manual Orders** | `/seller/manual-orders` | Create walk-in orders | Seller |
| 59 | **Courier** | `/seller/courier` | Courier management | Seller |
| 60 | **Reviews** | `/seller/support/reviews` | Review management | Seller |
| 61 | **Returns** | `/seller/support/returns` | Return handling | Seller |
| 62 | **Support Tickets** | `/seller/support/tickets` | Support ticket management | Seller |
| 63 | **Analytics - Performance** | `/seller/analytics/performance` | Sales performance | Seller |
| 64 | **Analytics - Reports** | `/seller/analytics/reports` | Detailed reports | Seller |
| 65 | **Notifications** | `/seller/notifications` | Notification center | Seller |
| 66 | **Settings** | `/seller/settings` | Store settings | Seller |
| 67 | **Notification Settings** | `/seller/settings/notifications` | Notification preferences | Seller |
| 68 | **Vacation Mode** | `/seller/settings/vacation` | Store vacation mode | Seller |
| 69 | **Onboarding** | `/seller/onboarding` | Seller onboarding wizard | Seller |

## Reseller Dashboard

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 70 | **Reseller Home** | `/reseller-dashboard` | Reseller entry | Reseller |
| 71 | **Overview** | `/reseller-dashboard/overview` | Overview dashboard | Reseller |
| 72 | **Catalog** | `/reseller-dashboard/catalog` | Reseller product catalog | Reseller |
| 73 | **Shop** | `/reseller-dashboard/shop` | Reseller storefront | Reseller |
| 74 | **Manual Orders** | `/reseller-dashboard/manual-orders` | Create orders | Reseller |
| 75 | **Earnings** | `/reseller-dashboard/earnings` | Commission tracking | Reseller |
| 76 | **Network** | `/reseller-dashboard/network` | Referral network | Reseller |
| 77 | **Promotions** | `/reseller-dashboard/promotions` | Promotional tools | Reseller |
| 78 | **Settings** | `/reseller-dashboard/settings` | Account settings | Reseller |
| 79 | **Onboarding** | `/reseller-dashboard/onboarding` | Onboarding wizard | Reseller |

## Admin Dashboard

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 80 | **Admin Home** | `/admin` | Admin entry redirect | Admin |
| 81 | **Dashboard** | `/admin/dashboard` | Platform analytics & health | Admin |
| 82 | **Users** | `/admin/users` | User management | Admin |
| 83 | **Sellers** | `/admin/sellers` | Seller management | Admin |
| 84 | **Products** | `/admin/products` | Product moderation | Admin |
| 85 | **Categories** | `/admin/categories` | Category management | Admin |
| 86 | **Orders** | `/admin/orders` | Order management | Admin |
| 87 | **Payments** | `/admin/payments` | Payment management | Admin |
| 88 | **Inventory** | `/admin/inventory` | Inventory management | Admin |
| 89 | **Logistics** | `/admin/logistics` | Logistics/diagnostics | Admin |
| 90 | **Returns** | `/admin/returns` | Return management | Admin |
| 91 | **Reviews** | `/admin/reviews` | Review moderation | Admin |
| 92 | **Banners** | `/admin/banners` | Banner management | Admin |
| 93 | **Blog** | `/admin/blog` | Blog management | Admin |
| 94 | **About Content** | `/admin/about` | About page content | Admin |
| 95 | **Coupons** | `/admin/coupons` | Coupon management | Admin |
| 96 | **Flash Sale** | `/admin/flash-sale` | Flash sale campaigns | Admin |
| 97 | **POS** | `/admin/pos` | Point of Sale terminal | Admin |
| 98 | **Accounting** | `/admin/accounting` | Financial accounting | Admin |
| 99 | **Performance** | `/admin/performance` | Web vitals monitoring | Admin |
| 100 | **Support** | `/admin/support` | Support management | Admin |
| 101 | **Community** | `/admin/community` | Community moderation | Admin |
| 102 | **Gamification** | `/admin/gamification` | Reward/spin/mission config | Admin |
| 103 | **Settings** | `/admin/settings` | Platform settings | Admin |

## Experimental / Bazaar Pages

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 104 | **Bazaar** | `/bazaar` | Bazaar landing | Public |
| 105 | **AI Gift Finder** | `/bazaar/aigiftfinder` | AI-powered gift recommendations | Public |
| 106 | **Affiliate Catalog** | `/bazaar/affiliate-catalog` | Affiliate product catalog | Public |
| 107 | **Live Concierge** | `/bazaar/liveconcierge` | Live shopping assistance | Public |
| 108 | **Loyalty Rewards** | `/bazaar/loyalty-rewards` | Loyalty program | Public |
| 109 | **Reseller Discovery** | `/bazaar/reseller-discovery` | Find resellers | Public |

## Immersive Pages

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 110 | **AR Try-On** | `/ar-tryon` | Augmented reality product try-on | Public |
| 111 | **3D Product Viewer** | `/product-3d` | 3D model viewer | Public |
| 112 | **3D Product Demo** | `/product/3d-demo/[productId]` | Per-product 3D demo | Public |
| 113 | **Room Visualizer** | `/room-visualizer` | Room visualization tool | Public |
| 114 | **Style Quiz** | `/style-quiz` | AI style quiz | Public |
| 115 | **Animations Demo** | `/animations` | UI animations showcase | Public |
| 116 | **AI Features** | `/ai-features` | AI features showcase | Public |
| 117 | **VIP** | `/vip` | VIP membership page | Public |
| 118 | **Reseller Landing** | `/reseller` | Reseller program landing | Public |
| 119 | **Explore** | `/explore` | Explore/discovery page | Public |
| 120 | **PWA Info** | `/pwa` | PWA install info | Public |

## Payment Callback Pages

| # | Page | URL | Purpose | Access |
|---|---|---|---|---|
| 121 | **bKash Success** | `/payment/bkash/success` | Payment success | Public |
| 122 | **bKash Cancel** | `/payment/bkash/cancel` | Payment cancelled | Public |
| 123 | **bKash Fail** | `/payment/bkash/fail` | Payment failed | Public |

---

# 4. Components

## Shared UI (`features/shared/ui/` + `components/ui/`)

| Component | Purpose |
|---|---|
| `AnimatedIcon` | Animated icon wrapper with hover effects |
| `DataSkeletons` | Table/card/list skeleton loaders |
| `FeedbackState` | Empty/error/success state displays |
| `OptimizedImage` | Lazy-loaded, responsive image component |
| `PageSkeleton` | Full page loading skeleton (dashboard variant) |
| `Skeleton` | Base skeleton primitive |
| `Tooltip` | Tooltip component |

## Layout Components

| Component | Purpose |
|---|---|
| `Layout` (Header) | Glass-morphism header with mega-menu, search, cart, account dropdown |
| `MobileBottomNav` | 5-tab responsive bottom navigation |
| `Footer` | 6-column footer with newsletter signup |
| `ScrollToTopButton` | Circular progress scroll-to-top |
| `DashboardLayout` | Multi-role dashboard with collapsible sidebar, mobile drawer, badge counts |
| `SellerDashboardShell` | Seller-specific dashboard shell |

## Shop Components

| Component | Purpose |
|---|---|
| `ProductCard` | Product display card with image, price, wishlist |
| `ProductQuickView` | Quick-view modal for products |
| `ProductLightbox` | Image lightbox/gallery for product images |
| `FrequentlyBoughtTogether` | Cross-sell product recommendations |
| `CartRecoveryTracker` | Abandoned cart detection and recovery |
| `ExitIntentOffer` | Exit-intent popup with discount offer |

## AI Components

| Component | Purpose |
|---|---|
| `AIRecommendation` | AI-powered product recommendation widget |
| `AIStylist` | AI fashion stylist assistant |
| `ChatBot` | AI chatbot for customer support |
| `SizePredictor` | AI size prediction for clothing |
| `VoiceCommerce` | Voice-enabled shopping |
| `VoiceSearch` | Voice search functionality |

## 3D/AR Components

| Component | Purpose |
|---|---|
| `ProductViewer3D` | Interactive 3D product model viewer |
| `RoomVisualizer` | AR room visualization |
| `ARTryOn` | Augmented reality try-on |
| `ModelLoader` | 3D model loading utility |
| `SceneSetup` | Three.js scene configuration |

## Analytics Components

| Component | Purpose |
|---|---|
| `SalesChart` | Revenue/sales trend chart (Recharts) |
| `ActivityHeatmap` | User activity heatmap visualization |
| `PerformanceMonitor` | Web Vitals performance monitoring |
| `MarketingAnalytics` | Marketing campaign analytics |

## Animation Components

| Component | Purpose |
|---|---|
| `LoadingAnimation` | Loading spinner/animation |
| `MicroInteraction` | Micro-interaction effects |
| `NotificationContainer` | Toast notification container |
| `PageTransition` | Page transition animations |
| `ScrollAnimation` | Scroll-triggered animations |
| `SiteMotionEnhancer` | Global motion enhancements |

## Seller Components

| Component | Purpose |
|---|---|
| `SalesPerformanceChart` | Seller sales performance chart |
| `SellerDashboardShell` | Complete seller dashboard shell |
| `SellerPageHeader` | Reusable seller page header |
| `StorefrontSettingsPanel` | Storefront customization panel |
| `TelegramConnectPanel` | Telegram bot connection UI |

## Other Components

| Component | Purpose |
|---|---|
| `AppProviders` | Root context provider tree |
| `AppChrome` | Top-level app chrome (header, footer, SW, analytics) |
| `AuthUI` | Authentication UI primitives |
| `CloudinaryUpload` | File upload to Cloudinary |
| `DemoPageLinks` | Demo navigation links |
| `OfflineIndicator` | Offline status indicator |
| `PWAInstallPrompt` | PWA install prompt |
| `PWAStatus` | PWA status display |
| `ProfileManager` | User profile management |
| `SocialShare` | Social media sharing buttons |
| `ManualOrderWorkspace` | Manual order creation workspace |

---

# 5. Features

## Authentication & Identity
- **Email/Password Auth** — Supabase email/password with bcrypt hashing
- **Google OAuth** — One-click Google sign-in via Supabase
- **Facebook OAuth** — Facebook login integration
- **JWT Tokens** — Access + refresh token pair with auto-rotation
- **Session Management** — Server-side session store with device/IP tracking
- **Password Reset** — Email-based password reset flow with token
- **Phone Verification** — OTP-based phone verification
- **2FA** — Two-factor authentication support (enabled in User model)
- **Role-Based Access** — 5 roles with route-level authorization
- **Brute-Force Protection** — Rate limiting + account lockout on failed attempts
- **Login Activity Audit** — IP, device, browser, timestamp logging

## Commerce
- **Product Catalog** — Full product CRUD with variants, SKUs, images, descriptions
- **Category Hierarchy** — 3-level category tree (Category → Subcategory → Subsubcategory)
- **Shopping Cart** — Persistent cart with context-based state management
- **Checkout** — Multi-step checkout with address selection, payment method choice
- **Order Management** — Order creation, status tracking, shipment management
- **Multi-Vendor** — Each seller manages their own products, orders, inventory
- **Manual Orders** — POS-style order creation for walk-in customers
- **Invoice Generation** — HTML invoices + raw PDF generation (no library dependency)
- **Product Search** — Full-text search with fuzzy matching (Levenshtein distance)
- **Product Comparison** — Side-by-side product comparison
- **Quick View** — Product quick-view modal
- **Recently Viewed** — User interaction tracking for recommendations
- **Product Reviews** — Star ratings + text reviews with moderation
- **Wishlist** — Save products for later with context persistence

## Payments
- **Stripe** — Credit/debit card payments with webhook processing
- **bKash** — Mobile financial service with initiate → execute → verify flow
- **SSLCommerz** — Bangladesh payment gateway
- **Payment Webhooks** — Generic webhook handler (`/api/v1/payments/webhooks/[provider]`)
- **Refund Management** — Full/partial refund tracking
- **Wallet System** — User wallet with credit/debit transactions

## Inventory & Logistics
- **Multi-Warehouse** — Warehouse management with per-warehouse stock levels
- **Inventory Tracking** — Stock movements, reservations, low-stock alerts
- **Purchase Orders** — Supplier purchase order workflow
- **Courier Integration** — Pathao, Steadfast, RedX (Bangladesh logistics)
- **Shipment Tracking** — Per-shipment status with courier provider tracking
- **Delivery Exceptions** — Failed delivery handling and return processing

## Gamification & Rewards
- **Coin System** — Earn coins for purchases, logins, referrals
- **Wallet** — Coin balance with transaction history
- **Spin the Wheel** — Daily spin with configurable rewards
- **Login Streaks** — Daily login streak rewards
- **Missions/Quests** — Gamified tasks with progress tracking
- **Referral Program** — Referral codes with click/conversion tracking
- **Reward Points** — Points earned through various activities

## Marketing & Promotions
- **Flash Sales** — Time-limited campaigns with seller submissions and admin review
- **Coupons** — Seller-level discount coupons with validation
- **Banners** — Homepage banner management
- **Exit-Intent Offers** — Popup offers on exit intent
- **Newsletter** — Email newsletter subscription
- **Social Sharing** — Product sharing to social platforms

## AI Features
- **AI Stylist** — Fashion recommendation assistant (Gemini)
- **AI ChatBot** — Customer support chatbot
- **Size Predictor** — AI-powered size recommendation
- **Voice Search** — Voice-enabled product search
- **Voice Commerce** — Voice-based shopping commands
- **AI Gift Finder** — Gift recommendation engine
- **AI Pricing Suggestions** — Dynamic pricing recommendations with confidence scores
- **Recommendation Engine** — Product recommendation analytics

## Immersive Experiences
- **3D Product Viewer** — Three.js-based 3D model rendering
- **AR Try-On** — Augmented reality product visualization
- **Room Visualizer** — Place products in real rooms via AR
- **Style Quiz** — AI-powered style preference quiz

## Community
- **Community Posts** — User-created posts with rich content
- **Comments** — Threaded comments on posts
- **Likes** — Post engagement tracking
- **Reports/Moderation** — Content reporting with admin moderation queue

## Reseller System
- **Reseller Catalog** — Browse and select products to resell
- **Markup Management** — Set per-product price markups
- **Commission Tracking** — Earnings from referred sales
- **Referral Network** — Build and manage referral tree
- **Payout Management** — Commission withdrawal and payout history
- **Storefront Settings** — Customize reseller storefront

## Content Management
- **Blog** — Blog post creation and management with SEO fields
- **About Page** — Dynamic about page content
- **Contact Form** — Contact message submission
- **Help Center** — Help/FAQ content
- **Privacy/Terms** — Legal pages

## Notifications
- **In-App Notifications** — UserNotification model with read/unread
- **Push Notifications** — Web Push API with VAPID keys
- **Email Notifications** — SMTP via Nodemailer + Resend
- **Telegram Notifications** — Bot notifications for sellers
- **Notification Preferences** — Per-user channel preferences

## PWA
- **Service Worker** — Offline caching with network-first strategy
- **Manifest** — Installable web app with dark theme
- **Offline Page** — Custom offline fallback
- **Install Prompt** — PWA install prompt component

## Monitoring & Analytics
- **Web Vitals** — Real-time performance monitoring (LCP, CLS, INP, FCP)
- **Performance Alerts** — Critical/warning thresholds with alerts
- **Route-Level Metrics** — Per-route performance tracking
- **Audit Logs** — Action audit trail
- **Error Tracking** — Centralized error monitoring

## Accounting
- **Double-Entry Ledger** — LedgerAccount, JournalEntry, JournalLine
- **Invoicing** — Invoice generation linked to orders
- **Expense Tracking** — Business expense recording

## Security
- **Field Encryption** — Sensitive field encryption service
- **CSRF Protection** — CSRF token issuance
- **Rate Limiting** — Sliding window rate limiter
- **CORS** — Configurable CORS protection
- **Role Guards** — Server-side role authorization middleware

## Platform
- **Multi-Tenant** — Tenant isolation with membership and settings
- **Seller Approval** — Draft → Submitted → Approved/Rejected workflow
- **Vacation Mode** — Seller store vacation mode
- **Dark Mode** — CSS custom properties for theming (oklch colors)
- **Responsive Design** — Mobile-first with tablet/desktop breakpoints
- **Telegram Bot** — Seller notification and invoice bot

---

# 6. Admin Panel

## Pages & Features

| Page | Key Features |
|---|---|
| **Dashboard** | Stats cards (users, sellers, orders, revenue), sales chart, activity heatmap, operations health, low stock watchlist, performance vitals, slow route watchlist, seller/reseller readiness |
| **Users** | User listing with role filters, search, blocking, role assignment |
| **Sellers** | Seller listing with approval status, verification status, identity checks |
| **Products** | Product moderation, listing, search, edit |
| **Categories** | Category CRUD with hierarchy management |
| **Orders** | Order listing with status tabs (All/Active/Exceptions/History), status updates, CSV export, shipment tracking, search |
| **Payments** | Payment transaction overview, refund management |
| **Inventory** | Warehouse management, stock levels, inventory movements |
| **Logistics** | Courier diagnostics, provider status |
| **Returns** | Return request management |
| **Reviews** | Review moderation queue |
| **Banners** | Homepage banner CRUD |
| **Blog** | Blog post management |
| **About Content** | About page content management |
| **Coupons** | Platform-wide coupon management |
| **Flash Sale** | Flash sale campaign creation, seller entry review |
| **POS** | Point-of-sale terminal for walk-in orders |
| **Accounting** | Ledger management, journal entries, invoicing, expenses |
| **Performance** | Web Vitals dashboard, route metrics, alerts |
| **Support** | Support ticket management |
| **Community** | Community post moderation |
| **Gamification** | Spin wheel config, missions, rewards, referral settings |
| **Settings** | Platform-wide settings |

---

# 7. Seller Panel

## Features

| Feature | Description |
|---|---|
| **Dashboard** | Sales stats, orders overview, quick actions, AI insights |
| **Products** | Full CRUD, image upload (Cloudinary), variants, SKUs |
| **Bulk Upload** | CSV/bulk product import |
| **Orders** | Order listing, status updates, shipment creation |
| **Inventory** | Stock level management per warehouse |
| **Manual Orders** | POS-style order creation for walk-ins |
| **Earnings** | Revenue tracking, pending/settled balances |
| **Payouts** | Payout history, bank/mobile money accounts |
| **Pickup Locations** | Warehouse/pickup point configuration |
| **Marketing** | Coupons, promotions, ads management |
| **Flash Sale** | Flash sale participation and submission |
| **Courier** | Courier provider management, shipment tracking |
| **Reviews** | Review response and management |
| **Returns** | Return request handling |
| **Support Tickets** | Submit and track support tickets |
| **Analytics** | Performance metrics, detailed reports |
| **Notifications** | Notification center with preferences |
| **Settings** | Store settings, vacation mode, Telegram connect |
| **Onboarding** | Step-by-step seller setup wizard |

---

# 8. Customer Dashboard

## Features

| Feature | Description |
|---|---|
| **Dashboard** | Order summary, recent activity, rewards overview |
| **Orders** | Order history with status tracking |
| **Order Detail** | Detailed order view with items, tracking, invoice |
| **Invoice** | Download/view order invoice |
| **Wishlist** | Saved products list |
| **Addresses** | Shipping address CRUD |
| **Wallet** | Wallet balance, top-up, transaction history |
| **Rewards** | Points balance, missions, spin wheel, referral codes |
| **Notifications** | In-app notification center |
| **Settings** | Profile update, password change, preferences |

---

# 9. API Endpoints

## Public API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/home` | No | Home page data |
| GET | `/api/products` | No | Product listing (paginated) |
| GET | `/api/products/[id]` | No | Product detail |
| GET | `/api/products/suggestions` | No | Product suggestions |
| GET | `/api/products/[id]/reviews` | No | Product reviews |
| GET | `/api/categories/tree` | No | Category tree |
| GET | `/api/shop-page` | No | Shop page data |
| GET | `/api/search/products` | No | Product search |
| GET | `/api/search/discovery` | No | Discovery search |
| GET | `/api/flash-sale/active` | No | Active flash sales |
| GET | `/api/config/public` | No | Public config |
| GET | `/api/public/about-page` | No | About page content |
| GET | `/api/public/commerce-config` | No | Commerce configuration |
| GET | `/api/logistics/providers` | No | Available logistics providers |
| GET | `/api/health` | No | Health check (DB, Redis, queues) |
| POST | `/api/newsletter` | No | Newsletter subscription |
| POST | `/api/analytics/web-vitals` | No | Web Vitals ingestion |

## Auth API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/refresh` | Refresh token | Token refresh |
| POST | `/api/auth/supabase/exchange` | Supabase JWT | OAuth token exchange |
| POST | `/api/auth/supabase/register` | No | Supabase registration |

## User API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/users/profile` | Bearer | Get user profile |
| GET/PUT | `/api/v2/profile` | Bearer | Profile CRUD |
| GET/PUT | `/api/addresses` | Bearer | Address management |
| GET/POST | `/api/wishlist` | Bearer | Wishlist management |
| DELETE | `/api/wishlist/[productId]` | Bearer | Remove wishlist item |
| GET | `/api/user/wallet` | Bearer | Wallet balance |
| GET | `/api/user/points` | Bearer | Reward points |
| GET | `/api/user/engagement/overview` | Bearer | Engagement summary |
| GET/POST | `/api/notifications` | Bearer | Notification management |
| PUT | `/api/notifications/read-all` | Bearer | Mark all read |
| POST | `/api/notifications/subscribe` | Bearer | Push subscription |
| POST | `/api/notifications/unsubscribe` | Bearer | Unsubscribe push |
| PUT | `/api/notifications/[id]/read` | Bearer | Mark notification read |

## Cart API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/cart` | Bearer | Get cart |
| PUT | `/api/cart` | Bearer | Update cart |
| POST | `/api/v2/cart` | Bearer | Add to cart |
| DELETE | `/api/v2/cart/[id]` | Bearer | Remove from cart |
| POST | `/api/cart/recovery/schedule` | Bearer | Schedule cart recovery |
| DELETE | `/api/cart/recovery/cancel` | Bearer | Cancel cart recovery |

## Order API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/orders` | Bearer | Order listing |
| POST | `/api/orders/create` | Bearer | Create order |
| GET | `/api/orders/my-orders` | Bearer | My orders |
| GET | `/api/orders/[id]` | Bearer | Order detail |
| GET | `/api/orders/[id]/invoice` | Bearer | Order invoice |
| GET | `/api/orders/[id]/invoice.pdf` | Bearer | PDF invoice |
| GET/POST | `/api/v2/orders` | Bearer | V2 order CRUD |
| GET/PUT | `/api/v2/orders/[id]` | Bearer | V2 order detail |

## Payment API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/payments/bkash/initiate` | Bearer | Initiate bKash payment |
| POST | `/api/payments/bkash/execute` | Bearer | Execute bKash payment |
| POST | `/api/payments/bkash/verify` | Bearer | Verify bKash payment |
| POST | `/api/payments/bkash/callback` | bKash webhook | bKash callback |
| POST | `/api/payments/bkash/webhook` | bKash webhook | bKash webhook |
| POST | `/api/payments/stripe/webhook` | Stripe webhook | Stripe webhook |
| POST | `/api/v1/payments/webhooks/[provider]` | Provider auth | Generic webhook |
| POST | `/api/shipping/preview` | Bearer | Shipping cost preview |
| POST | `/api/coupons/validate` | Bearer | Coupon validation |
| POST | `/api/v2/coupons/validate` | Bearer | V2 coupon validation |

## Admin API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/stats` | Admin | Platform statistics |
| GET | `/api/admin/dashboard-insights` | Admin | Dashboard insights |
| GET | `/api/admin/operations-summary` | Admin | Operations summary |
| GET | `/api/admin/performance/web-vitals` | Admin | Performance metrics |
| GET | `/api/admin/integrations/status` | Admin | Integration health |
| GET | `/api/admin/logistics/diagnostics` | Admin | Logistics diagnostics |
| GET/PUT | `/api/admin/settings` | Admin | Platform settings |
| GET/PUT | `/api/admin/content/about` | Admin | About content |
| GET/POST | `/api/admin/banners` | Admin | Banner CRUD |
| PUT/DELETE | `/api/admin/banners/[id]` | Admin | Banner update/delete |
| GET | `/api/v2/admin/inventory/warehouses` | Admin | Warehouse management |

## Seller API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/seller/products` | Seller | Seller products |
| POST | `/api/seller/products` | Seller | Create product |
| PUT/DELETE | `/api/seller/products/[id]` | Seller | Update/delete product |
| GET | `/api/seller/orders` | Seller | Seller orders |
| GET | `/api/seller/stats` | Seller | Seller statistics |
| GET | `/api/seller/dashboard-insights` | Seller | Dashboard insights |
| GET | `/api/seller/coupons` | Seller | Seller coupons |
| GET | `/api/seller/inventory-alerts` | Seller | Low stock alerts |
| GET/POST | `/api/seller/flash-sale` | Seller | Flash sale management |
| POST | `/api/seller/flash-sale/entries` | Seller | Flash sale entries |
| GET/POST | `/api/seller/manual-orders` | Seller | Manual order management |
| GET | `/api/seller/manual-orders/catalog` | Seller | Manual order catalog |
| GET | `/api/seller/onboarding-status` | Seller | Onboarding status |
| GET | `/api/seller/telegram/status` | Seller | Telegram bot status |
| POST | `/api/seller/telegram/test` | Seller | Test Telegram |

## V2 API (Paginated + Zod Validated)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET/POST | `/api/v2/products` | Varied | Product CRUD |
| GET/PUT | `/api/v2/products/[id]` | Varied | Product detail |
| GET/POST | `/api/v2/reviews` | Bearer | Reviews |
| GET/PUT | `/api/v2/reviews/[id]` | Bearer | Review detail |
| GET/POST | `/api/v2/addresses` | Bearer | Addresses |
| GET/PUT/DELETE | `/api/v2/addresses/[id]` | Bearer | Address detail |
| GET | `/api/v2/search` | No | V2 search |
| GET | `/api/v2/categories` | No | V2 categories |
| GET | `/api/v2/banners` | No | V2 banners |
| GET | `/api/v2/inventory` | Seller | V2 inventory |
| GET | `/api/v2/seller/inventory-alerts` | Seller | V2 alerts |

---

# 10. Database

## 72 Models (PostgreSQL via Prisma)

### Core Models

| Model | Key Fields | Relationships |
|---|---|---|
| **User** | id, email, name, phone, role, password_hash, avatar_url, wallet_balance, coins, is_blocked, 2fa_enabled | Has many: orders, products, addresses, reviews, sessions |
| **Product** | id, name, slug, description, price, compare_at_price, sku, images, seller_id, category_id, stock_quantity, rating | Belongs to: User(seller), Category. Has many: order_items, reviews, inventory_items |
| **Order** | id, order_code, user_id, total, status, payment_method, shipping_address_id | Belongs to: User. Has many: order_items, shipments |
| **OrderItem** | id, order_id, product_id, quantity, unit_price, seller_id | Belongs to: Order, Product |
| **Category** | id, name, slug | Has many: subcategories, products |
| **Subcategory** | id, name, slug, category_id | Belongs to: Category. Has many: subsubcategories |
| **Subsubcategory** | id, name, slug, subcategory_id | Belongs to: Subcategory |

### Multi-Tenant

| Model | Purpose |
|---|---|
| **Tenant** | Tenant isolation (slug-based) |
| **Store** | Storefronts under a tenant |
| **TenantMembership** | User-tenant role mapping |
| **TenantSetting** | Per-tenant config (currency, rewards, spin, referral) |

### Inventory & Logistics

| Model | Purpose |
|---|---|
| **Warehouse** | Warehouses with Pathao shipping integration |
| **InventoryItem** | Per-product-per-warehouse stock levels |
| **InventoryMovement** | Stock movement audit trail |
| **StockReservation** | Reserved stock for pending orders |
| **PurchaseOrder** | Supplier purchase orders |
| **PurchaseOrderLine** | Line items on purchase orders |
| **OrderShipment** | Per-seller shipment tracking |
| **OrderShipmentItem** | Items within a shipment |

### Payments

| Model | Purpose |
|---|---|
| **PaymentTransaction** | Payment gateway transactions |
| **Refund** | Refunds against transactions |
| **Invoice** | Invoices linked to orders |
| **LedgerAccount** | Double-entry accounting accounts |
| **JournalEntry** | Accounting journal entries |
| **JournalLine** | Debit/credit lines |
| **Expense** | Business expense tracking |

### Engagement

| Model | Purpose |
|---|---|
| **Review** | Product reviews/ratings |
| **WishlistItem** | User wishlists |
| **Address** | Shipping/billing addresses |
| **Coupon** | Seller-level discount coupons |
| **FlashSaleCampaign** | Flash sale campaigns |
| **FlashSaleEntry** | Product entries in flash sales |
| **UserNotification** | In-app notifications |
| **NotificationPreference** | Per-user notification channel preferences |
| **PushSubscription** | Web push notification subscriptions |

### Community

| Model | Purpose |
|---|---|
| **CommunityPost** | Community forum posts |
| **CommunityPostComment** | Comments on posts |
| **CommunityPostLike** | Likes on posts |
| **CommunityPostReport** | Reports/flags on posts |

### Gamification

| Model | Purpose |
|---|---|
| **WalletTransaction** | Wallet credit/debit history |
| **RewardLog** | Gamification reward audit |
| **ReferralCode** | Referral codes with tracking |
| **ReferralAttribution** | Referral-to-order attribution |
| **LoginStreak** | Daily login streak tracking |
| **SpinReward** | Spin-the-wheel rewards |
| **SpinHistory** | Spin history |
| **Mission** | Gamification missions |
| **MissionProgress** | Per-user mission progress |

### Reseller

| Model | Purpose |
|---|---|
| **ResellerMarkup** | Per-reseller-per-product markups |
| **ResellerCommission** | Commission tracking |
| **ResellerReferral** | Referral links |
| **ResellerPayout** | Payout records |

### AI & Analytics

| Model | Purpose |
|---|---|
| **UserInteraction** | Product interaction tracking |
| **RecommendationAnalytic** | Recommendation engine analytics |
| **PriceHistory** | Historical price + competitor data |
| **PricingSuggestion** | AI pricing suggestions |

### Security & Verification

| Model | Purpose |
|---|---|
| **Session** | User sessions with device tracking |
| **PasswordResetToken** | Password reset tokens |
| **EmailVerificationToken** | Email verification tokens |
| **PhoneVerificationToken** | Phone OTP tokens |
| **AuditLog** | Action audit trail |
| **LoginActivity** | Login audit trail |
| **VerificationSubmission** | Seller identity verification |
| **VerificationDocument** | Verification documents |
| **UserRiskFlag** | Fraud/risk flags |
| **AccountActionRequest** | Account deletion/recovery |
| **PayoutMethod** | Seller payout methods (encrypted) |
| **PayoutTransaction** | Payout history |

### CMS & Config

| Model | Purpose |
|---|---|
| **BlogPost** | Blog posts with SEO |
| **ContactMessage** | Contact form submissions |
| **Banner** | Homepage banners |
| **PlatformSetting** | Global platform settings |

---

# 11. User Flow

## Guest → Customer

```
1. Browse products (Home → Shop → Product Detail)
2. Add to cart (local cart persists)
3. Click Checkout → Redirect to /login
4. Register (email/password or Google/Facebook OAuth)
5. Role selection: Customer / Seller / Reseller
6. Email verification
7. Complete profile (name, phone)
8. Add shipping address
9. Return to checkout
10. Select payment method (Stripe/bKash/COD)
11. Place order
12. Order confirmation page
13. Track order via /track or /account/orders
14. Receive delivery
15. Leave review/rating
16. Earn coins → Wallet → Spin wheel → Missions
```

## Seller Flow

```
1. Register as seller
2. Complete onboarding wizard:
   a. Identity verification (upload documents)
   b. Set pickup locations (warehouses)
   c. Link courier provider
   d. Set payout method
   e. Create store identity
3. Admin reviews and approves
4. Add products (single or bulk upload)
5. Receive orders
6. Process orders (pack → request pickup)
7. Courier picks up → tracking
8. Delivery → payment settlement
9. View earnings → request payout
```

## Admin Flow

```
1. Login as admin
2. Review dashboard (stats, alerts, health)
3. Review seller/reseller readiness
4. Approve/reject seller applications
5. Manage orders (status updates, exceptions)
6. Moderate content (reviews, community)
7. Manage flash sales and campaigns
8. Monitor performance vitals
9. Handle accounting and payouts
```

---

# 12. UI Analysis

## Typography
- **Primary Font:** Inter (400, 600, 700) — body text
- **Display Font:** Poppins (600, 700) — headings
- **Scale:** Text sizes from `text-[10px]` to `text-2xl` with `font-bold` emphasis
- **Tracking:** Extensive use of `tracking-wider`, `tracking-[0.22em]`, `tracking-tight`

## Colors
- **Primary:** Configurable via CSS custom properties (oklch)
- **Theme:** Dark theme base (`#1f2937`), light content areas
- **Grays:** Slate scale (50-950) for text and backgrounds
- **Accents:** Emerald (success), Amber (warning), Rose (error), Indigo (info)
- **Glass-morphism:** `rgba(255,255,255,0.99)` backgrounds with blur

## Spacing
- **Consistent padding:** `p-3` to `p-6` for cards
- **Gaps:** `gap-4` to `gap-8` for grids
- **Border radius:** `rounded-xl` to `rounded-[2rem]` (generous rounding)
- **Shadows:** Subtle `shadow-sm` with `border-black/5` borders

## Buttons
- Primary buttons with `bg-primary text-white`
- Secondary with `border border-gray-200 bg-white`
- Icon buttons with `mobile-action-chip` pattern
- Loading states with `animate-spin` Loader2 icon

## Cards
- White backgrounds with `border-black/5` borders
- Rounded corners (`rounded-2xl`)
- Hover effects with `hover:-translate-y-0.5 hover:shadow-sm`
- Glass-morphism for sidebar/header

## Icons
- **Library:** Lucide React (0.546)
- **Consistent sizing:** `size={14-20}` for inline, `size={16-20}` for buttons

## Accessibility
- ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader friendly with semantic HTML
- Focus rings on form elements

## Responsiveness
- Mobile-first design with `lg:` breakpoint for desktop
- Mobile bottom navigation
- Sidebar collapse/expand on mobile
- Responsive grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Hidden elements: `hidden lg:block` / `lg:hidden`

---

# 13. Performance

## Strengths
- **Dynamic imports** for heavy components (SalesChart, ActivityHeatmap, 3D/AR)
- **Image optimization** via Cloudinary + Next.js Image
- **Package import optimization** (lucide-react, recharts, three)
- **Service worker** caching for offline support
- **Redis caching** with configurable TTL
- **Database connection pooling** via Supabase pooler
- **Lazy loading** for chatbot, PWA components

## Potential Issues
- **No test files found** — zero test coverage
- **server.ts is 16,828 lines** — monolithic server file
- **No ESLint configured** — only TypeScript type checking
- **No middleware.ts** — no edge-level auth/routing
- **Duplicate component patterns** — components exist in both `src/components/` and `features/*/components/`
- **Large bundle risk** — Three.js, Framer Motion, Recharts all in dependencies
- **No code splitting** for admin/seller bundles (loaded on demand via dynamic routes)

---

# 14. Security

## Strengths
- JWT with refresh token rotation
- Server-side role authorization
- CSRF token protection
- Rate limiting (sliding window)
- Brute-force lockout
- Field encryption for sensitive data
- Audit logging

## Potential Issues
- **No middleware.ts** — auth checks happen in each API route, not at edge
- **In-memory session store** — not distributed, lost on restart
- **In-memory rate limiter** — not distributed across instances
- **No CSP headers** configured
- **`.env` contains real secrets** — should be rotated and protected
- **No input sanitization** visible in some routes
- **PDF generation without library** — potential injection risks

---

# 15. Missing Features

| Priority | Feature | Reason |
|---|---|---|
| High | **Unit Tests** | Zero test coverage across entire codebase |
| High | **E2E Tests** | Playwright configured but no test files |
| High | **ESLint Config** | No linting beyond TypeScript |
| High | **Middleware** | No edge-level auth/routing |
| Medium | **i18n/Localization** | Bangladesh-focused, no multi-language |
| Medium | **Multi-Currency** | Currency formatting exists but limited to BDT |
| Medium | **Email Templates** | No HTML email templates found |
| Medium | **Admin Roles** | Single admin role, no sub-admin permissions |
| Medium | **API Versioning** | Mix of v1/v2 with no clear migration path |
| Low | **GraphQL** | REST only, no GraphQL layer |
| Low | **A/B Testing** | No A/B testing infrastructure |
| Low | **SEO Schema** | Limited structured data (only Organization + WebSite) |

---

# 16. Possible Bugs

| # | Issue | Location |
|---|---|---|
| 1 | **In-memory sessions lost on restart** | `server.ts` session store |
| 2 | **Rate limiter not distributed** | `server.ts` sliding window |
| 3 | **No CSRF on state-changing GET** | API routes |
| 4 | **PDF generation without library** | `server.ts` invoice generation |
| 5 | **Cart context not synced with server** | Client cart vs server cart |
| 6 | **Service worker cache version hardcoded** | `public/sw.js` |
| 7 | **No error boundaries** in some pages | Missing React error boundaries |
| 8 | **Race conditions in optimistic UI** | Order status updates |
| 9 | **Missing loading states** on some mutations | Form submissions |
| 10 | **Token refresh race condition** | Multiple concurrent requests during refresh |

---

# 17. Improvements

## UI Improvements
- Add skeleton loading for all data-fetching pages
- Consistent empty state designs across all lists
- Add keyboard shortcuts for admin power users
- Improve mobile touch targets (min 44px)
- Add drag-and-drop for product image reordering
- Toast notification positioning optimization

## UX Improvements
- Add optimistic UI updates for cart/wishlist actions
- Implement search autocomplete with recent searches
- Add product image zoom on hover (desktop)
- Streamline checkout to fewer steps
- Add guest checkout option
- Improve form validation feedback timing

## Performance Improvements
- Implement React Server Components where possible
- Add database query optimization (indexes, N+1 fixes)
- Implement virtual scrolling for large lists
- Add image CDN caching headers
- Bundle analysis and tree-shaking optimization
- Implement ISR for product pages

## Business Improvements
- Add subscription/recurring order support
- Implement marketplace analytics dashboard
- Add seller performance scoring
- Implement dynamic pricing rules
- Add multi-language support (Bengali + English)
- Add live chat between buyer and seller

---

# 18. Complete Sitemap

```
/ (Home)
├── /shop
│   └── /product/[slug]
├── /categories
├── /search
├── /flash-sale
├── /cart
├── /checkout
├── /order-success
├── /compare
├── /store/[slug]
├── /r/[code] (referral)
│
├── /login
├── /register
├── /forgot-password
├── /reset-password
├── /auth/callback
│
├── /account
│   ├── /account/dashboard
│   ├── /account/orders
│   │   └── /account/orders/[id]
│   │       └── /account/orders/[id]/invoice
│   ├── /account/wishlist
│   ├── /account/addresses
│   ├── /account/wallet
│   ├── /account/rewards
│   ├── /account/notifications
│   └── /account/settings
│
├── /seller
│   ├── /seller/dashboard
│   ├── /seller/products
│   │   ├── /seller/products/add
│   │   ├── /seller/products/bulk
│   │   └── /seller/products/edit/[id]
│   ├── /seller/orders
│   ├── /seller/inventory
│   ├── /seller/earnings
│   ├── /seller/payouts
│   ├── /seller/payout-locations
│   ├── /seller/pickup-locations
│   ├── /seller/marketing
│   │   ├── /seller/marketing/coupons
│   │   ├── /seller/marketing/promotions
│   │   └── /seller/marketing/ads
│   ├── /seller/flash-sale
│   ├── /seller/manual-orders
│   ├── /seller/courier
│   ├── /seller/support
│   │   ├── /seller/support/reviews
│   │   ├── /seller/support/returns
│   │   └── /seller/support/tickets
│   ├── /seller/analytics/performance
│   ├── /seller/analytics/reports
│   ├── /seller/notifications
│   ├── /seller/settings
│   │   ├── /seller/settings/notifications
│   │   └── /seller/settings/vacation
│   └── /seller/onboarding
│
├── /reseller-dashboard
│   ├── /reseller-dashboard/overview
│   ├── /reseller-dashboard/catalog
│   ├── /reseller-dashboard/shop
│   ├── /reseller-dashboard/manual-orders
│   ├── /reseller-dashboard/earnings
│   ├── /reseller-dashboard/network
│   ├── /reseller-dashboard/promotions
│   ├── /reseller-dashboard/settings
│   └── /reseller-dashboard/onboarding
│
├── /admin
│   ├── /admin/dashboard
│   ├── /admin/users
│   ├── /admin/sellers
│   ├── /admin/products
│   ├── /admin/categories
│   ├── /admin/orders
│   ├── /admin/payments
│   ├── /admin/inventory
│   ├── /admin/logistics
│   ├── /admin/returns
│   ├── /admin/reviews
│   ├── /admin/banners
│   ├── /admin/blog
│   ├── /admin/about
│   ├── /admin/coupons
│   ├── /admin/flash-sale
│   ├── /admin/pos
│   ├── /admin/accounting
│   ├── /admin/performance
│   ├── /admin/support
│   ├── /admin/community
│   ├── /admin/gamification
│   └── /admin/settings
│
├── /about
├── /contact
├── /blog
│   └── /blog/[slug]
├── /help
├── /privacy
├── /terms
├── /returns
├── /track
├── /community
├── /seller-profile/[id]
├── /wishlist
│
├── /bazaar
│   ├── /bazaar/aigiftfinder
│   ├── /bazaar/affiliate-catalog
│   ├── /bazaar/liveconcierge
│   ├── /bazaar/loyalty-rewards
│   └── /bazaar/reseller-discovery
│
├── /ar-tryon
├── /product-3d
├── /product/3d-demo/[productId]
├── /room-visualizer
├── /style-quiz
├── /animations
├── /ai-features
├── /vip
├── /reseller
├── /explore
├── /pwa
│
└── /payment/bkash
    ├── /payment/bkash/success
    ├── /payment/bkash/cancel
    └── /payment/bkash/fail
```

---

# 19. Project Statistics

| Metric | Count |
|---|---|
| **Total Pages (routes)** | 123 |
| **API Route Handlers** | 97 |
| **Feature Modules** | 14 |
| **Screens** | 98 |
| **Reusable Components** | 49 |
| **Shared Components (features/shared)** | 33 |
| **Custom Hooks** | 12 |
| **Context Providers** | 5 (User, Cart, Wishlist, Compare, Inventory) |
| **Database Models** | 72 |
| **BullMQ Queues** | 9 |
| **Payment Gateways** | 3 (Stripe, bKash, SSLCommerz) |
| **Courier Providers** | 3 (Pathao, Steadfast, RedX) |
| **User Roles** | 5 (Guest, Customer, Seller, Reseller, Admin) |
| **Route Groups** | 9 |
| **Dynamic Routes** | 11+ |
| **Loading States** | 10 |
| **Layout Files** | 5 |
| **Utility Files** | 21 |
| **Service Files** | 43 |
| **Total Source Files** | ~600+ |

---

# 20. Final Report

## Strengths

1. **Comprehensive Feature Set** — Multi-vendor marketplace with POS, reseller network, gamification, AI, 3D/AR, and delivery logistics in a single codebase
2. **Modern Tech Stack** — Next.js 15, React 19, Tailwind v4, Prisma 6.19, TypeScript 5.8
3. **Feature-Based Architecture** — Well-organized `features/` directory with clear module boundaries
4. **Multi-Payment Support** — Stripe + bKash + SSLCommerz covering international and local payment methods
5. **Multi-Courier Integration** — Pathao, Steadfast, RedX with unified adapter pattern
6. **Real-Time Features** — WebSocket server, BullMQ workers, web push notifications
7. **PWA Support** — Service worker, manifest, offline page
8. **AI Integration** — Gemini-powered stylist, chatbot, size predictor, voice commerce
9. **Gamification** — Coins, wallet, spin wheel, missions, login streaks, referrals
10. **Accounting** — Double-entry ledger with journal entries and invoicing

## Weaknesses

1. **Zero Test Coverage** — No unit tests, no E2E tests despite Vitest + Playwright configured
2. **Monolithic Server** — `server.ts` at 16,828 lines handles everything
3. **No ESLint** — Only TypeScript type checking, no code quality enforcement
4. **No Edge Middleware** — Auth/role checks repeated in each API route
5. **In-Memory State** — Sessions, rate limiter not distributed (breaks with multiple instances)
6. **Duplicate Components** — Files exist in both `src/components/` and `features/*/components/`
7. **No Error Boundaries** — Missing React error boundaries in many pages
8. **Bangladesh-Only** — Hardcoded BDT currency, BD-specific address fields
9. **No Internationalization** — Single language (English)
10. **Secrets in .env** — Real API keys committed (should be rotated)

## Missing Features

| Priority | Feature |
|---|---|
| Critical | Test suite (unit + E2E) |
| Critical | ESLint + Prettier configuration |
| High | Edge middleware for auth/routing |
| High | Distributed session store (Redis) |
| High | Distributed rate limiter (Redis) |
| High | Email templates (HTML) |
| Medium | Sub-admin roles and permissions |
| Medium | API documentation (OpenAPI/Swagger) |
| Medium | Multi-language support |
| Medium | Dynamic sitemap generation |
| Low | GraphQL API layer |
| Low | A/B testing infrastructure |

## Priority Improvements

1. **Add test infrastructure** — Configure Vitest with 1 critical-path test, Playwright with 1 e2e test
2. **Add ESLint + Prettier** — Enforce code quality
3. **Extract middleware** — Move auth/role checks to Next.js middleware
4. **Split server.ts** — Extract route handlers, middleware, services into separate modules
5. **Add error boundaries** — Wrap each route group in React error boundaries
6. **Move to Redis sessions** — Replace in-memory store
7. **Add API docs** — OpenAPI specification for all endpoints

## Estimated Completion Percentage

**82%** — The platform has an impressive breadth of features covering most e-commerce needs. The core commerce loop, multi-vendor system, payments, logistics, and advanced features (AI, gamification, 3D/AR) are implemented. What's missing is production hardening: tests, linting, middleware, distributed state, documentation, and edge case handling.

## Overall Quality Score

**72/100**

| Category | Score | Notes |
|---|---|---|
| **Architecture** | 75/100 | Good feature-based structure, but monolithic server |
| **Code Quality** | 65/100 | No linting, no tests, some duplication |
| **Features** | 90/100 | Exceptionally comprehensive |
| **UI/UX** | 78/100 | Modern design, responsive, but some inconsistencies |
| **Security** | 70/100 | JWT + role guards, but no middleware, in-memory state |
| **Performance** | 72/100 | Dynamic imports + caching, but large bundle risk |
| **Documentation** | 30/100 | Minimal — no API docs, no README depth |
| **Testing** | 5/100 | Framework configured, zero tests written |
| **DevOps** | 65/100 | Build scripts exist, no CI/CD visible |
| **Scalability** | 60/100 | In-memory components limit horizontal scaling |
