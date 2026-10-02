import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({ email: z.string().email().transform(v => v.trim().toLowerCase()) });

export async function POST(request: NextRequest) {
  try {
    const { email } = Schema.parse(await request.json());
    const ip = getClientIp(request);
    const { allowed } = await takeRateLimit(`auth:pre-register:${email}:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!allowed) return NextResponse.json({ error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।', code: 'RATE_LIMITED' }, { status: 429 });

    const { prisma } = await import('@/lib/server');
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (existing?.emailVerified) return NextResponse.json({ error: 'Account already exists. Please login.', code: 'ACCOUNT_EXISTS' }, { status: 409 });

    const supabase = createSupabaseServerClient(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return NextResponse.json({ error: 'Unable to send verification code right now.', code: 'SEND_FAILED' }, { status: 400 });

    return NextResponse.json({ success: true, resendInSeconds: 60 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send verification code.' }, { status: 500 });
  }
}
