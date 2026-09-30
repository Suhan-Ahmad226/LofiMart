import { prisma } from '@/lib/server';
import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';
import { normalizeEmail, normalizeBdPhone, classifyLoginIdentifier } from '@/features/auth/services/identity';
import { syncSupabasePassword } from '@/features/auth/services/password-sync';
import { classifyExistingAccountRegistration } from '@/features/auth/services/registration-flow';
import { consumePasswordResetSession } from '@/features/auth/server/reset-session';
import { sanitizeRegistrationRole } from '@/modules/rbac/registration';
import { randomUUID } from 'node:crypto';

export const AUTH_PURPOSES = [
  'register',
  'verify_email',
  'reset_password',
  'set_password',
  'verify_phone',
  'guest_claim',
] as const;

export type AuthPurpose = (typeof AUTH_PURPOSES)[number];

export function isAuthPurpose(value: string): value is AuthPurpose {
  return (AUTH_PURPOSES as readonly string[]).includes(value);
}

export interface OtpChallengeResult {
  success: true;
  expiresAt: string;
  resendInSeconds: number;
}

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

const GENERIC_SUCCESS: { success: true } = { success: true };

function mapOtpSendError(error: unknown): { success: false; error: string; code: string } {
  const otpError = (error ?? {}) as { message?: string; code?: string; status?: number };
  const message = otpError.message ?? 'unknown';

  console.error('[auth:otp] send failed', {
    status: otpError.status ?? null,
    code: otpError.code ?? null,
    message,
  });

  if (/supabase auth is not configured/i.test(message)) {
    return { success: false, error: 'OTP সার্ভিস কনফিগার করা নেই। একটু পরে আবার চেষ্টা করুন।', code: 'AUTH_NOT_CONFIGURED' };
  }

  if (otpError.code === 'otp_disabled' || /signups? not allowed/i.test(message)) {
    return { success: false, error: 'এই আইডির জন্য OTP পাঠানো যাচ্ছে না।', code: 'OTP_POLICY' };
  }

  if (otpError.status === 429 || /rate.?limit/i.test(message)) {
    return { success: false, error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।', code: 'RATE_LIMITED' };
  }

  return { success: false, error: 'OTP পাঠানো ব্যর্থ হয়েছে। একটু পরে আবার চেষ্টা করুন।', code: 'SEND_FAILED' };
}

function getServiceRoleClient() {
  return createSupabaseServerClient(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export async function registerUser(params: {
  email: string;
  name: string;
  role: string;
  phone?: string | null;
  password?: string;
  redirectTo?: string;
}): Promise<{
  success: true;
  requiresVerification: boolean;
  passwordSet: boolean;
  registeredEmail: string;
  registeredPhone: string | null;
  resumingAccount: boolean;
} | { success: false; error: string; status?: number; code?: string }> {
  const email = normalizeEmail(params.email);
  const phone = params.phone ? normalizeBdPhone(params.phone) : null;

  if (!email || (params.phone && !phone)) {
    return { success: false, error: 'Enter a valid email and a valid Bangladesh phone number.' };
  }

  const role = sanitizeRegistrationRole(params.role);
  const supabasePassword = params.password ?? randomUUID();
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
  });

  if (existing) {
    const outcome = classifyExistingAccountRegistration({
      existingEmail: existing.email,
      existingPhone: existing.phone,
      existingEmailVerified: existing.emailVerified,
      existingPhoneVerified: existing.phoneVerified,
      requestEmail: email,
      requestPhone: phone,
    });

    if (outcome.action === 'conflict') {
      return {
        success: false,
        error: 'This email or phone number is already registered. Please login.',
        code: outcome.code,
        status: 409,
      };
    }

    if (!hasServiceRole) {
      return {
        success: false,
        error: 'Registration is not configured correctly. Please contact support.',
        code: 'AUTH_NOT_CONFIGURED',
        status: 500,
      };
    }

    let supabaseAuthId = existing.supabaseAuthId;
    const supabase = getServiceRoleClient();

    if (supabaseAuthId) {
      const { error } = await supabase.auth.admin.updateUserById(supabaseAuthId, {
        ...(params.password ? { password: params.password } : {}),
        user_metadata: { name: params.name, role },
      });

      if (error) {
        return { success: false, error: error.message, status: 400 };
      }
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: supabasePassword,
        email_confirm: false,
        user_metadata: { name: params.name, role },
      });

      if (error) {
        if (error.message.toLowerCase().includes('duplicate') || error.message.toLowerCase().includes('already')) {
          return {
            success: false,
            error: 'This email or phone number is already registered. Please login.',
            code: 'ACCOUNT_EXISTS',
            status: 409,
          };
        }
        return { success: false, error: error.message, status: 400 };
      }

      supabaseAuthId = data.user?.id ?? null;
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: params.name,
        role,
        phone,
        supabaseAuthId,
        sellerStatus: role === 'seller' || role === 'reseller' ? 'draft' : 'approved',
      },
    });

    return {
      success: true,
      requiresVerification: true,
      passwordSet: Boolean(params.password),
      registeredEmail: email,
      registeredPhone: phone,
      resumingAccount: true,
    };
  }

  if (!hasServiceRole) {
    return {
      success: false,
      error: 'Registration is not configured correctly. Please contact support.',
      code: 'AUTH_NOT_CONFIGURED',
      status: 500,
    };
  }

  let supabaseAuthId: string | null = null;

  if (hasServiceRole) {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: supabasePassword,
      email_confirm: false,
      user_metadata: { name: params.name, role },
    });
    if (error) {
      if (error.message.toLowerCase().includes('duplicate') || error.message.toLowerCase().includes('already')) {
        return { success: false, error: 'এই ইমেইল বা ফোন নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। Login করুন।', code: 'ACCOUNT_EXISTS' };
      }
      return { success: false, error: error.message, status: 400 };
    }
    supabaseAuthId = data.user?.id ?? null;
  }

  try {
    await prisma.user.create({
      data: {
        email,
        name: params.name,
        role,
        phone,
        supabaseAuthId,
        sellerStatus: role === 'seller' || role === 'reseller' ? 'draft' : 'approved',
        emailVerified: false,
        emailVerifiedAt: null,
      },
    });
  } catch (insertError) {
    // The Supabase identity is created before the local profile. If the
    // profile write fails, remove that identity so registration is atomic
    // from the user's perspective and cannot leave an orphaned auth user.
    if (supabaseAuthId) {
      const supabase = getServiceRoleClient();
      const { error: cleanupError } = await supabase.auth.admin.deleteUser(supabaseAuthId);
      if (cleanupError) {
        console.error('[auth:register] failed to clean up orphaned Supabase user', {
          supabaseAuthId,
          message: cleanupError.message,
        });
      }
    }

    if ((insertError as { code?: string })?.code === 'P2002') {
      return { success: false, error: 'এই ইমেইল বা ফোন নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। Login করুন।', code: 'ACCOUNT_EXISTS' };
    }
    throw insertError;
  }

  return {
    success: true,
    requiresVerification: true,
    passwordSet: Boolean(params.password),
    registeredEmail: email,
    registeredPhone: phone,
    resumingAccount: false,
  };
}

