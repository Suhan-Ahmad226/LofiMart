# LofiMart Documentation

## Welcome

This directory contains comprehensive technical documentation for the LofiMart (Commerce OS) multi-vendor ecommerce platform.

---

> **Status note (2026-09-07):** The authoritative, current audit of the codebase is [**`PROJECT_FULL_AUDIT_REPORT.md`**](../PROJECT_FULL_AUDIT_REPORT.md) at the repo root. The 2026-09-02 audit in this folder (`PROJECT_FULL_AUDIT_REPORT.md`) and the `Features.md` / `Phases.md` / `Payment-Flow.md` / `PROJECT_DOCUMENTATION.md` / `Changelog.md` documents are **historical** — they describe removed features (AI, AR/3D, bKash/Stripe/SSLCommerz, POS, accounting, gamification, PWA page). Checkout is Cash on Delivery only. Please reconcile against `CHANGES.md` which reflects the true current state.

## Documentation Index

| Document | Description | Audience | Status |
|----------|-------------|----------|--------|
| [Architecture](./Architecture.md) | System architecture, design patterns, technology stack | Engineers, Architects | Current |
| [Database](./Database.md) | Database schema, models, relations, multi-tenancy | Backend Engineers, DBAs | Current |
| [API](./API.md) | Complete API reference with endpoints and examples | Frontend Engineers, Integrators | Current |
| [Security](./Security.md) | Security architecture, threats, recommendations | Security Engineers | Current |
| [Authentication](./Authentication.md) | Auth flows, session management, OAuth | Full-stack Engineers | Current |
| [RBAC](./RBAC.md) | Role-based access control, permissions matrix | Full-stack Engineers | Current |
| [Business Rules](./Business-Rules.md) | Business logic, validation rules, constraints | Backend Engineers, QA | Current |
| [Order Flow](./Order-Flow.md) | Order lifecycle, multi-vendor splitting, fulfillment | Backend Engineers | Current |
| [Seller Flow](./Seller-Flow.md) | Seller lifecycle, onboarding, operations | Backend Engineers, Product | Current |
| [Error Handling](./Error-Handling.md) | Error patterns, response formats, logging | Full-stack Engineers | Current |
| [Environment Variables](./Environment-Variables.md) | All env vars, security notes, configuration | DevOps, Backend Engineers | Current |
| [Deployment](./Deployment.md) | Docker, CI/CD, infrastructure, scaling | DevOps Engineers | Current |
| [Monitoring](./Monitoring.md) | Health checks, logging, alerting, observability | DevOps, SRE | Current |
| [Setup](./Setup.md) | Development environment setup guide | New Developers | Current |
| [Folder Structure](./Folder-Structure.md) | Codebase organization and key files | All Engineers | Current |
| [Features](./Features.md) | Feature catalog (pre-cleanup; see note above) | Product Managers | Historical |
| [Payment Flow](./Payment-Flow.md) | Payment processing, gateway integration, refunds | Backend Engineers | Historical (COD only now) |
| [Phases](./Phases.md) | Development roadmap and feature timeline | Product Managers, Leadership | Historical |
| [Prompts](./Prompts.md) | AI integration details, prompts, algorithms | AI/ML Engineers | Historical (AI removed) |
| [Changelog](./Changelog.md) | Version history and breaking changes | All Team Members | Current |
| [PROJECT_FULL_AUDIT_REPORT](./PROJECT_FULL_AUDIT_REPORT.md) | 2026-09-02 audit (superseded by repo-root audit) | All | Superseded |

---

## Quick Links

### For New Developers
1. Start with [Setup.md](./Setup.md) to configure your environment
2. Read [Architecture.md](./Architecture.md) for system overview
3. Explore [Folder Structure](./Folder-Structure.md) for codebase navigation
4. Review [Authentication.md](./Authentication.md) for auth flows

### For Backend Engineers
1. [Database.md](./Database.md) — Schema and models
2. [API.md](./API.md) — Endpoint reference
3. [Business Rules](./Business-Rules.md) — Validation logic
4. [Order Flow](./Order-Flow.md) — Order processing
5. [Payment Flow](./Payment-Flow.md) — Payment integration

### For Frontend Engineers
1. [API.md](./API.md) — Client-server contracts
2. [Features](./Features.md) — UI feature catalog
3. [Folder Structure](./Folder-Structure.md) — Component organization
4. [Authentication.md](./Authentication.md) — Client-side auth

### For DevOps
1. [Deployment.md](./Deployment.md) — Infrastructure setup
2. [Environment Variables](./Environment-Variables.md) — Configuration
3. [Monitoring](./Monitoring.md) — Observability setup
4. [Setup.md](./Setup.md) — Development environment

### For Product/Design
1. [Features](./Features.md) — Feature catalog
2. [Phases](./Phases.md) — Roadmap
3. [Business Rules](./Business-Rules.md) — Business logic
4. [Changelog](./Changelog.md) — Release history

---

## Architecture Diagrams

All documentation includes Mermaid diagrams for:
- System architecture
- Entity relationship diagrams
- Sequence diagrams for key flows
- State machines for order/payment status
- Data flow diagrams
- Security layer diagrams
- Deployment architecture

---

## Contributing to Documentation

### Adding New Documentation
1. Create a new `.md` file in `docs/`
2. Follow the template: Title, Executive Summary, Detailed Sections, Diagrams, Best Practices, Known Limitations, Future Improvements
3. Add the file to this README's documentation index
4. Include Mermaid diagrams for complex flows

### Updating Existing Documentation
1. Keep diagrams in sync with code changes
2. Update API docs when endpoints change
3. Update environment variables when adding new ones
4. Update changelog for every release

---

## Documentation Standards

- **Format:** Markdown with Mermaid diagrams
- **Diagrams:** Use Mermaid syntax for all diagrams
- **Code examples:** TypeScript/JavaScript
- **API examples:** Request/Response JSON
- **Versioning:** Track with changelog
- **Cross-references:** Use relative links between documents

---

## Last Updated

September 2026
