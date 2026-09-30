import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { prisma } from '@/lib/server';
import { createClient as createSupabaseServer } from '@/lib/server';
import {
  createLocalUserFromSupabase,
  formatAuthUser,
  normalizeAuthRole,
} from '../shared';

export const runtime = 'nodejs';

const ExchangeSchema = z.object({
  accessToken: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
  referralCode: z.string().optional(),
  mode: z.enum(['login', 'register']).optional(),
});

function getProviderIdentity(
  supabaseUser: SupabaseUser | null,
): { provider: string; providerAccountId: string } | null {
  if (!supabaseUser) return null;
  const identities = Array.isArray(supabaseUser.identities) ? supabaseUser.identities : [];
  const oauthIdentity = identities.find(
    (identity) => identity && identity.provider !== 'email' && identity.id,
  );
  if (oauthIdentity?.provider && oauthIdentity.id) {
    return { provider: oauthIdentity.provider, providerAccountId: oauthIdentity.id };
  }
  return null;
}

function extractSupabaseAvatarUrl(supabaseUser: SupabaseUser | null): string | null {
  if (!supabaseUser) return null;

  const metadata = supabaseUser.user_metadata ?? {};
  const identityMetadata = Array.isArray(supabaseUser.identities)
    ? supabaseUser.identities
        .map((identity) => identity?.identity_data)
        .filter((value): value is Record<string, unknown> => Boolean(value))
    : [];

  const candidates = [
    metadata.avatar_url,
    metadata.picture,
    metadata.avatar,
    metadata.photo_url,
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

async function upsertProviderAccount(input: {
  userId: string;
  provider: string;
  providerAccountId: string;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  metadata?: Record<string, unknown>;
}) {
  return prisma.providerAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      providerEmail: input.providerEmail,
      providerEmailVerified: input.providerEmailVerified,
      metadata: input.metadata as never,
    },
    update: {
      userId: input.userId,
      providerEmail: input.providerEmail || undefined,
      providerEmailVerified: input.providerEmailVerified,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = ExchangeSchema.parse(await req.json());
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getUser(body.accessToken);

    if (error || !data.user?.email) {
      return NextResponse.json({ error: 'Supabase session not found' }, { status: 401 });
    }

    const supabaseUser = data.user;
    const email = supabaseUser.email;

    if (!email) {
      return NextResponse.json({ error: 'Supabase session not found' }, { status: 401 });
    }

    const verifiedAt = supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null;
    const providerEmailVerified = Boolean(verifiedAt);
    const providerIdentity = getProviderIdentity(supabaseUser);
    const displayName =
      body.name ||
      (typeof supabaseUser.user_metadata?.name === 'string' ? supabaseUser.user_metadata.name : undefined) ||
      (typeof supabaseUser.user_metadata?.full_name === 'string' ? supabaseUser.user_metadata.full_name : undefined);
    const preferredAvatarUrl = extractSupabaseAvatarUrl(supabaseUser);

    let user = null;
    if (providerIdentity) {
      const linked = await prisma.providerAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: providerIdentity.provider,
            providerAccountId: providerIdentity.providerAccountId,
          },
        },
        include: { user: true },
      });

      if (linked) {
        user = linked.user;
      }
    }

    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });

      if (user && providerIdentity) {
        const conflictingLink = await prisma.providerAccount.findFirst({
          where: {
            provider: providerIdentity.provider,
            providerAccountId: providerIdentity.providerAccountId,
            userId: { not: user.id },
          },
          select: { userId: true },
        });

        if (conflictingLink) {
          console.warn(
            `[auth:exchange] Provider identity conflict: ${providerIdentity.provider}:${providerIdentity.providerAccountId} email=${email} expected user=${conflictingLink.userId} resolved user=${user.id}`,
          );
          return NextResponse.json(
            {
              success: false,
              code: 'PROVIDER_LINK_CONFLICT',
              error: 'This provider identity is already linked to another account. Sign in from that account to continue.',
            },
            { status: 409 },
          );
        }

        if (!providerEmailVerified) {
          return NextResponse.json(
            {
              success: false,
              code: 'PROVIDER_EMAIL_UNVERIFIED',
              error: 'এই অ্যাকাউন্টের ইমেইল যাচাই করা হয়নি।',
            },
            { status: 409 },
          );
        }

        if (!user.emailVerified) {
          return NextResponse.json(
            {
              success: false,
              code: 'EMAIL_UNVERIFIED',
              error: 'Login করার আগে আপনার ইমেইল যাচাই করুন।',
              identifier: email,
              purpose: 'verify_email',
              phone: user.phone ?? null,
            },
            { status: 409 },
          );
        }

        if (user.supabaseAuthId) {
          return NextResponse.json(
            {
              success: false,
              code: 'PROVIDER_LINK_REQUIRED',
              error:
                'এই ইমেইলে একটি LofiMart অ্যাকাউন্ট আগে থেকেই আছে। সেই অ্যাকাউন্টে লগইন করে অ্যাকাউন্ট সেটিংস থেকে এই Google/Facebook অ্যাকাউন্টটি link করুন।',
            },
            { status: 409 },
          );
        }
      }
    }

    if (!user) {
      if (body.mode !== 'register') {
        return NextResponse.json({ error: 'Account not found. Please register first.' }, { status: 404 });
      }

      user = await createLocalUserFromSupabase({
        email,
        name: displayName,
        role: normalizeAuthRole(body.role),
        emailVerified: Boolean(verifiedAt),
        emailVerifiedAt: verifiedAt,
        avatarUrl: preferredAvatarUrl,
        supabaseAuthId: supabaseUser.id,
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: user.name || displayName || undefined,
          avatarUrl: user.avatarUrl || preferredAvatarUrl || undefined,
          emailVerified: user.emailVerified || Boolean(verifiedAt),
          emailVerifiedAt: user.emailVerifiedAt || (verifiedAt ? new Date(verifiedAt) : null),
          supabaseAuthId: user.supabaseAuthId || supabaseUser.id,
        },
      });
    }

    if (user.isBlocked || user.deactivatedAt) {
      return NextResponse.json({ error: 'This account is not active.' }, { status: 403 });
    }

    if (providerIdentity) {
      await upsertProviderAccount({
        userId: user.id,
        provider: providerIdentity.provider,
        providerAccountId: providerIdentity.providerAccountId,
        providerEmail: email,
        providerEmailVerified,
        metadata: { displayName: displayName || null, avatarUrl: preferredAvatarUrl, linkedFrom: 'exchange' },
      });
    }

    return NextResponse.json({
      user: formatAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
        alternatePhone: user.alternatePhone,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        storeName: user.storeName,
        storefrontSlug: user.storefrontSlug,
        storefrontBannerUrl: user.storefrontBannerUrl,
        storefrontHeadline: user.storefrontHeadline,
        sellerStatus: user.sellerStatus ?? 'draft',
        points: user.points ?? 0,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid auth exchange payload', details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete sign in' },
      { status: 500 },
    );
  }
}
