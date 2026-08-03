# Order Flow

## Executive Summary

LofiMart's order flow handles the complete lifecycle from cart to delivery, including multi-vendor order splitting, stock reservation, payment processing, courier booking, and real-time status tracking. Orders are automatically split by seller, with each seller managing their own shipment independently.

---

## End-to-End Order Flow

```mermaid
sequenceDiagram
    participant Customer
    participant Cart
    participant API
    participant DB as PostgreSQL
    participant Redis
    participant Queue as BullMQ
    participant Seller
    participant Courier
    participant CustomerNotify

    Note over Customer,CustomerNotify: === Cart Phase ===
    Customer->>Cart: Add items to cart
    Cart->>API: POST /api/v2/cart
    API->>DB: Validate stock
    API->>Redis: Reserve stock (TTL)
    API-->>Cart: Cart updated

    Note over Customer,CustomerNotify: === Checkout Phase ===
    Customer->>API: POST /api/v2/orders (checkout)
    API->>API: Validate all items in stock
    API->>API: Apply coupon (if any)
    API->>API: Calculate shipping fees
    API->>API: Calculate totals
    API->>DB: Create Order + OrderItems
    
    Note over API,DB: === Multi-Seller Split ===
    API->>DB: Group items by sellerId
    API->>DB: Create OrderShipment per seller
    API->>DB: Create OrderShipmentItem per line
    
    Note over API,DB: === Stock Reduction ===
    API->>DB: Decrement stock (atomic)
    API->>DB: Create InventoryMovement records
    
    Note over API,DB: === Payment Phase ===
    alt COD Payment
        API->>DB: Set paymentStatus = "unpaid"
    else bKash Payment
        API->>API: Initiate bKash tokenized checkout
        API->>DB: Create PaymentTransaction (pending)
        API-->>Customer: Redirect to bKash
        Customer->>API: Approve payment
        API->>API: Execute bKash payment
        API->>API: Verify server-to-server
        API->>DB: Update paymentStatus = "paid"
    end
    
    Note over API,Seller: === Notification Phase ===
    API->>Queue: Enqueue order notifications
    Queue->>Seller: Telegram notification
    Queue->>CustomerNotify: Email/push confirmation
    
    Note over Seller,Courier: === Fulfillment Phase ===
    Seller->>API: Accept order
    API->>DB: Update shipment status = "accepted"
    Seller->>API: Book courier
    API->>Courier: Book shipment (Pathao/RedX/Steadfast)
    Courier-->>API: Tracking ID
    API->>DB: Store tracking info
    Seller->>API: Mark as shipped
    API->>DB: Update status = "shipped"
    API->>CustomerNotify: Shipping notification
    
    Courier->>API: Delivery webhook
    API->>DB: Update status = "delivered"
    API->>CustomerNotify: Delivery confirmation
```

---

## Cart Phase

### Adding to Cart
```mermaid
graph TB
    AddItem["Add to Cart"] --> CheckStock{"Stock<br/>Available?"}
    CheckStock -->|"Yes"| Reserve["Reserve Stock<br/>(Redis TTL)"]
    CheckStock -->|"No"| Reject["Reject:<br/>Insufficient Stock"]
    Reserve --> UpdateCart["Update Cart<br/>Context"]
    UpdateCart --> Calculate["Recalculate<br/>Totals"]
```

### Stock Reservation Rules
- Stock reserved in Redis with configurable TTL
- Reservation released if checkout not completed within TTL
- Reserved stock visible to other users as "in cart"
- Atomic decrement on actual order creation

---

## Checkout Phase

### Order Validation
1. All cart items validated for stock availability
2. Shipping address validated (required fields)
3. Payment method validated against enabled methods
4. Coupon validated (if provided): code, expiry, minimum order, seller match
5. Shipping fees calculated per seller/warehouse
6. Tax calculated (if applicable)

### Order Code Generation
```
Format: ORD-{timestamp}-{random6chars}
Example: ORD-1721500000000-A3X7K9
```

### Multi-Seller Splitting Logic

```mermaid
graph TB
    Order["Customer Order<br/>(5 items)"]
    Order --> Group["Group by sellerId"]
    Group --> SellerA["Seller A: 3 items<br/>Subtotal: 15,000 BDT"]
    Group --> SellerB["Seller B: 2 items<br/>Subtotal: 8,000 BDT"]
    SellerA --> ShipmentA["OrderShipment A<br/>+ 3 OrderShipmentItems"]
    SellerB --> ShipmentB["OrderShipment B<br/>+ 2 OrderShipmentItems"]
    ShipmentA --> WarehouseA["Warehouse A"]
    ShipmentB --> WarehouseB["Warehouse B"]
```

Each shipment:
- Has its own status lifecycle
- Can be fulfilled independently
- Has separate courier booking
- Tracks its own tracking information

---

## Payment Processing

See [Payment-Flow.md](./Payment-Flow.md) for detailed payment processing.

**Quick Flow:**
1. COD: No online payment → `paymentStatus: "unpaid"`
2. bKash: Initiate → Execute → Verify → `paymentStatus: "paid"`
3. Stripe: Create intent → Confirm → Webhook → `paymentStatus: "paid"`
4. SSLCommerz: Redirect → Callback → Verify → `paymentStatus: "paid"`
5. Wallet: Deduct balance → `paymentStatus: "paid"`

---

