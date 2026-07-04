export function edgeCacheControl({
  browserTtlSeconds = 60,
  edgeTtlSeconds = 300,
  staleWhileRevalidateSeconds = 600,
} = {}) {
  return [
    `public, max-age=${browserTtlSeconds}`,
    `s-maxage=${edgeTtlSeconds}`,
    `stale-while-revalidate=${staleWhileRevalidateSeconds}`,
  ].join(', ');
}

export function privateNoStore() {
  return 'private, no-store, max-age=0';
}
