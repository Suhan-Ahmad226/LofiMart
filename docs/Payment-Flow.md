# Payment Flow

## Executive Summary

LofiMart supports 5 payment methods: Cash on Delivery (COD), bKash Tokenized Checkout, SSLCommerz, Stripe, and Wallet Credits. The payment system implements idempotent transaction processing, server-side verification for all online payments, and comprehensive refund/wallet management.

---

## Payment Method Architecture

```mermaid
graph TB
    subgraph "Payment Methods"
        COD["Cash on<br/>Delivery"]
        bKash["bKash<br/>Tokenized"]
        SSLCommerz["SSLCommerz<br/>Gateway"]
        Stripe["Stripe"]
        Wallet["Wallet<br/>Credits"]
    end

    subgraph "Payment Module"
        Gateway["PaymentGateway<br/>Interface"]
        Repository["PaymentRepository<br/>(Prisma)"]
        Module["PaymentsModule<br/>(Use Cases)"]
    end

    subgraph "External Services"
        bKashAPI["bKash API"]
        StripeAPI["Stripe API"]
        SSLCommerzAPI["SSLCommerz API"]
    end

    COD --> Gateway
    bKash --> Gateway
    SSLCommerz --> Gateway
    Stripe --> Gateway
    Wallet --> Gateway
    Gateway --> Module
    Module --> Repository
    bKash --> bKashAPI
    Stripe --> StripeAPI
    SSLCommerz --> SSLCommerzAPI
```

---

## Cash on Delivery (COD)

```mermaid
sequenceDiagram
    participant Customer
    participant API
    participant DB

    Customer->>API: Checkout with COD
    API->>DB: Create Order (paymentStatus: "unpaid")
    API->>DB: Create OrderShipments
    API-->>Customer: Order confirmed
    
    Note over Customer,DB: Payment collected on delivery
    
    API->>DB: (Manual) Update paymentStatus: "paid"
    API->>DB: Set paidAt timestamp
```

**Status:** No online payment processing. Payment collected by courier on delivery.

---

## bKash Tokenized Checkout

```mermaid
sequenceDiagram
    participant Customer
    participant API
    participant Redis
    participant bKashAPI
    participant DB

    Note over Customer,DB: === Payment Initiation ===
    Customer->>API: POST /api/payments/bkash/initiate
    API->>Redis: Get/refresh bKash token
    Redis-->>API: Cached token
    API->>bKashAPI: POST /tokenized/checkout/create
    bKashAPI-->>API: { paymentID, bkashURL }
    API->>DB: Create PaymentTransaction (pending)
    API->>DB: Update Order (paymentStatus: "pending")
    API-->>Customer: { paymentId, checkoutUrl }

    Note over Customer,bKashAPI: === User Approves Payment ===
    Customer->>bKashAPI: Approve in bKash app
    bKashAPI-->>Customer: Redirect to callback

    Note over Customer,DB: === Server-Side Verification ===
    Customer->>API: GET /api/payments/bkash/callback
    API->>bKashAPI: POST /tokenized/checkout/execute
    bKashAPI-->>API: { transactionStatus: "completed" }
    API->>bKashAPI: POST /tokenized/checkout/payment/status
    bKashAPI-->>API: Verification result
    
    alt Payment Successful
        API->>DB: Update PaymentTransaction (paid)
        API->>DB: Update Order (paymentStatus: "paid", status: "processing")
        API->>DB: Set paidAt
        API-->>Customer: Redirect to success page
    else Payment Failed/Cancelled
        API->>DB: Update PaymentTransaction (failed/cancelled)
        API->>DB: Update Order (paymentStatus: "failed")
        API-->>Customer: Redirect to fail/cancel page
    end
```

### bKash Security Rules
1. **Server-side verification only** — Browser callback never trusted as proof
2. **Execute + Query** — Both execute and query endpoints called for verification
3. **Idempotency key** — Unique per transaction, prevents duplicate charges
4. **Token caching** — Tokens cached in Redis with skew-aware expiry
5. **Auto-retry on auth failure** — 401/403 triggers token re-grant

### bKash Token Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Granting: First request
    Granting --> Active: Token received
    Active --> Active: Used (within TTL)
    Active --> Refreshing: Near expiry
    Refreshing --> Active: Refresh successful
    Refreshing --> Granting: Refresh failed
    Active --> Expired: TTL exceeded
    Expired --> Granting: New request
```

---

## SSLCommerz Gateway

```mermaid
sequenceDiagram
    participant Customer
    participant API
    participant SSLCommerz
    participant DB

    Customer->>API: Checkout with SSLCommerz
    API->>SSLCommerz: Create payment session
    SSLCommerz-->>API: Session URL
    API->>DB: Create PaymentTransaction (pending)
    API-->>Customer: Redirect to SSLCommerz

    Customer->>SSLCommerz: Complete payment
    SSLCommerz->>API: Callback/Webhook
    API->>API: Verify payment
    API->>DB: Update PaymentTransaction (paid)
    API->>DB: Update Order (paymentStatus: "paid")
    API-->>Customer: Redirect to success page