export async function sendEmailOtp(params: {
  email: string;
  purpose: AuthPurpose;
}): Promise<OtpChallengeResult | { success: false; error: string; code?: string }> {
  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    return mapOtpSendError(error);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: params.email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    return mapOtpSendError(error);
  }

  return {
    success: true,
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

export async function sendPhoneOtp(params: {
  phone: string;
  purpose: AuthPurpose;
}): Promise<OtpChallengeResult | { success: false; error: string; code?: string }> {
  const normalizedPhone = normalizeBdPhone(params.phone);
  if (!normalizedPhone) {
    return { success: false, error: 'Enter a valid Bangladesh phone number.' };
  }

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    return mapOtpSendError(error);
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: normalizedPhone,
    options: { shouldCreateUser: false },
  });

  if (error) {
    return mapOtpSendError(error);
  }

  return {
    success: true,
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

export async function verifyEmailOtp(email: string, token: string): Promise<{
  verified: boolean;
  supabaseUserId: string | null;
}> {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    return { verified: false, supabaseUserId: null };
  }

  return {
    verified: true,
    supabaseUserId: data.user?.id ?? null,
  };
}

export async function verifySmsOtp(phone: string, token: string): Promise<{ verified: boolean }> {
  const supabase = getServiceRoleClient();
  const normalizedPhone = normalizeBdPhone(phone);
  if (!normalizedPhone) {
    return { verified: false };
  }

  const { error } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token,
    type: 'sms',
  });

  return { verified: !error };
}

export async function requestPasswordReset(
  identifier: string,
): Promise<{ success: true } | { success: false; error: string; code?: string }> {
  const email = await resolvePasswordResetEmail(identifier);

  if (email) {
    const result = await sendEmailOtp({ email, purpose: 'reset_password' });
    if (!result.success) {
      return result;
    }
  }

  return GENERIC_SUCCESS;
}

