import type { User } from '@prisma/client';
import { prisma } from '@/lib/server';
import { isValidEmail, normalizeEmail } from '@/features/auth/services/identity';
import { sanitizeRegistrationRole } from '@/modules/rbac/registration';

/**
 * The single place where a Supabase Auth identity becomes a LofiMart
 * application user.
 *
 * Every entry point (OAuth exchange, password login, completed OTP
 * registration) goes through this resolver so identity linking, email
 * canonicalisation and profile creation can never drift apart between routes.
 */

export type ProviderIdentityRef = {
  provider: string;
  providerAccountId: string;
} | null;

export type ResolveIdentityInput = {
  /** The Supabase Auth user id proven by the request's access token. */
  supabaseUserId: string;
  /** Raw email as reported by Supabase; normalised here for every caller. */
  email: string | null | undefined;
  /** True when Supabase reports the address as confirmed. */
  emailVerified: boolean;
  emailVerifiedAt?: Date | null;
  provider?: ProviderIdentityRef;
  providerEmailVerified?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  /** Self-service registration intent; sanitised server-side. */
  requestedRole?: unknown;
  /**
   * Set by callers that already proved control of the email in this request
   * (an OTP session bound to the address, or a confirmed Supabase email).
   * An unverified leftover profile may then be completed instead of rejected.
   */
  assumeVerifiedEmail?: boolean;
  /** Set false for flows that must never mint a new profile. */
  allowCreate?: boolean;
};

export type IdentityResolution =
  | { status: 'resolved'; user: User; createdProfile: boolean; linkedProvider: boolean }
  | { status: 'email_unverified'; identifier: string; phone: string | null }
  | { status: 'provider_email_unverified' }
  | { status: 'link_conflict' }
  | { status: 'invalid_email' }
  | { status: 'not_found' };

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

/**
 * Links the provider identity to the resolved user.
 *
 * The unique (provider, providerAccountId) index is the real guard here: a
 * replayed or concurrent callback that lost the race simply re-reads the
 * winner instead of creating a second link or failing the request.
 */
async function linkProviderIdentity(input: {
  userId: string;
  provider: string;
  providerAccountId: string;
  providerEmail: string;
  providerEmailVerified: boolean;
  metadata?: Record<string, unknown>;
}): Promise<'linked' | 'already' | 'conflict'> {
  const existing = await prisma.providerAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    },
    select: { userId: true },
  });

  if (existing) {
    return existing.userId === input.userId ? 'already' : 'conflict';
  }

  try {
    await prisma.providerAccount.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        providerEmail: input.providerEmail,
        providerEmailVerified: input.providerEmailVerified,
        metadata: (input.metadata ?? null) as never,
      },
    });
    return 'linked';
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const raced = await prisma.providerAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: input.provider,
          providerAccountId: input.providerAccountId,
        },
      },
      select: { userId: true },
    });

    if (!raced) throw error;
    return raced.userId === input.userId ? 'already' : 'conflict';
  }
}

/**
 * Creates the local profile for a brand-new identity.
 *
 * `User.email` and `User.supabaseAuthId` are both unique, so a duplicate
 * create can only mean a concurrent request already created the same person.
 * That loser re-reads the winner instead of surfacing a 500.
 */
export async function createOrAdoptProfile(input: {
  supabaseUserId: string;
  email: string;
  requestedRole: unknown;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
}): Promise<{ user: User; created: boolean } | { conflict: true }> {
  const role = sanitizeRegistrationRole(input.requestedRole);
  const data = {
    email: input.email,
    name: input.displayName?.trim() || input.email.split('@')[0],
    role,
    phone: input.phone ?? null,
    avatarUrl: input.avatarUrl ?? null,
    supabaseAuthId: input.supabaseUserId,
    sellerStatus: role === 'seller' || role === 'reseller' ? 'draft' : 'approved',
    emailVerified: input.emailVerified,
    emailVerifiedAt: input.emailVerified ? input.emailVerifiedAt ?? new Date() : null,
  };

  try {
    const user = await prisma.user.create({ data });
    return { user, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const raced = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { supabaseAuthId: input.supabaseUserId }],
      },
    });

    if (!raced) throw error;
    if (raced.email !== input.email || (raced.supabaseAuthId && raced.supabaseAuthId !== input.supabaseUserId)) {
      return { conflict: true };
    }

    return { user: raced, created: false };
  }
}

