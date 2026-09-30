import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'Direct browser uploads are disabled. Use /api/media/upload.' },
    { status: 410 },
  );
}