```

---

## Stripe Gateway

```mermaid
sequenceDiagram
    participant Customer
    participant API
    participant Stripe
    participant DB

    Customer->>API: Checkout with Stripe
    API->>Stripe: Create PaymentIntent
    Stripe-->>API: { clientSecret }
    API->>DB: Create PaymentTransaction (pending)
    API-->>Customer: { clientSecret }

    Customer->>Stripe: Confirm payment (client-side)
    Stripe->>API: Webhook (payment_intent.succeeded)
    API->>DB: Update PaymentTransaction (paid)
    API->>DB: Update Order (paymentStatus: "paid")
    API-->>Customer: Payment confirmed
```

---

## Wallet Payment

```mermaid
sequenceDiagram
    participant Customer
    participant API
    participant DB

    Customer->>API: Checkout with wallet
    API->>DB: Check wallet balance
    API->>DB: Validate balance ≥ order total
    API->>DB: Debit wallet (WalletTransaction)
    API->>DB: Create Order (paymentStatus: "paid")
    API-->>Customer: Order confirmed
```

**Rules:**
- Balance must be ≥ order total
- Atomic wallet debit in transaction
- Transaction recorded with `balanceAfter`

---

## Payment State Machine

```mermaid
stateDiagram-v2
    [*] --> pending: Online payment initiated
    [*] --> unpaid: COD order created
    [*] --> paid: Wallet payment

    pending --> paid: Payment confirmed
    pending --> processing: Payment executing
    pending --> failed: Payment failed
    pending --> cancelled: Payment cancelled
    pending --> requires_action: User action needed

    processing --> paid: Execution successful
    processing --> failed: Execution failed

    paid --> refunded: Refund processed
    paid --> partially_refunded: Partial refund

    unpaid --> paid: COD collected
    unpaid --> cancelled: Order cancelled

    requires_action --> pending: User completed action
    requires_action --> cancelled: User abandoned

    failed --> [*]
    cancelled --> [*]
    refunded --> [*]
```

---

## Refund Processing

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant DB
    participant Customer

    Admin->>API: Approve return/refund
    API->>DB: Create Refund record
    API->>DB: Update PaymentTransaction
    
    alt Wallet Credit
        API->>DB: Credit user wallet
        API-->>Customer: Wallet credited
    else Gateway Refund
        API->>API: Call payment gateway refund API
        API->>DB: Update refund status
        API-->>Customer: Refund processed
    end
    
    API->>DB: Restore product stock
    API->>DB: Create InventoryMovement
```

---

## Payment Transaction Model

```typescript
PaymentTransaction {
  id: string (cuid)
  provider: string          // 'bkash' | 'stripe' | 'sslcommerz' | 'cod' | 'wallet'
  paymentId: string (unique) // Provider's payment reference
  orderId: string            // FK to Order
  customerId: string
  amount: Decimal
  currency: string           // 'BDT'
  status: string             // 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  idempotencyKey: string (unique)
  metadata: JSON             // Provider-specific data
  createdAt: DateTime
  updatedAt: DateTime
}
```

---

## Webhook Handling

### Generic Webhook Flow

```mermaid
graph TB
    Webhook["Incoming Webhook"] --> ValidateIP["Validate IP/Header"]
    ValidateIP --> ParsePayload["Parse Payload"]
    ParsePayload --> FindTransaction["Find PaymentTransaction"]
    FindTransaction --> UpdateStatus["Update Status"]
    UpdateStatus --> UpdateOrder["Update Order"]
    UpdateOrder --> TriggerActions["Trigger Side Effects"]
    TriggerActions --> Notify["Send Notifications"]
    TriggerActions --> Enqueue["Enqueue Jobs"]
```

### Supported Webhooks
| Provider | Endpoint | Events |
|----------|----------|--------|
| bKash | `/api/payments/bkash/webhook` | Payment status updates |
| bKash | `/api/payments/bkash/callback` | User redirect callback |
| Stripe | `/api/payments/stripe/webhook` | payment_intent.succeeded, charge.refunded |
| Pathao | `/api/logistics/webhook/pathao` | Delivery status updates |
| RedX | `/api/logistics/webhook/redx` | Tracking updates |
| Steadfast | `/api/logistics/webhook/steadfast` | Delivery status updates |

---

## Commerce Channel Configuration

Payment methods can be dynamically enabled/disabled via platform settings:

```
PlatformSetting keys:
- enabled_checkout_payment_methods: "cod,bkash,stripe,sslcommerz"
- enabled_manual_order_payment_methods: "cod,bkash,manual"
- enabled_courier_providers: "pathao,redx,steadfast,paperfly"
```

---

## Best Practices

1. **Server-side verification** — Never trust client-side payment confirmation
2. **Idempotency keys** — Prevent duplicate payment processing
3. **Atomic transactions** — Payment update + order update in single DB transaction
4. **Webhook signature verification** — Validate all incoming webhooks
5. **Timeout handling** — Set appropriate timeouts for external API calls
6. **Retry logic** — Implement exponential backoff for failed API calls
7. **Audit trail** — Log all payment events with full context

## Known Limitations

1. No split payments across multiple methods
2. No partial payments (pay now, pay later)
3. No recurring/subscription billing
4. No saved payment methods (tokenization)
5. No multi-currency support within single transaction

## Future Improvements

1. Split payment support
2. Saved payment method tokenization
3. Recurring billing engine
4. Multi-currency checkout
5. Payment analytics dashboard
6. Fraud detection integration