export async function resolvePasswordResetEmail(identifier: string): Promise<string | null> {
  const classified = classifyLoginIdentifier(identifier);

  if (classified.type === 'email') {
    return classified.value;
  }

  if (classified.type === 'phone') {
    const user = await prisma.user.findFirst({
      where: { phone: classified.value },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  return null;
}

export async function resetPasswordWithOtp(params: {
  identifier: string;
  token: string;
  newPassword: string;
}): Promise<{ success: true } | { success: false; error: string; code?: string }> {
  const classified = classifyLoginIdentifier(params.identifier);
  let email: string | null = null;

  if (classified.type === 'email') {
    email = classified.value;
  } else if (classified.type === 'phone') {
    const user = await prisma.user.findFirst({
      where: { phone: classified.value },
      select: { email: true },
    });
    email = user?.email ?? null;
  }

  if (!email) {
    return { success: false, error: 'রিসেট অনুরোধটি বৈধ নয়।', code: 'INVALID_RESET' };
  }

  const { verified } = await verifyEmailOtp(email, params.token);

  if (!verified) {
    return { success: false, error: 'OTP সঠিক নয়। আবার চেষ্টা করুন।', code: 'INVALID' };
  }

  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, supabaseAuthId: true },
  });

  if (!dbUser?.supabaseAuthId) {
    return { success: false, error: 'অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি।', code: 'USER_NOT_FOUND' };
  }

  const supabase = getServiceRoleClient();
  const { error: updateError } = await supabase.auth.admin.updateUserById(dbUser.supabaseAuthId, {
    password: params.newPassword,
  });

  if (updateError) {
    return { success: false, error: 'Your password could not be reset right now.', code: 'PASSWORD_SYNC_FAILED' };
  }

  await prisma.loginActivity.updateMany({
    where: { userId: dbUser.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return GENERIC_SUCCESS;
}

export async function resetPasswordWithVerifiedSession(params: {
  identifier: string;
  resetSessionToken: string | null | undefined;
  newPassword: string;
}): Promise<{ success: true } | { success: false; error: string; code?: string }> {
  const email = await resolvePasswordResetEmail(params.identifier);

  if (!email) {
    return { success: false, error: 'Reset request is not valid or has expired.', code: 'INVALID_RESET' };
  }

  const resetSession = await consumePasswordResetSession({
    token: params.resetSessionToken,
    email,
  });

  if (!resetSession) {
    return {
      success: false,
      error: 'Your password reset session has expired. Please request a new verification code.',
      code: 'RESET_SESSION_INVALID',
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, supabaseAuthId: true },
  });

  if (!dbUser?.supabaseAuthId) {
    return { success: false, error: 'Account not found.', code: 'USER_NOT_FOUND' };
  }

  const sync = await syncSupabasePassword({
    supabaseAuthId: dbUser.supabaseAuthId,
    newPassword: params.newPassword,
  });

  if (!sync.ok) {
    return { success: false, error: 'Your password could not be reset right now.', code: 'PASSWORD_SYNC_FAILED' };
  }

  await prisma.loginActivity.updateMany({
    where: { userId: dbUser.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return GENERIC_SUCCESS;
}

export async function requestSetPassword(
  identifier: string,
): Promise<{ success: true } | { success: false; error: string; code?: string }> {
  const classified = classifyLoginIdentifier(identifier);
  let email: string | null = null;

  if (classified.type === 'email') {
    email = classified.value;
  } else if (classified.type === 'phone') {
    const user = await prisma.user.findFirst({
      where: { phone: classified.value },
      select: { email: true },
    });
    email = user?.email ?? null;
  }

  if (!email) {
    return GENERIC_SUCCESS;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });

  if (!user || !user.emailVerified) {
    return GENERIC_SUCCESS;
  }

  const result = await sendEmailOtp({ email, purpose: 'set_password' });
  if (!result.success) {
    return result;
  }

  return GENERIC_SUCCESS;
}

export async function setPasswordWithOtp(params: {
  identifier: string;
  token: string;
  newPassword: string;
}): Promise<{ success: true } | { success: false; error: string; code?: string }> {
  const classified = classifyLoginIdentifier(params.identifier);
  let email: string | null = null;

  if (classified.type === 'email') {
    email = classified.value;
  } else if (classified.type === 'phone') {
    const user = await prisma.user.findFirst({
      where: { phone: classified.value },
      select: { email: true },
    });
    email = user?.email ?? null;
  }

  if (!email) {
    return { success: false, error: 'সেট-পাসওয়ার্ড অনুরোধটি বৈধ নয়।', code: 'INVALID_SET' };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, supabaseAuthId: true, emailVerified: true },
  });

  if (!user || !user.emailVerified) {
    return { success: false, error: 'অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি।', code: 'USER_NOT_FOUND' };
  }

  const { verified } = await verifyEmailOtp(email, params.token);

  if (!verified) {
    return { success: false, error: 'OTP সঠিক নয়। আবার চেষ্টা করুন।', code: 'INVALID' };
  }

  if (user.supabaseAuthId) {
    const sync = await syncSupabasePassword({
      supabaseAuthId: user.supabaseAuthId,
      newPassword: params.newPassword,
    });

    if (!sync.ok) {
      return { success: false, error: 'Your password could not be set right now.', code: 'PASSWORD_SYNC_FAILED' };
    }
  }

  return GENERIC_SUCCESS;
}

export async function markEmailVerified(userId: string, supabaseAuthId: string | null) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });

  if (supabaseAuthId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getServiceRoleClient();
      await supabase.auth.admin.updateUserById(supabaseAuthId, { email_confirm: true });
    } catch (error) {
      console.warn('[auth:email-verify] Failed to confirm Supabase identity', error);
    }
  }

  return updated;
}

