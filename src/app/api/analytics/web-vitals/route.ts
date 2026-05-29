import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name : '';
    const value = Number(body?.value);
    const route = typeof body?.route === 'string' ? body.route : '';

    if (!name || !Number.isFinite(value) || !route) {
      return NextResponse.json({ error: 'Invalid analytics payload' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
