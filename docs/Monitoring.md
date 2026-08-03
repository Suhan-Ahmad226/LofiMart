# Monitoring and Observability

## Executive Summary

LofiMart implements monitoring across application health, database performance, Redis connectivity, web vitals, and error tracking using structured logging, health check endpoints, and performance alerting.

---

## Health Check Endpoint

```
GET /api/health
```

### Response

```json
{
  "status": "healthy",
  "database": { "ok": true, "latencyMs": 12, "provider": "postgresql" },
  "redis": { "ok": true, "latencyMs": 3, "status": "ready" },
  "uptime": 86400
}
```

### Health Check Components

| Component | Check Method | Timeout | Alert Threshold |
|-----------|-------------|---------|-----------------|
| PostgreSQL | SELECT 1 | 5s | > 500ms latency |
| Redis | PING | 3s | > 200ms latency |
| Application | Process alive | Immediate | Not responding |
| WebSocket | Port check | 3s | Connection refused |

---

## Web Vitals Monitoring

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| FCP | < 1.8s | 1.8s - 3.0s | > 3.0s |
| LCP | < 2.5s | 2.5s - 4.0s | > 4.0s |
| FID | < 100ms | 100ms - 300ms | > 300ms |
| CLS | < 0.1 | 0.1 - 0.25 | > 0.25 |
| TTFB | < 800ms | 800ms - 1800ms | > 1800ms |
| INP | < 200ms | 200ms - 500ms | > 500ms |

### Admin Dashboard

```
GET /api/admin/performance/web-vitals
```

Returns aggregated metrics with page-level breakdown, device analysis, trends, and alert history.

### Alert Acknowledgement

```
POST /api/admin/performance/alerts/:id/ack
```

---

## Structured Logging

**File:** src/lib/logger.ts

| Level | Usage | Examples |
|-------|-------|----------|
| info | Normal operations | Order created, payment received |
| warn | Recoverable issues | Token refresh failed, cache miss |
| error | Unrecoverable errors | Database connection failed |
| debug | Development details | Request/response bodies |

### Key Log Events

| Category | Events |
|----------|--------|
| Auth | login.success, login.failed, logout, token.refresh |
| Orders | order.created, order.paid, order.shipped, order.delivered |
| Payments | payments.bkash.initiated, payments.bkash.order_paid |
| Inventory | inventory.low_stock, inventory.restock |
| Errors | error.captured, error.unhandled |

---

## Queue Monitoring

Each of the 9 BullMQ workers reports:

| Metric | Description |
|--------|-------------|
| waiting | Jobs in queue, not yet processing |
| active | Currently processing jobs |
| completed | Successfully processed jobs |
| failed | Failed jobs (after all retries) |
| delayed | Jobs scheduled for future execution |

---

## Audit Logging

**Model:** AuditLog

| Field | Purpose |
|-------|---------|
| userId | Who performed the action |
| action | What action (e.g., user.role_changed) |
| entityType | Which entity type |
| entityId | Which specific entity |
| metadata | Additional context (JSON) |

### Audit Coverage

| Area | Events Logged |
|------|---------------|
| Authentication | Login, logout, password change, registration |
| Orders | Creation, status changes, cancellation, refund |
| Products | Create, update, delete, stock changes |
| Users | Role changes, deletion, blocking |
| Payments | Transaction creation, status changes |
| Admin | Settings changes, seller approval |

---

## Integration Status Monitoring

```
GET /api/admin/integrations/status
```

Returns health status of all external integrations (email, SMS, push, Google auth, Stripe, SSLCommerz, Pathao, RedX, Steadfast).

---

## Alert Channels

| Alert Type | Channel | Trigger |
|-----------|---------|---------|
| Web vitals degradation | Admin dashboard | Metric exceeds threshold |
| High error rate | Telegram | > 10 errors/minute |
| Queue backlog | Telegram | > 100 jobs waiting |
| Database latency | Telegram | > 1s response time |
| Redis disconnected | Telegram | Connection lost |

---

## Best Practices

1. Use structured JSON logging for machine parsing
2. Include correlation IDs across all logs
3. Monitor key business metrics (orders/hour, conversion rate)
4. Set up alerting thresholds (avoid alert fatigue)
5. Log sampling in production

## Known Limitations

1. No distributed tracing (OpenTelemetry/Jaeger)
2. No real-time metrics dashboard (Grafana/Datadog)
3. No automated incident response
4. No SLO/SLA tracking
5. No cost monitoring for external APIs

## Future Improvements

1. Integrate OpenTelemetry for distributed tracing
2. Add Grafana dashboards
3. Implement automated incident response
4. Add SLO/SLA tracking
5. Integrate cost monitoring for external API usage
6. Implement log aggregation (ELK/Loki)

---
