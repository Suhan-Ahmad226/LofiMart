import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getTrustedRedirectOrigins,
  isRedirectUrlAllowed,
} from '@/features/auth/services/redirectOrigins';
import { POST } from '@/app/api/auth/supabase/register/route';

const mocks = vi.hoisted(() => ({
  registerUser: vi.fn(async () => ({
    success: true,
    requiresVerification: true,
    passwordSet: true,
    registeredEmail: 'user@example.com',
    registeredPhone: '01712345678',
    resumingAccount: false,
  })),
  sendEmailOtp: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: vi.fn(() => ({
    APP_ENV: 'development',
    FRONTEND_URL: 'https://lofimart.vercel.app',
    CORS_ALLOWED_ORIGINS: [
      'https://lofimart.vercel.app',
      'https://lofimart-suhan-ahmad.vercel.app',
    ],
  })),
}));

vi.mock('@/features/auth/server/auth-service', () => ({
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  registerUser: mocks.registerUser,
  sendEmailOtp: mocks.sendEmailOtp,
}));

vi.mock('@/features/auth/services/rateLimit', () => ({
  takeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, resetAfterMs: 0 })),
}));

// Mirrors the exact payload builder from AuthPages.tsx handleSubmit.
function buildRegistrationPayload(redirectToOrigin: string): Record<string, unknown> {
  return {
    email: 'user@example.com',
    phone: '+8801712345678',
    name: 'Test User',
    role: 'customer',
    referralCode: '',
    password: 'password123',
    redirectTo: `${redirectToOrigin}/login`,
  };
}

function buildRegisterRequest(payload: Record<string, unknown>, requestUrl = 'http://localhost:3000/api/auth/supabase/register'): NextRequest {
  return new NextRequest(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('register redirect origin allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lofimart.vercel.app';
  });

  describe('getTrustedRedirectOrigins (development)', () => {
    it('includes FRONTEND_URL and CORS_ALLOWED_ORIGINS', () => {
      const origins = getTrustedRedirectOrigins();
      expect(origins).toEqual(
        expect.arrayContaining([
          'https://lofimart.vercel.app',
          'https://lofimart-suhan-ahmad.vercel.app',
        ]),
      );
    });

    it('includes localhost loopbacks only in non-production', () => {
      const origins = getTrustedRedirectOrigins();
      expect(origins).toContain('http://localhost:3000');
      expect(origins).toContain('http://127.0.0.1:3000');
    });

    it('includes the same-origin passed explicitly', () => {
      const origins = getTrustedRedirectOrigins('http://localhost:3000');
      expect(origins).toContain('http://localhost:3000');
    });
  });

  describe('isRedirectUrlAllowed security', () => {
    it('allows http://localhost:3000 in development', () => {
      expect(isRedirectUrlAllowed('http://localhost:3000/login', getTrustedRedirectOrigins())).toBe(true);
    });

    it('allows http://127.0.0.1:3000 in development', () => {
      expect(isRedirectUrlAllowed('http://127.0.0.1:3000/login', getTrustedRedirectOrigins())).toBe(true);
    });

    it('allows https://lofimart.vercel.app', () => {
      expect(isRedirectUrlAllowed('https://lofimart.vercel.app/login', getTrustedRedirectOrigins())).toBe(true);
    });

    it('allows https://lofimart-suhan-ahmad.vercel.app (CORS_ALLOWED_ORIGINS preview domain)', () => {
      expect(isRedirectUrlAllowed('https://lofimart-suhan-ahmad.vercel.app/login', getTrustedRedirectOrigins())).toBe(true);
    });

    it('allows the same-origin request', () => {
      const origins = getTrustedRedirectOrigins('http://localhost:3000');
      expect(isRedirectUrlAllowed('http://localhost:3000/login', origins)).toBe(true);
    });

    it('rejects https://evil.example in development', () => {
      expect(isRedirectUrlAllowed('https://evil.example/login', getTrustedRedirectOrigins())).toBe(false);
    });

    it('rejects another arbitrary external origin (including lookalike subdomains)', () => {
      expect(isRedirectUrlAllowed('https://attacker.example.com/login', getTrustedRedirectOrigins())).toBe(false);
      expect(isRedirectUrlAllowed('https://www.lofimart.vercel.app.evil.io/login', getTrustedRedirectOrigins())).toBe(false);
    });
  });
});

describe('POST /api/auth/supabase/register redirect integration', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lofimart.vercel.app';
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('accepts http://localhost:3000 redirect in development', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('http://localhost:3000'));
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.registerUser).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmailOtp).toHaveBeenCalledTimes(1);
  });

  it('accepts http://127.0.0.1:3000 redirect in development', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('http://127.0.0.1:3000'));
    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('accepts https://lofimart.vercel.app redirect', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('https://lofimart.vercel.app'));
    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('accepts https://lofimart-suhan-ahmad.vercel.app redirect (preview domain via CORS_ALLOWED_ORIGINS)', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('https://lofimart-suhan-ahmad.vercel.app'));
    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('accepts a same-origin request', async () => {
    const request = buildRegisterRequest(
      buildRegistrationPayload('http://localhost:3000'),
      'http://localhost:3000/api/auth/supabase/register',
    );
    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('rejects https://evil.example redirect with 400 before auth service', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('https://evil.example'));
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid registration payload');
    expect(body.details.some((issue: { path: string[] }) => issue.path[0] === 'redirectTo')).toBe(true);
    expect(mocks.registerUser).not.toHaveBeenCalled();
    expect(mocks.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('rejects another arbitrary external origin with 400', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('https://attacker.example.com'));
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });

  it('sanitizes debug logs (no password or phone value logged)', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('http://localhost:3000'));
    await POST(request);

    const logText = consoleLogSpy.mock.calls
      .map((call) => call.map(String).join(' '))
      .join('\n');

    expect(logText).not.toContain('password123');
    expect(logText).not.toContain('+8801712345678');
  });

  it('runs the full runtime chain on success', async () => {
    const request = buildRegisterRequest(buildRegistrationPayload('http://localhost:3000'));
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.registerUser).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmailOtp).toHaveBeenCalledTimes(1);

    const logText = consoleLogSpy.mock.calls
      .map((call) => call.map(String).join(' '))
      .join('\n');
    expect(logText).toContain('submit received');
    expect(logText).toContain('payload validated');
    expect(logText).toContain('calling auth service');
    expect(logText).toContain('auth service returned');
    expect(logText).toContain('calling supabase signUp');
    expect(logText).toContain('supabase signUp returned');
  });
});