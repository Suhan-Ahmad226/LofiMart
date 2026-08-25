import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:3000';

const ROUTES = [
  '/', '/shop', '/search?q=shirt', '/cart', '/wishlist', '/checkout',
  '/track', '/login', '/register', '/blog', '/community', '/style-quiz',
  '/vip', '/about', '/contact', '/terms', '/privacy', '/faq',
];

const browser = await chromium.launch();
const report = [];

async function scanRoute(route) {
  const page = await browser.newPage();
  const entry = { route, errors: [], pageErrors: [], badRequests: [], slow: [] };
  const t0 = Date.now();

  page.on('pageerror', (err) => {
    entry.pageErrors.push(String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err).slice(0, 600));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) {
      entry.errors.push(msg.text().slice(0, 400));
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      entry.badRequests.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
    }
  });

  try {
    await page.goto(base + route, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    try { await page.waitForTimeout(3000); } catch {}
  }
  await page.waitForTimeout(3500);
  entry.loadMs = Date.now() - t0;

  // count DOM nodes as a rough render-health check
  entry.domNodes = await page.evaluate(() => document.querySelectorAll('*').length).catch(() => -1);
  await page.close();
  report.push(entry);
}

for (const r of ROUTES) await scanRoute(r);
await browser.close();

for (const e of report) {
  console.log(`\n=== ${e.route} (${e.loadMs}ms, ${e.domNodes} nodes)`);
  if (e.pageErrors.length) console.log('  PAGE_ERRORS:\n   ' + e.pageErrors.join('\n   '));
  if (e.errors.length) console.log('  CONSOLE: ' + [...new Set(e.errors)].slice(0, 5).join(' ;; '));
  if (e.badRequests.length) console.log('  HTTP>=400: ' + [...new Set(e.badRequests)].join(', '));
  if (!e.pageErrors.length && !e.errors.length && !e.badRequests.length) console.log('  clean');
}