export async function resolveSupabaseIdentity(input: ResolveIdentityInput): Promise<IdentityResolution> {
  const email = normalizeEmail(input.email);
  // A canonical lookup on a malformed address is meaningless, so the shared
  // validator runs before any database work.
  if (!email || !isValidEmail(email)) return { status: 'invalid_email' };

  const provider = input.provider ?? null;
  const providerEmailVerified = Boolean(input.providerEmailVerified ?? input.emailVerified);

  // 1. A provider identity that is already linked is the strongest signal: it
  //    names exactly one LofiMart user regardless of the email on the profile.
  if (provider) {
    const linked = await prisma.providerAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: provider.provider,
          providerAccountId: provider.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (linked) {
      if (linked.user.supabaseAuthId && linked.user.supabaseAuthId !== input.supabaseUserId) {
        // The provider account is owned by a different Supabase identity.
        // Merging would hand one account's data to another, so refuse.
        return { status: 'link_conflict' };
      }

      const user = linked.user.supabaseAuthId
        ? linked.user
        : await prisma.user.update({
            where: { id: linked.user.id },
            data: {
              supabaseAuthId: input.supabaseUserId,
              emailVerified: linked.user.emailVerified || input.emailVerified,
              emailVerifiedAt: linked.user.emailVerifiedAt || (input.emailVerified ? new Date() : null),
              avatarUrl: linked.user.avatarUrl || input.avatarUrl || null,
            },
          });

      return { status: 'resolved', user, createdProfile: false, linkedProvider: true };
    }
  }

  // 2. Otherwise resolve by the canonical LofiMart email identity.
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.supabaseAuthId && existing.supabaseAuthId !== input.supabaseUserId) {
      // A different Supabase identity owns this email in the LofiMart
      // database. Linking OAuth by email string alone would be an account
      // takeover, so the user must sign in with the method they own.
      return { status: 'link_conflict' };
    }

    if (provider && !providerEmailVerified) {
      return { status: 'provider_email_unverified' };
    }

    if (!existing.emailVerified && !input.assumeVerifiedEmail) {
      return { status: 'email_unverified', identifier: email, phone: existing.phone ?? null };
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        supabaseAuthId: input.supabaseUserId,
        emailVerified: true,
        emailVerifiedAt: existing.emailVerifiedAt || new Date(),
        avatarUrl: existing.avatarUrl || input.avatarUrl || null,
        name: existing.name || input.displayName || null,
      },
    });

    let linkedProvider = false;
    if (provider) {
      const link = await linkProviderIdentity({
        userId: user.id,
        provider: provider.provider,
        providerAccountId: provider.providerAccountId,
        providerEmail: email,
        providerEmailVerified,
        metadata: { displayName: input.displayName ?? null, avatarUrl: input.avatarUrl ?? null, linkedFrom: 'resolve-identity' },
      });

      if (link === 'conflict') return { status: 'link_conflict' };
      linkedProvider = link === 'linked';
    }

    return { status: 'resolved', user, createdProfile: false, linkedProvider };
  }

  if (input.allowCreate === false) return { status: 'not_found' };

  const created = await createOrAdoptProfile({
    supabaseUserId: input.supabaseUserId,
    email,
    requestedRole: input.requestedRole,
    emailVerified: input.emailVerified,
    emailVerifiedAt: input.emailVerifiedAt ?? null,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    phone: input.phone,
  });

  if ('conflict' in created) return { status: 'link_conflict' };

  let linkedProvider = false;
  if (provider) {
    const link = await linkProviderIdentity({
      userId: created.user.id,
      provider: provider.provider,
      providerAccountId: provider.providerAccountId,
      providerEmail: email,
      providerEmailVerified,
      metadata: { displayName: input.displayName ?? null, avatarUrl: input.avatarUrl ?? null, linkedFrom: 'resolve-identity' },
    });

    if (link === 'conflict') return { status: 'link_conflict' };
    linkedProvider = link === 'linked';
  }

  return { status: 'resolved', user: created.user, createdProfile: created.created, linkedProvider };
}