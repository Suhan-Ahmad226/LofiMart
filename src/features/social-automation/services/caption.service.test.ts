import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSocialCaption } from './caption.service';

describe('generateSocialCaption', () => {
  const product = {
    name: 'Test Product',
    description: 'A great product',
    price: 99,
    oldPrice: 149,
    stock: 10,
    category: null,
    available: true,
    sellerStoreName: null,
  };

  const settings = {
    language: 'English',
    tone: 'Friendly',
    captionLength: 'Medium',
    hashtags: 'Automatic',
    ctaEnabled: true,
    aiCaptionEnabled: true,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it('returns AI_DISABLED when captioning is disabled', async () => {
    const result = await generateSocialCaption(product, { ...settings, aiCaptionEnabled: false });
    expect(result).toEqual({
      ok: false,
      code: 'AI_DISABLED',
      message: 'AI caption generation is disabled for this seller.',
    });
  });

  it('returns AI_NOT_CONFIGURED when GEMINI_API_KEY is not set', async () => {
    const result = await generateSocialCaption(product, settings);
    expect(result).toEqual({
      ok: false,
      code: 'AI_NOT_CONFIGURED',
      message: 'AI provider is not configured.',
    });
  });

  it('returns AI_NOT_CONFIGURED when GEMINI_API_KEY is empty', async () => {
    process.env.GEMINI_API_KEY = '';
    const result = await generateSocialCaption(product, settings);
    expect(result).toEqual({
      ok: false,
      code: 'AI_NOT_CONFIGURED',
      message: 'AI provider is not configured.',
    });
  });

  it('returns a caption when GEMINI_API_KEY is set and API responds', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Check out this amazing product! #deals' }],
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await generateSocialCaption(product, settings);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.caption).toBe('Check out this amazing product! #deals');
    }
  });

  it('returns AI_EMPTY_RESPONSE when API returns empty caption', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '' }],
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await generateSocialCaption(product, settings);
    expect(result).toEqual({
      ok: false,
      code: 'AI_EMPTY_RESPONSE',
      message: 'AI caption service returned an empty result.',
    });
  });

  it('returns AI_PROVIDER_ERROR when API call fails', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await generateSocialCaption(product, settings);
    expect(result).toEqual({
      ok: false,
      code: 'AI_PROVIDER_ERROR',
      message: 'AI caption service is temporarily unavailable.',
    });
  });

  it('returns AI_PROVIDER_ERROR when API returns non-OK status', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Invalid API key' } }),
    } as unknown as Response);

    const result = await generateSocialCaption(product, settings);
    expect(result).toEqual({
      ok: false,
      code: 'AI_PROVIDER_ERROR',
      message: 'AI caption service is temporarily unavailable.',
    });
  });
});