## Fulfillment Phase

### Seller Actions

```mermaid
graph LR
    NewOrder["New Order<br/>Notification"] --> Accept["Accept<br/>Order"]
    Accept --> BookCourier["Book<br/>Courier"]
    BookCourier --> Pack["Pack<br/>Items"]
    Pack --> Ship["Mark as<br/>Shipped"]
    Ship --> Track["Track<br/>Delivery"]
    Track --> Delivered["Delivered"]
```

### Courier Booking

```mermaid
graph TB
    Book["Book Shipment"] --> SelectProvider{"Select<br/>Courier"}
    SelectProvider -->|"Pathao"| PathaoBook["Pathao API<br/>(Auto store sync)"]
    SelectProvider -->|"RedX"| RedxBook["RedX API"]
    SelectProvider -->|"Steadfast"| SteadfastBook["Steadfast API"]
    SelectProvider -->|"Paperfly"| ManualBook["Manual Booking"]
    
    PathaoBook --> TrackingID["Tracking ID<br/>Generated"]
    RedxBook --> TrackingID
    SteadfastBook --> TrackingID
    ManualBook --> TrackingID["Manual Tracking<br/>Reference"]
    
    TrackingID --> UpdateShipment["Update Shipment<br/>with Tracking"]
```

### Delivery Tracking

```mermaid
sequenceDiagram
    participant Courier
    participant Webhook
    participant API
    participant DB

    Courier->>Webhook: Status update webhook
    Webhook->>API: Parse courier payload
    API->>API: Normalize status
    API->>DB: Update OrderShipment status
    API->>DB: Update Order status (if all delivered)
    API-->>Webhook: 200 OK
```

---

## Order Status Updates

### Telegram Bot Integration
Sellers can manage orders via Telegram bot:
1. **Accept:** `order:accept:{orderId}:{sellerId}` callback
2. **Reject:** `order:reject:{orderId}:{sellerId}` callback
3. **Ship:** `order:ship:{orderId}:{sellerId}` callback
4. **Deliver:** `order:deliver:{orderId}:{sellerId}` callback

### Status Notification Chain

| Status | Customer Notified | Seller Notified | Admin Notified |
|--------|------------------|-----------------|----------------|
| Created | ✅ Email/Push | ✅ Telegram | ❌ |
| Paid | ✅ Email | ❌ | ❌ |
| Accepted | ❌ | ✅ Telegram | ❌ |
| Shipped | ✅ Email/Push | ✅ Telegram | ❌ |
| Delivered | ✅ Email/Push | ✅ Telegram | ❌ |
| Cancelled | ✅ Email | ✅ Telegram | ✅ Dashboard |
| Return Requested | ✅ Email | ✅ Telegram | ✅ Dashboard |

---

## Return Flow

```mermaid
sequenceDiagram
    participant Customer
    participant API
    participant Admin
    participant DB

    Customer->>API: POST /api/orders/:id/return-request
    API->>DB: Create AccountActionRequest
    API->>Admin: Notification
    
    Admin->>API: Review return request
    
    alt Approved
        Admin->>API: POST /api/admin/returns/:id/approve
        API->>DB: Update status = "return_approved"
        API->>DB: Restore stock
        API->>DB: Create wallet credit / refund
        API-->>Customer: Return approved notification
    else Rejected
        Admin->>API: POST /api/admin/returns/:id/reject
        API->>DB: Update status = "return_rejected"
        API-->>Customer: Return rejected notification
    end
```

---

## Manual Order Flow (Seller/Admin)

```mermaid
graph TB
    CreateManual["Create Manual Order"] --> SelectCustomer["Select/Create<br/>Customer"]
    SelectCustomer --> AddItems["Add Products<br/>(from catalog)"]
    AddItems --> SetAddress["Set Shipping<br/>Address"]
    SetAddress --> SelectPayment["Select Payment<br/>Method"]
    SelectPayment --> Confirm["Confirm Order"]
    Confirm --> CreateOrder["Create Order<br/>+ Shipments"]
    CreateOrder --> NotifySeller["Notify Seller<br/>(Telegram)"]
```

---

## Order Invoice Generation

| Step | Action |
|------|--------|
| 1 | Order created → Invoice record auto-created |
| 2 | Invoice URL generated: `/account/orders/{id}/invoice` |
| 3 | PDF endpoint: `/api/orders/{id}/invoice.pdf` |
| 4 | Telegram invoice: Generated via signed URL with HMAC token |
| 5 | Token validity: 7 days, verified server-side |

---

## Best Practices

1. **Atomic stock reduction** — Always use database-level atomic decrement
2. **Transaction safety** — Order creation + stock reduction in single transaction
3. **Idempotent operations** — Payment callbacks must be idempotent
4. **Fail-safe defaults** — If payment verification fails, don't confirm order
5. **Audit trail** — Every status change logged with timestamp and actor

## Known Limitations

1. No partial shipment tracking — All or nothing per seller shipment
2. No split delivery addresses — Single address per order
3. No scheduled deliveries — Immediate processing only
4. No backorder support — Out of stock = cannot order
5. No multi-currency orders — BDT only per tenant

## Future Improvements

1. Partial shipment support with per-item tracking
2. Scheduled delivery date selection
3. Backorder/pre-order support
4. Multi-currency checkout
5. Delivery slot booking
6. Real-time delivery tracking map
