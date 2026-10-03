import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createOrAdoptProfile } from '@/features/auth/server/identity-resolution';

export const AUTH_ROLES = ['customer', 'seller', 'reseller'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && (AUTH_ROLES as readonly string[]).includes(value);
}

export function normalizeAuthRole(value: unknown): AuthRole {
  return isAuthRole(value) ? value : 'customer';
}

/**
 * Picks the OAuth identity attached to a Supabase session. Email identities are
 * skipped: they are already represented by the user's own email address.
 */
export function extractProviderIdentity(
  supabaseUser: SupabaseUser | null | undefined,
): { provider: string; providerAccountId: string } | null {
  const identities = Array.isArray(supabaseUser?.identities) ? supabaseUser.identities : [];
  const oauthIdentity = identities.find(
    (identity) => identity && identity.provider !== 'email' && identity.id,
  );

  if (oauthIdentity?.provider && oauthIdentity.id) {
    return { provider: oauthIdentity.provider, providerAccountId: oauthIdentity.id };
  }

  return null;
}

export function extractSupabaseAvatarUrl(supabaseUser: SupabaseUser | null | undefined): string | null {
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

export function createSupabaseServerClient(useServiceRole = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase auth is not configured for this environment.');
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function formatAuthUser(user: {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  alternatePhone: string | null;
  role: string;
  avatarUrl: string | null;
  bio: string | null;
  storeName: string | null;
  storefrontSlug: string | null;
  storefrontBannerUrl: string | null;
  storefrontHeadline: string | null;
  sellerStatus: string;
  points: number;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    phone: user.phone || undefined,
    alternate_phone: user.alternatePhone,
    role: user.role,
    avatar_url: user.avatarUrl,
    bio: user.bio,
    store_name: user.storeName,
    storefront_slug: user.storefrontSlug,
    storefront_banner_url: user.storefrontBannerUrl,
    storefront_headline: user.storefrontHeadline,
    seller_status: user.sellerStatus,
    points: user.points,
    email_verified: user.emailVerified ? 1 : 0,
    email_verified_at: user.emailVerifiedAt?.toISOString(),
  };
}

/**
 * Creates the application profile for a Supabase identity.
 *
 * Delegates to the shared identity layer so a profile is only ever created in
 * one place, with the same uniqueness and race handling as every other flow.
 */
export async function createLocalUserFromSupabase(input: {
  email: string;
  name?: string | null;
  role?: unknown;
  emailVerified?: boolean;
  emailVerifiedAt?: Date | null;
  phone?: string | null;
  avatarUrl?: string | null;
  supabaseAuthId?: string | null;
}) {
  const result = await createOrAdoptProfile({
    supabaseUserId: input.supabaseAuthId || `pending:${input.email.toLowerCase()}`,
    email: input.email,
    requestedRole: input.role,
    emailVerified: Boolean(input.emailVerified),
    emailVerifiedAt: input.emailVerifiedAt ?? null,
    displayName: input.name,
    avatarUrl: input.avatarUrl,
    phone: input.phone,
  });

  if ('conflict' in result) {
    throw new Error('An account already exists for this identity.');
  }

  return result.user;
}
