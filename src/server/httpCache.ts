export function edgeCacheControl(options: {
  browserTtlSeconds?: number;
  edgeTtlSeconds?: number;
  staleWhileRevalidateSeconds?: number;
}) {
  const parts: string[] = [];

  if (options.browserTtlSeconds != null) {
    parts.push(`max-age=${options.browserTtlSeconds}`);
  }

  if (options.edgeTtlSeconds != null) {
    parts.push(`s-maxage=${options.edgeTtlSeconds}`);
  }

  if (options.staleWhileRevalidateSeconds != null) {
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidateSeconds}`);
  }

  return parts.join(', ') || 'no-store';
}

export function privateNoStore() {
  return 'private, no-store, no-cache, must-revalidate';
}

export function publicCache(maxAgeSeconds: number, sMaxAgeSeconds?: number) {
  const parts = [`public, max-age=${maxAgeSeconds}`];
  if (sMaxAgeSeconds != null) {
    parts.push(`s-maxage=${sMaxAgeSeconds}`);
  }
  return parts.join(', ');
}
