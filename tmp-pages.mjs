import { chromium } from 'playwright';

const browser = await chromium.launch();
const routes = ['/', '/shop', '/categories', '/product/smartphone-x1-pro', '/flash-sale', '/blog'];
const table = [];

for (const route of routes) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const reqs = [];
  const failed = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/')) reqs.push({ u: r.url().replace('http://localhost:3000/api/', '').split('?')[0], s: r.status() });
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('/api/')) failed.push(r.url().replace('http://localhost:3000/api/', '').split('?')[0]);
  });
  let nav;
  try {
    const t = Date.now();
    await page.goto('http://localhost:3000' + route, { waitUntil: 'load', timeout: 90000 });
    nav = Date.now() - t;
  } catch (e) {
    nav = -1;
  }
  await page.waitForTimeout(7000);
  const m = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint');
    return {
      fcp: p ? Math.round(p.startTime) : -1,
      text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
    };
  });
  table.push({
    route,
    htmlLoadMs: nav,
    fcpMs: m.fcp,
    apiCalls: reqs.length,
    apiDetail: reqs.map((r) => `${r.s} ${r.u}`).join(', ') || '(none)',
    failed: failed.join(', ') || '-',
    bodyTextLen: m.text,
  });
  await page.close();
}

console.table(
  table.map((t) => ({ route: t.route, htmlLoadMs: t.htmlLoadMs, fcpMs: t.fcpMs, apiCalls: t.apiCalls, failed: t.failed, bodyTextLen: t.bodyTextLen })),
);
for (const t of table) console.log(`\n${t.route}\n  API: ${t.apiDetail}`);
await browser.close();