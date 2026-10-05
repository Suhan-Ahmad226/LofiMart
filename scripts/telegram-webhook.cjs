#!/usr/bin/env node
/**
 * Telegram webhook management.
 *
 *   npm run telegram:webhook:info
 *   npm run telegram:webhook:set -- --url=https://example.com [--drop-pending]
 *   npm run telegram:webhook:delete
 *
 * The URL may be given with or without the /api/telegram/webhook path.
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const WEBHOOK_PATH = '/api/telegram/webhook';

function parseArgs(argv) {
  const subcommand = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'info';
  const flags = {};

  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) {
      flags[match[1]] = match[2] === undefined ? true : match[2];
    }
  }

  return { subcommand, flags };
}

function normalizeUrl(rawUrl) {
  const trimmed = String(rawUrl || '').replace(/\/+$/, '');
  return trimmed.endsWith(WEBHOOK_PATH) ? trimmed : `${trimmed}${WEBHOOK_PATH}`;
}

async function callTelegram(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} failed with HTTP ${response.status}`);
  }

  return data.result;
}

function printInfo(info) {
  console.log('url                   :', info.url || '(not set)');
  console.log('pending_update_count  :', info.pending_update_count);
  console.log('last_error_message    :', info.last_error_message || 'none');
  console.log(
    'last_error_date       :',
    info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : 'none',
  );
  console.log('allowed_updates       :', (info.allowed_updates || []).join(', ') || 'default');
}

async function main() {
  const { subcommand, flags } = parseArgs(process.argv.slice(2));
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set. Add it to .env before running this script.');
    process.exitCode = 1;
    return;
  }

  if (subcommand === 'info') {
    printInfo(await callTelegram(token, 'getWebhookInfo'));
    return;
  }

  if (subcommand === 'delete') {
    console.log('deleteWebhook ->', await callTelegram(token, 'deleteWebhook', { drop_pending_updates: true }));
    return;
  }

  if (subcommand === 'set') {
    if (!flags.url) {
      console.error('Missing --url. Example: npm run telegram:webhook:set -- --url=https://example.com');
      process.exitCode = 1;
      return;
    }

    const url = normalizeUrl(flags.url);
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const result = await callTelegram(token, 'setWebhook', {
      url,
      secret_token: secret || undefined,
      drop_pending_updates: Boolean(flags['drop-pending']),
      allowed_updates: ['message', 'callback_query'],
    });

    console.log('setWebhook ->', result);
    console.log('url                   :', url);
    console.log('secret_token          :', secret ? 'configured' : 'MISSING (webhook will reject all updates)');
    console.log('\n--- getWebhookInfo ---');
    printInfo(await callTelegram(token, 'getWebhookInfo'));
    return;
  }

  console.error(`Unknown subcommand "${subcommand}". Use one of: info, set, delete.`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`telegram:webhook failed -> ${error.message}`);
  process.exitCode = 1;
});