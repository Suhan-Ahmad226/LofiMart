import { markRateLimit, peekRateLimit, takeRateLimit } from '@/features/auth/services/rateLimit';

/**
 * Server-side OTP policy.
 *
 * Supabase Auth owns the code itself; these limits own everything around it, so
 * a code can never be brute-forced or replayed indefinitely:
 *
 *   length            6 digits
 *   expiry            5 minutes
 *   verification tries 5 per code
 *   resend cooldown   60 seconds
 *
 * The state lives in the project's existing Redis-backed limiter, which means
 * the policy is shared across every server instance and needs no extra table.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpVerificationDecision =
  | { allowed: true }
  | { allowed: false; code: 'EXPIRED' | 'MAX_ATTEMPTS'; retryAfterSeconds: number };

function attemptKey(purpose: string, identifier: string) {
  return `otp:attempts:${purpose}:${identifier}`;
}

function issuedKey(purpose: string, identifier: string) {
  return `otp:issued:${purpose}:${identifier}`;
}

/**
 * Marks that a fresh code was just sent. Called by every route that issues an
 * OTP so verification can later prove a code was requested recently.
 */
export async function recordOtpIssued(purpose: string, identifier: string) {
  await markRateLimit(issuedKey(purpose, identifier), { windowMs: OTP_TTL_MS });
}

/**
 * Spends one verification attempt and checks that a code was actually issued
 * inside the current TTL window.
 */
export async function evaluateOtpVerification(params: {
  purpose: string;
  identifier: string;
}): Promise<OtpVerificationDecision> {
  const { purpose, identifier } = params;

  const issued = await peekRateLimit(issuedKey(purpose, identifier));
  if (!issued.present) {
    return { allowed: false, code: 'EXPIRED', retryAfterSeconds: 0 };
  }

  const attempts = await takeRateLimit(attemptKey(purpose, identifier), {
    limit: OTP_MAX_ATTEMPTS,
    windowMs: OTP_TTL_MS,
  });

  if (!attempts.allowed) {
    return {
      allowed: false,
      code: 'MAX_ATTEMPTS',
      retryAfterSeconds: Math.max(1, Math.ceil(attempts.resetAfterMs / 1000)),
    };
  }

  return { allowed: true };
}