import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeEmail, normalizeBdPhone } from '@/features/auth/services/identity';
import { sanitizeRegistrationRole } from '@/modules/rbac/registration';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import {
  getTrustedRedirectOrigins,
  isRedirectUrlAllowed,
} from '@/features/auth/services/redirectOrigins';
import {
  registerUser,
  sendEmailOtp,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';

// Temporary safe staging logs (any password/token values are never logged).
function debugLog(message: string, extra: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[register] ${message}`, extra);
  }
}

const createRegisterSchema = (allowedOrigins: string[]) =>
  z.object({
    email: z.string().email().transform((value) => value.trim().toLowerCase()),
    password: z.string().min(8).optional(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(20).optional(),
    role: z.string().optional(),
    referralCode: z.string().optional(),
    redirectTo: z.string().url().optional().refine(
      (url) => !url || isRedirectUrlAllowed(url, allowedOrigins),
      'Redirect URL origin not allowed',
    ),
  });

export async function POST(request: NextRequest) {
  try {
    debugLog('submit received', {
      path: request.nextUrl.pathname,
      hasBody: Boolean(request.body),
    });

    // Allowlist combines the configured frontend origins, CORS_ALLOWED_ORIGINS,
    // the caller's own origin (same-origin redirects are safe), and localhost
    // loopbacks in non-production. The frontend always builds redirectTo from
    // window.location.origin.
    const allowedOrigins = getTrustedRedirectOrigins(request.nextUrl.origin);
    const body = createRegisterSchema(allowedOrigins).parse(await request.json());

    const email = normalizeEmail(body.email);
    const phone = body.phone ? normalizeBdPhone(body.phone) : null;
    if (!email || (body.phone && !phone)) {
      return NextResponse.json({ error: 'Enter a valid email and a valid Bangladesh phone number.' }, { status: 400 });
    }

    const role = sanitizeRegistrationRole(body.role);

    debugLog('payload validated', {
      email,
      phone: phone ? `${phone.slice(0, 3)}****` : null,
      name: Boolean(body.name),
      role: role || null,
      hasPassword: Boolean(body.password),
      redirectTo: body.redirectTo ?? null,
    });

    const clientIp = getClientIp(request);
    const { allowed } = await takeRateLimit(`auth:register:${clientIp}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!allowed) {
      debugLog('rate limited', { clientIp });
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    debugLog('calling auth service', { email, redirectTo: body.redirectTo ?? null });
    const result = await registerUser({
      email,
      name: body.name,
      role,
      phone,
      password: body.password,
      redirectTo: body.redirectTo,
    });
    debugLog('auth service returned', { success: result.success, code: result.success ? undefined : result.code });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status ?? 400 },
      );
    }

    // Send verification OTP to the account's real email after registration or resume
    debugLog('calling supabase signUp', { email: result.registeredEmail ?? email, purpose: 'register' });
    const otpResult = await sendEmailOtp({ email: result.registeredEmail ?? email, purpose: 'register' });
    debugLog('supabase signUp returned', { success: otpResult.success, code: otpResult.success ? undefined : otpResult.code });
    if (!otpResult.success) {
      return NextResponse.json(
        { error: 'Failed to send verification code' },
        { status: 500 },
      );
    }

    if (result.resumingAccount) {
      return NextResponse.json(
        {
          success: true,
          requiresVerification: true,
          resumingAccount: true,
          existingEmail: email,
          existingPhone: phone,
          passwordSet: false,
          registeredEmail: result.registeredEmail,
          registeredPhone: result.registeredPhone,
          resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        requiresVerification: result.requiresVerification,
        passwordSet: result.passwordSet,
        registeredEmail: result.registeredEmail,
        registeredPhone: result.registeredPhone,
        resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid registration payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 500 },
    );
  }
}
