import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ compat?: string[] }>;

function retiredResponse(request: NextRequest, path: string) {
  return NextResponse.json(
    {
      error: 'API endpoint retired',
      code: 'API_ENDPOINT_RETIRED',
      path: `/api/${path}`,
      migration: 'Use the canonical /api/* endpoint for this operation.',
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        'Deprecation': 'true',
        'Sunset': '0',
      },
    },
  );
}

async function handle(request: NextRequest, params: Params) {
  const { compat = [] } = await params;
  const path = compat.join('/');
  return retiredResponse(request, path);
}

export function GET(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function POST(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function PUT(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function PATCH(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function DELETE(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}
