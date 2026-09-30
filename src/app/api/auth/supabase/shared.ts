import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/server';

export const AUTH_ROLES = ['customer', 'seller', 'reseller'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && (AUTH_ROLES as readonly string[]).includes(value);
}

export function normalizeAuthRole(value: unknown): AuthRole {
  return isAuthRole(value) ? value : 'customer';
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
  const role = normalizeAuthRole(input.role);

  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name || input.email.split('@')[0],
      role,
      phone: input.phone || null,
      avatarUrl: input.avatarUrl || null,
      supabaseAuthId: input.supabaseAuthId || null,
      sellerStatus: role === 'seller' || role === 'reseller' ? 'draft' : 'approved',
      emailVerified: Boolean(input.emailVerified),
      emailVerifiedAt: input.emailVerified ? input.emailVerifiedAt || new Date() : null,
    },
  });
}
