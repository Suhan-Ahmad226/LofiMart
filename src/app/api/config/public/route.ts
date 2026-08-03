import { NextResponse } from 'next/server';
import { getPublicEnv, getServerEnv } from '../../../../lib/env';
import { edgeCacheControl } from '../../../../server/httpCache';
import { secureApiRoute } from '../../../../server/next/apiSecurity';
import { apiSuccess } from '../../../../lib/api-response';

export const runtime = 'nodejs';

function getProtocolFromHeaders(headers: Headers): 'http' | 'https' {
  const forwarded = headers.get('x-forwarded-proto');
  if (forwarded === 'https') return 'https';
  return 'http';
}

function hostnameFromHost(host: string): string {
  // host can include port (example: localhost:3000)
  return host.split(':')[0] || 'localhost';
}

export async function GET(req: Request) {
  const securityResult = await secureApiRoute(req, {
    keyPrefix: 'api:config:public',
    limit: 120,
    enforceOriginForMutations: false,
  });
  if (securityResult instanceof NextResponse) return securityResult;

  const serverEnv = getServerEnv();
  const publicEnv = getPublicEnv();
  const wsPort = serverEnv.WS_PORT;

  const url = new URL(req.url);
  const host = req.headers.get('host') || url.host || `localhost:${process.env.PORT || 3000}`;
  const proto = getProtocolFromHeaders(req.headers);
  const wsProto = proto === 'https' ? 'wss' : 'ws';

  const inventoryWs =
    publicEnv.NEXT_PUBLIC_INVENTORY_WS && publicEnv.NEXT_PUBLIC_INVENTORY_WS.length
      ? publicEnv.NEXT_PUBLIC_INVENTORY_WS
      : `${wsProto}://${hostnameFromHost(host)}:${wsPort}`;

  return apiSuccess(
    {
      inventoryWs,
      webPushPublicKey: publicEnv.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || serverEnv.WEB_PUSH_PUBLIC_KEY || '',
    },
    {
      headers: {
        'cache-control': edgeCacheControl({
          browserTtlSeconds: 60,
          edgeTtlSeconds: 300,
          staleWhileRevalidateSeconds: 600,
        }),
      },
    },
  );
}
