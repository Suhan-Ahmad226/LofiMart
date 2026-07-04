# LofiMart Telegram Bot Integration

This feature turns Telegram into an operational control panel for sellers,
admins, and resellers.

## Environment

Set these in Vercel Production Environment Variables:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
```

## Webhook

Production webhook URL:

```text
https://lofimart.vercel.app/api/telegram/webhook
```

Set the webhook with Telegram's secret token:

```bash
npm run telegram:webhook:set -- --url=https://lofimart.vercel.app
```

To discard old pending bot updates during setup:

```bash
npm run telegram:webhook:set -- --url=https://lofimart.vercel.app --drop-pending
```

## Account onboarding

Send each account a deep link:

```text
https://t.me/BOT_USERNAME?start=seller_{sellerId}
https://t.me/BOT_USERNAME?start=reseller_{resellerId}
https://t.me/BOT_USERNAME?start=admin_{adminId}
```

The bot stores `telegramChatId` on the user record. If an account is already
linked to another chat, the bot refuses remapping.

## Order controls

Seller messages include inline buttons:

- Accept Order
- Reject Order
- Mark Shipped
- View Invoice
- Open Dashboard

Every callback verifies the Telegram chat belongs to that seller before
changing order or shipment state.
