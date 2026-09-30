import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { createSupabaseServerClient } from '../shared';
import { prisma } from '@/lib/server';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RecoverRegisterSchema = z.object({
  email: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
});

function resolveAuthRole(
  requestedRole: unknown,
  supabaseUser?: { user_metadata?: Record<string, unknown> | null },
): 'customer' | 'seller' | 'reseller' {
  const normalizeRole = (value: unknown): 'customer' | 'seller' | 'reseller' => {
    return value === 'seller' || value === 'reseller' || value === 'customer' ? value : 'customer';
  };
  const metadataRole = supabaseUser?.user_metadata?.role;
  return normalizeRole(requestedRole ?? metadataRole);
}

function extractSupabaseAvatarUrl(
  supabaseUser?:
    | {
        user_metadata?: Record<string, unknown> | null;
        raw_user_meta_data?: Record<string, unknown> | null;
        identities?: Array<{ identity_data?: Record<string, unknown> | null } | null> | null;
      }
    | null,
): string | null {
  const metadata = supabaseUser?.user_metadata;
  const rawMetadata = supabaseUser?.raw_user_meta_data;
  const identityMetadata = Array.isArray(supabaseUser?.identities)
    ? supabaseUser.identities
        .map((identity) => identity?.identity_data)
        .filter((value): value is Record<string, unknown> => Boolean(value))
    : [];

  const candidates = [
    metadata?.avatar_url,
    metadata?.picture,
    metadata?.avatar,
    metadata?.photo_url,
    rawMetadata?.avatar_url,
    rawMetadata?.picture,
    rawMetadata?.avatar,
    rawMetadata?.photo_url,
    ...identityMetadata.flatMap((identity) => [
      identity.avatar_url,
      identity.picture,
      identity.avatar,
      identity.photo_url,
    ]),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }

  return null;
}

async function ensureLocalSupabaseUser({
  email,
  preferredName,
  preferredAvatarUrl,
  safeRole,
  confirmedAt,
  authMode,
}: {
  email: string;
  preferredName: string;
  preferredAvatarUrl?: string | null;
  safeRole: 'customer' | 'seller' | 'reseller' | 'admin';
  confirmedAt: string | null;
  authMode: 'login' | 'register';
}) {
  let localUser = await prisma.user.findUnique({
    where: { email },
  });

  if (!localUser) {
    const slugBase =
      preferredName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'store';

    try {
      localUser = await prisma.user.create({
        data: {
          email,
          name: preferredName,
          avatarUrl: preferredAvatarUrl || null,
          role: safeRole,
           profileVisibility: safeRole === 'customer' ? 'private' : 'public',
           emailVerified: Boolean(confirmedAt),
          emailVerifiedAt: confirmedAt ? new Date(confirmedAt) : null,
          tenant:
            safeRole === 'seller' || safeRole === 'reseller'
              ? {
                  create: {
                    slug: `${slugBase}-${randomBytes(3).toString('hex')}`,
                    name: `${preferredName}'s workspace`,
                    settings: { create: {} },
                    stores: {
                      create: {
                        name: `${preferredName}'s storefront`,
                        currency: 'BDT',
                        locale: 'en-BD',
                      },
                    },
                  },
                }
              : undefined,
        },
        include: { tenant: true },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        localUser = await prisma.user.findUnique({ where: { email } });
      } else {
        throw error;
      }
    }
  }

  if (!localUser) {
    throw new Error('Unable to resolve the local account after a registration race.');
  }

  await prisma.notificationPreference.upsert({
    where: { userId: localUser.id },
    update: {},
    create: { userId: localUser.id },
  });

  if (localUser.tenantId) {
    await prisma.tenantMembership.create({
      data: {
        userId: localUser.id,
        tenantId: localUser.tenantId,
        role: safeRole,
        isPrimary: true,
        acceptedAt: new Date(),
      },
    });
  }

  if (authMode === 'register' && localUser.role !== safeRole) {
    const mismatchError = new Error(
      `This email already belongs to a ${localUser.role} account. Sign in first, then change or upgrade the role from your account flow if needed.`,
    ) as Error & { statusCode?: number };
    mismatchError.statusCode = 409;
    throw mismatchError;
  }

  const shouldPromoteRole =
    authMode !== 'register' &&
    localUser.role !== 'admin' &&
    localUser.role !== safeRole &&
    (localUser.role === 'customer' || safeRole === 'customer' ? safeRole !== 'customer' : true);
  const shouldUpdateName = !localUser.name && Boolean(preferredName);
  const shouldUpdateAvatar = !localUser.avatarUrl && Boolean(preferredAvatarUrl);
  const shouldVerifyEmail = !localUser.emailVerified && Boolean(confirmedAt);

  if (shouldPromoteRole || shouldUpdateName || shouldUpdateAvatar || shouldVerifyEmail) {
    localUser = await prisma.user.update({
      where: { id: localUser.id },
      data: {
        role: shouldPromoteRole ? safeRole : localUser.role,
        name: localUser.name || preferredName,
        avatarUrl: localUser.avatarUrl || preferredAvatarUrl || null,
        emailVerified: localUser.emailVerified || Boolean(confirmedAt),
        emailVerifiedAt: localUser.emailVerifiedAt || (confirmedAt ? new Date(confirmedAt) : null),
      },
    });
  }

  return localUser;
}

async function findSupabaseAuthUserByEmail(supabase: ReturnType<typeof createSupabaseServerClient>, email: string) {
  const normalizedEmail = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const matchedUser =
      data.users.find((candidate: any) => candidate?.email?.toLowerCase() === normalizedEmail) ?? null;
    if (matchedUser) {
      return matchedUser;
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = RecoverRegisterSchema.parse(await req.json().catch(() => ({})));
    const { email, role, name } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Supabase recovery is not configured' }, { status: 400 });
    }

    const clientIp = getClientIp(req);
    const { allowed } = await takeRateLimit(
      `supabase:recover-register:${email.toLowerCase()}:${clientIp}`,
      { limit: 10, windowMs: 15 * 60 * 1000 },
    );

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const supabase = createSupabaseServerClient(true);
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase recovery is not configured' }, { status: 400 });
    }

    const recoveredUser = await findSupabaseAuthUserByEmail(supabase, email);
    if (!recoveredUser?.email) {
      return NextResponse.json({ success: true });
    }

    const normalizedEmail = recoveredUser.email.toLowerCase();
    const confirmedAt = (recoveredUser as any).email_confirmed_at || (recoveredUser as any).confirmed_at || null;
    const safeRole = resolveAuthRole(role, recoveredUser as any);
    const preferredName =
      name ||
      (recoveredUser.user_metadata?.name as string | undefined) ||
      (recoveredUser.user_metadata?.full_name as string | undefined) ||
      normalizedEmail.split('@')[0];

    await ensureLocalSupabaseUser({
      email: normalizedEmail,
      preferredName,
      preferredAvatarUrl: extractSupabaseAvatarUrl(recoveredUser as any),
      safeRole,
      confirmedAt,
      authMode: 'register',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const statusCode = typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : null;
    if (statusCode) {
      return NextResponse.json(
        { error: (error as any)?.message || 'Failed to recover account registration' },
        { status: statusCode },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recover account registration' },
      { status: 500 },
    );
  }
}
