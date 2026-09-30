import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server';
import { createSupabaseServerClient } from '../supabase/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LinkProviderSchema = z.object({
  accessToken: z.string().min(1),
});

type SupabaseUser = Awaited<ReturnType<ReturnType<typeof createSupabaseServerClient>['auth']['getUser']>>['data']['user'];

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

export async function POST(request: NextRequest) {
  try {
    const { getCurrentUser } = await import('@/server/auth');
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const localUserId = currentUser.userId;

    const body = LinkProviderSchema.parse(await request.json());
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(body.accessToken);

    if (error || !data.user) {
      return NextResponse.json({ error: 'Supabase session not found' }, { status: 401 });
    }

    const supabaseUser = data.user;
    const providerIdentity = getProviderIdentity(supabaseUser);

    if (!providerIdentity) {
      return NextResponse.json(
        { error: 'এই সেশনে কোনো OAuth প্রোভাইডার নেই (email/password সেশন)। Linking করা যাবে না।', code: 'NO_PROVIDER_IDENTITY' },
        { status: 400 },
      );
    }

    const linkedElsewhere = await prisma.providerAccount.findFirst({
      where: {
        provider: providerIdentity.provider,
        providerAccountId: providerIdentity.providerAccountId,
        userId: { not: localUserId },
      },
      select: { userId: true },
    });

    if (linkedElsewhere) {
      return NextResponse.json(
        { error: 'এই অ্যাকাউন্টটি ইতিমধ্যে অন্য একটি LofiMart অ্যাকাউন্টের সাথে linked। Linking করা যাবে না।', code: 'ALREADY_LINKED_ELSEWHERE' },
        { status: 409 },
      );
    }

    const providerEmail = supabaseUser.email ?? null;
    const providerEmailVerified = Boolean(supabaseUser.email_confirmed_at);

    if (providerEmail && providerEmailVerified) {
      const emailConflict = await prisma.user.findFirst({
        where: {
          email: providerEmail,
          id: { not: localUserId },
          OR: [{ emailVerified: true }, { supabaseAuthId: { not: null } }],
        },
        select: { id: true },
      });

      if (emailConflict) {
        return NextResponse.json(
          { error: 'এই OAuth ইমেইলটি অন্য একটি verified LofiMart অ্যাকাউন্টের। Linking করা যাবে না।', code: 'EMAIL_CONFLICT' },
          { status: 409 },
        );
      }
    }

    await prisma.providerAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: providerIdentity.provider,
          providerAccountId: providerIdentity.providerAccountId,
        },
      },
      create: {
        userId: localUserId,
        provider: providerIdentity.provider,
        providerAccountId: providerIdentity.providerAccountId,
        providerEmail: providerEmail,
        providerEmailVerified,
        metadata: { linkedFrom: 'link-provider' } as never,
      },
      update: {
        userId: localUserId,
        providerEmail: providerEmail || undefined,
        providerEmailVerified,
      },
    });

    await prisma.user.updateMany({
      where: { id: localUserId, supabaseAuthId: null },
      data: { supabaseAuthId: supabaseUser.id },
    });

    return NextResponse.json({ success: true, linked: providerIdentity.provider });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Linking অনুরোধটি সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'লিংকিং ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}
