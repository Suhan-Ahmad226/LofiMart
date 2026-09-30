export type PaginationRequest = {
  query: Record<string, unknown>;
};

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0,
} as const;

export type ParsedPagination = {
  limit: number;
  offset: number;
  page: number;
};

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/**
 * Parses `limit`/`offset` (or `page`/`pageSize`) query parameters, applying
 * safe lower and upper bounds. Ensures a single request cannot request an
 * unbounded or oversized result set.
 */
export function parsePagination(
  request: PaginationRequest,
  options: { maxLimit?: number; defaultLimit?: number } = {},
): ParsedPagination {
  const maxLimit = options.maxLimit ?? PAGINATION.MAX_LIMIT;
  const defaultLimit = options.defaultLimit ?? PAGINATION.DEFAULT_LIMIT;

  const pageSizeParam = request.query.pageSize;
  const pageParam = request.query.page;
  const limitParam = request.query.limit;
  const offsetParam = request.query.offset;

  const hasPageStyle = pageSizeParam !== undefined || pageParam !== undefined;

  if (hasPageStyle) {
    const pageSize = clampInteger(pageSizeParam, defaultLimit, 1, maxLimit);
    const page = clampInteger(pageParam, 1, 1, Number.MAX_SAFE_INTEGER);
    return {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      page,
    };
  }

  const limit = clampInteger(limitParam, defaultLimit, 1, maxLimit);
  const offset = clampInteger(offsetParam, PAGINATION.DEFAULT_OFFSET, 0, Number.MAX_SAFE_INTEGER);

  return {
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
  };
}

/**
 * Builds the `skip`/`take` shape + count for Prisma `findMany`, and a stable
 * `meta` block describing the pagination window for API responses.
 */
export function buildPrismaPagination(request: PaginationRequest, options?: { maxLimit?: number; defaultLimit?: number }) {
  const { limit, offset, page } = parsePagination(request, options);
  return {
    skip: offset,
    take: limit,
    meta: {
      page,
      limit,
      offset,
    },
  };
}