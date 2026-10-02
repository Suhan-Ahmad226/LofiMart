import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({ identifier: z.string().trim().min(1).max(320) });

export async function POST(request: NextRequest) {
  try {
    const { identifier } = Schema.parse(await request.json());
    const classified = classifyLoginIdentifier(identifier);

    if (classified.type === 'invalid') {
      return NextResponse.json({ exists: false });
    }

    const user = classified.type === 'email'
      ? await prisma.user.findUnique({ where: { email: classified.value }, select: { id: true } })
      : await prisma.user.findFirst({ where: { phone: classified.value }, select: { id: true } });

    return NextResponse.json({ exists: Boolean(user) });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