export async function markPhoneVerified(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { phoneVerified: true, phoneVerifiedAt: new Date() },
  });
}

export async function sendPhoneVerification(userId: string): Promise<{
  success: true;
  expiresAt: string;
} | { success: false; error: string; code?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, phoneVerified: true },
  });

  if (!user) {
    return { success: false, error: 'User not found', code: 'USER_NOT_FOUND' };
  }

  if (user.phoneVerified) {
    return { success: true, expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString() };
  }

  const phone = normalizeBdPhone(user.phone);
  if (!phone) {
    return { success: false, error: 'Add a valid phone number before requesting verification', code: 'INVALID_PHONE' };
  }

  if (phone !== user.phone) {
    await prisma.user.update({ where: { id: userId }, data: { phone } });
  }

  const result = await sendPhoneOtp({ phone, purpose: 'verify_phone' });
  if (!result.success) {
    return result;
  }

  return { success: true, expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString() };
}

export async function verifyPhoneToken(userId: string, token: string): Promise<{ success: true } | { success: false; error: string; code?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, phoneVerified: true },
  });

  if (!user || !user.phone) {
    return { success: false, error: 'Phone number not found', code: 'NO_PHONE' };
  }

  const result = await verifySmsOtp(user.phone, token);

  if (result.verified) {
    await markPhoneVerified(userId);
    return { success: true };
  }

  return { success: false, error: 'Invalid verification code', code: 'INVALID' };
}

export async function sendGuestClaimOtp(orderId: string): Promise<{
  success: true;
  guestEmail: string;
  expiresAt: string;
  hasPhone: boolean;
} | { success: false; error: string; code?: string }> {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      userId: null,
      AND: [{ OR: [{ guestEmail: { not: null } }, { guestPhone: { not: null } }] }],
    },
    select: { id: true, guestEmail: true, guestPhone: true },
  });

  if (!order) {
    return { success: false, error: 'অর্ডারটি খুঁজে পাওয়� যায়নি বা ইতিমধ্যে claim করা হয়েছে।', code: 'ORDER_NOT_CLAIMABLE' };
  }

  if (!order.guestEmail) {
    return { success: false, error: 'এই অর্ডারে কোনো guest email নেই।', code: 'NO_GUEST_EMAIL' };
  }

  const result = await sendEmailOtp({ email: order.guestEmail, purpose: 'guest_claim' });
  if (!result.success) {
    return result;
  }

  return {
    success: true,
    guestEmail: order.guestEmail,
    hasPhone: Boolean(order.guestPhone),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  };
}

export async function verifyGuestClaim(params: {
  orderId: string;
  userId: string;
  token: string;
}): Promise<{ success: true } | { success: false; error: string; code?: string }> {
  const order = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      userId: null,
      AND: [{ OR: [{ guestEmail: { not: null } }, { guestPhone: { not: null } }] }],
    },
    select: { id: true, guestEmail: true },
  });

  if (!order || !order.guestEmail) {
    return { success: false, error: 'অর্ডারটি খুঁজে পাওয়া যায়নি বা ইতিমধ্যে claim করা হয়েছে।', code: 'ORDER_NOT_CLAIMABLE' };
  }

  const { verified } = await verifyEmailOtp(order.guestEmail, params.token);

  if (!verified) {
    return { success: false, error: 'OTP সঠিক নয়। আবার চেষ্টা করুন।', code: 'INVALID' };
  }

  const claimed = await prisma.order.updateMany({
    where: { id: order.id, userId: null, claimedAt: null },
    data: { userId: params.userId, claimedAt: new Date() },
  });

  if (claimed.count !== 1) {
    return { success: false, error: 'অর্ডারটি ইতিমধ্যে অন্য কোনো অ্যাকাউন্টে claim করা হয়েছে।', code: 'ALREADY_CLAIMED' };
  }

  return GENERIC_SUCCESS;
}

export {
  classifyLoginIdentifier,
  normalizeBdPhone,
  normalizeEmail,
};
