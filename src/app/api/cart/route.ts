import { NextRequest, NextResponse } from 'next/server';
import { readUserCart, requireApiUser, writeUserCart } from '../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const items = await readUserCart(user.id);
  return NextResponse.json({ items });
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  await writeUserCart(user.id, items);

  return NextResponse.json({ success: true });
}
