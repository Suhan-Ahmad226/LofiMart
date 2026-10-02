import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireApiUser, uploadMedia, validateUploadInput, takeRateLimit } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  uploadMedia: vi.fn(),
  validateUploadInput: vi.fn(),
  takeRateLimit: vi.fn(),
}));

vi.mock('@/app/api/products/shared', () => ({ requireApiUser }));
vi.mock('@/lib/media', () => ({ uploadMedia, validateUploadInput }));
vi.mock('@/features/auth/services/rateLimit', () => ({ takeRateLimit }));

import { POST } from '@/app/api/media/upload/route';

function uploadRequest() {
  return new NextRequest('http://localhost/api/media/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png', sizeBytes: 5 }),
  });
}

describe('media upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiUser.mockResolvedValue({ id: 'user-1', role: 'customer' });
    takeRateLimit.mockResolvedValue({ allowed: true, resetAfterMs: 60_000 });
    uploadMedia.mockResolvedValue({ url: 'https://res.cloudinary.com/demo/image/upload/sample.webp' });
  });

  it.each(['customer', 'reseller'])('allows authenticated %s users to upload shared media', async (role) => {
    requireApiUser.mockResolvedValue({ id: 'user-1', role });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://res.cloudinary.com/demo/image/upload/sample.webp',
    });
    expect(takeRateLimit).toHaveBeenCalledWith('media-upload:user-1', { limit: 10, windowMs: 60_000 });
    expect(uploadMedia).toHaveBeenCalledOnce();
  });

  it('keeps non-user roles from uploading', async () => {
    requireApiUser.mockResolvedValue({ id: 'guest-1', role: 'guest' });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(403);
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('returns retry timing when the per-user upload limit is reached', async () => {
    takeRateLimit.mockResolvedValue({ allowed: false, resetAfterMs: 12_000 });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(uploadMedia).not.toHaveBeenCalled();
  });
});
