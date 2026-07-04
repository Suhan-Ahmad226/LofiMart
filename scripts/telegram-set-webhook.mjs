import 'dotenv/config';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...valueParts] = arg.replace(/^--/, '').split('=');
  args.set(key, valueParts.join('=') || '1');
}

const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const frontendUrl = String(args.get('url') || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
const webhookUrl = String(args.get('webhook') || (frontendUrl ? `${frontendUrl}/api/telegram/webhook` : ''));
const dropPendingUpdates = args.get('drop-pending') === '1' || args.get('dropPending') === '1';

function fail(message) {
  console.error(`[telegram-webhook] ${message}`);
  process.exit(1);
}

if (!botToken) fail('TELEGRAM_BOT_TOKEN is missing.');
if (!secretToken) fail('TELEGRAM_WEBHOOK_SECRET is missing.');
if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) {
  fail('Webhook URL must be HTTPS. Set FRONTEND_URL or pass --url=https://your-domain.com.');
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    fail(data?.description || `${method} failed with HTTP ${response.status}`);
  }
  return data.result;
}

console.log(`[telegram-webhook] Setting webhook: ${webhookUrl}`);

await telegram('setWebhook', {
  url: webhookUrl,
  secret_token: secretToken,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: dropPendingUpdates,
});

const info = await telegram('getWebhookInfo', {});
console.log('[telegram-webhook] Webhook configured.');
console.log(`[telegram-webhook] url=${info.url || ''}`);
console.log(`[telegram-webhook] pending_update_count=${info.pending_update_count ?? 0}`);
if (info.last_error_message) {
  console.log(`[telegram-webhook] last_error_message=${info.last_error_message}`);
}
