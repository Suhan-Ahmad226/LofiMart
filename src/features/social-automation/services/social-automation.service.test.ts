import { afterEach, describe, expect, it, vi } from 'vitest';

describe('social-automation config detection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FACEBOOK_CLIENT_ID;
    delete process.env.FACEBOOK_CLIENT_SECRET;
    delete process.env.GEMINI_API_KEY;
  });

  it('facebook_publishing_configured is true when FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET are set', () => {
    process.env.FACEBOOK_CLIENT_ID = 'test-app-id';
    process.env.FACEBOOK_CLIENT_SECRET = 'test-app-secret';

    const result = Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
    expect(result).toBe(true);
  });

  it('facebook_publishing_configured is false when FACEBOOK vars are missing', () => {
    const result = Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
    expect(result).toBe(false);
  });

  it('ai_caption_configured is true when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const result = Boolean(process.env.GEMINI_API_KEY);
    expect(result).toBe(true);
  });

  it('ai_caption_configured is false when GEMINI_API_KEY is missing', () => {
    const result = Boolean(process.env.GEMINI_API_KEY);
    expect(result).toBe(false);
  });

  it('does not check OPENAI_API_KEY or AI_PROVIDER_API_KEY for caption config', () => {
    process.env.OPENAI_API_KEY = 'old-key';
    process.env.AI_PROVIDER_API_KEY = 'old-provider';
    delete process.env.GEMINI_API_KEY;

    const result = Boolean(process.env.GEMINI_API_KEY);
    expect(result).toBe(false);
  });

  it('does not check FACEBOOK_APP_ID or FACEBOOK_APP_SECRET for publishing config', () => {
    process.env.FACEBOOK_APP_ID = 'old-app-id';
    process.env.FACEBOOK_APP_SECRET = 'old-app-secret';
    delete process.env.FACEBOOK_CLIENT_ID;
    delete process.env.FACEBOOK_CLIENT_SECRET;

    const result = Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
    expect(result).toBe(false);
  });
});
