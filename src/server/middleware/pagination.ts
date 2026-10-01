export type PaginationRequest = {
  query: Record<string, unknown>;
};

export type NextRequestLike = {
  nextUrl?: { searchParams?: URLSearchParams };
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

function normalizePaginationRequest(request: PaginationRequest | NextRequestLike): PaginationRequest {
  if ('query' in request && request.query && typeof request.query === 'object') return request;
  if ('nextUrl' in request) {
    const searchParams = request.nextUrl?.searchParams;
    return { query: searchParams ? Object.fromEntries(searchParams.entries()) : {} };
  }
  return { query: {} };
}

export function parsePagination(
  request: PaginationRequest | NextRequestLike,
  options: { maxLimit?: number; defaultLimit?: number } = {},
): ParsedPagination {
  const maxLimit = options.maxLimit ?? PAGINATION.MAX_LIMIT;
  const defaultLimit = options.defaultLimit ?? PAGINATION.DEFAULT_LIMIT;
  const normalized = normalizePaginationRequest(request);
  const pageSizeParam = normalized.query.pageSize;
  const pageParam = normalized.query.page;
  const limitParam = normalized.query.limit;
  const offsetParam = normalized.query.offset;
  const hasPageStyle = pageSizeParam !== undefined || pageParam !== undefined;
  if (hasPageStyle) {
    const pageSize = clampInteger(pageSizeParam, defaultLimit, 1, maxLimit);
    const page = clampInteger(pageParam, 1, 1, Number.MAX_SAFE_INTEGER);
    return { limit: pageSize, offset: (page - 1) * pageSize, page };
  }
  const limit = clampInteger(limitParam, defaultLimit, 1, maxLimit);
  const offset = clampInteger(offsetParam, PAGINATION.DEFAULT_OFFSET, 0, Number.MAX_SAFE_INTEGER);
  return { limit, offset, page: Math.floor(offset / limit) + 1 };
}

export function buildPrismaPagination(
  request: PaginationRequest | NextRequestLike,
  options?: { maxLimit?: number; defaultLimit?: number },
) {
  const { limit, offset, page } = parsePagination(request, options);
  return { skip: offset, take: limit, meta: { page, limit, offset } };
}