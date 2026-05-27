# bKash Tokenized Checkout

This integration follows the official bKash Tokenized Checkout documentation and keeps all credentials server-side.

## Environment

```env
BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_USERNAME=merchant_username
BKASH_PASSWORD=merchant_password
BKASH_APP_KEY=merchant_app_key
BKASH_APP_SECRET=merchant_app_secret
BKASH_WEBHOOK_TOPIC_ARN=optional_sns_topic_arn
```

## App Router API routes

- `POST /api/payments/bkash/initiate`
- `POST /api/payments/bkash/execute`
- `POST /api/payments/bkash/verify`
- `GET /api/payments/bkash/callback`
- `POST /api/payments/bkash/webhook`

## Request example

```json
{
  "orderId": "cmorder123",
  "agreementId": "your_saved_bkash_agreement_id",
  "payerReference": "017XXXXXXXX"
}
```

## Security notes

- Never call grant token, create payment, execute payment, or verify payment from the browser.
- Do not trust the browser callback alone.
- Successful callbacks are always verified server-to-server before the order is marked as paid.
- Duplicate pending payments are reused safely for the same order.
- Order state is updated through a single server-side synchronization path.

## Local payment status flow

- `pending`
- `paid`
- `failed`
- `cancelled`

## Frontend usage

Use `BkashCheckoutButton` with an already created order and an existing tokenized `agreementId`.
