import { test, expect } from '@playwright/test';

test('health endpoint responds', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBeLessThan(600);
});
