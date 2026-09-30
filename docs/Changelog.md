# Changelog

## Executive Summary

This changelog tracks all significant changes to the LofiMart platform across versions. Follows [Keep a Changelog](https://keepachangelog.com/) format.

---

## [Unreleased]

### Added
- Accounting module with double-entry bookkeeping
- POS (Point of Sale) system for admin
- Web Vitals performance monitoring dashboard
- Performance alerting system
- Seller identity verification workflow
- User risk flagging system
- Payout transaction management
- Expense tracking
- Invoice PDF generation
- Visual search (image-based product matching)
- AI pricing optimization with demand forecasting
- Room visualizer for AR features
- 3D product demo pages
- Micro-interaction animations
- Page transition animations
- Scroll animations
- Site motion enhancer
- PWA offline indicator
- PWA install prompt
- Push notification hooks
- Exit intent offer component
- Cart recovery tracker
- Frequently bought together component
- Product lightbox component
- Product quick view component
- Social share component
- Data skeleton components
- Feedback state component
- Optimized image component
- Animated icon component
- Tooltip component

### Changed
- Migrated to Next.js App Router from Pages Router
- Upgraded to Prisma with tenant-scoped middleware
- Enhanced session management with role-based TTLs
- Improved rate limiting with Redis backend
- Updated bKash integration to tokenized checkout
- Refactored courier adapters to provider registry pattern
- Enhanced seller dashboard with AI-powered intelligence
- Improved error handling with structured responses

### Fixed
- Race condition in stock reservation
- Token refresh race condition
- Session expiry handling
- CORS origin validation edge cases
- bKash callback handling for expired payments
- Courier webhook status normalization

---

## [3.0.0] - 2026-06-01

### Added
- AI chatbot powered by Google Gemini
- AI product recommendations (4 types)
- AI stylist feature
- Size predictor feature
- Voice commerce and voice search
- Visual search capability
- AR try-on feature
- 3D product viewer
- Room visualizer
- Flash sale campaigns with seller submissions
- Community posts with moderation
- Gamification system (login streaks, spin wheel, missions)
- Referral system with attribution tracking
- Telegram bot for seller notifications
- Courier integration (Pathao, through a provider-agnostic registry)
- Reseller network with markup management
- Custom domain support for seller storefronts
- Bulk product upload
- Manual order creation
- Inventory management with multi-warehouse
- Purchase order system
- Supplier management
- Coupon system per seller
- Wishlist and compare features
- Blog system with SEO
- Contact form
- Newsletter subscription
- Order tracking page
- Style quiz
- Bazaar marketplace discovery

---

## [2.0.0] - 2026-03-01

### Added
- Multi-vendor marketplace support
- Seller registration and onboarding
- Seller dashboard with analytics
- Commission system
- Payment gateways (bKash, Stripe, SSLCommerz, COD)
- Order splitting by seller
- Seller product management
- Seller order management
- Admin seller management
- Admin dashboard
- User role management (RBAC)
- Multi-courier support
- Courier webhook handling
- Wallet system for customers
- Loyalty points system
- Address management with Bangladesh hierarchy
- Responsive design for mobile

### Changed
- Migrated from single-vendor to multi-vendor architecture
- Implemented Prisma ORM with tenant scoping
- Added Redis for session management
- Introduced Express.js custom server alongside Next.js

---

## [1.0.0] - 2025-12-01

### Added
- Initial release
- Product catalog with categories
- Shopping cart
- Checkout flow
- Order management
- User authentication (email/password)
- Admin dashboard
- Product search
- User profiles
- Address management
- Basic order tracking

---

## Version History Summary

| Version | Date | Milestone |
|---------|------|-----------|
| 1.0.0 | 2025-12 | Core MVP |
| 2.0.0 | 2026-03 | Multi-vendor marketplace |
| 3.0.0 | 2026-06 | AI & immersive features |
| Unreleased | 2026-07 | Enterprise features (accounting, POS, monitoring) |

---

## Breaking Changes

### v3.0.0
- API response format standardized (all endpoints return `{ success, data/error }`)
- Session token format updated (role-based TTLs)
- Prisma schema changes for multi-warehouse support

### v2.0.0
- Database schema migrated to multi-tenant architecture
- User model extended with `role` and `sellerStatus` fields
- Order model split into `Order` + `OrderShipment` + `OrderShipmentItem`

---

## Known Limitations

1. No semantic versioning strictly followed
2. No migration guides between versions
3. No deprecation warnings before breaking changes
4. Changelog not auto-generated from commits

## Future Improvements

1. Implement semantic versioning strictly
2. Add migration guides for breaking changes
3. Auto-generate changelog from conventional commits
4. Add release notes with each version
