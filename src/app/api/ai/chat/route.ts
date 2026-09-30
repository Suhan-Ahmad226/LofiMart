import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'AI chat is not configured. Please install @google/generative-ai to enable this feature.' },
    { status: 501 },
  );
}
