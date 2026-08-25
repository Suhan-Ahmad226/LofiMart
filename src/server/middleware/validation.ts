import { z } from 'zod';
import { ValidationError } from './errorHandler';

type NextFunction = (error?: unknown) => void;

interface ExpressLikeRequest {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

function formatZodIssues(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

function parseSource(
  req: ExpressLikeRequest,
  source: 'body' | 'query' | 'params',
): unknown {
  if (source === 'body') return req.body;
  if (source === 'query') return req.query;
  return req.params;
}

function createValidationMiddleware(
  schema: z.ZodType,
  source: 'body' | 'query' | 'params' = 'body',
) {
  return (req: ExpressLikeRequest, _res: unknown, next: NextFunction): void => {
    const result = schema.safeParse(parseSource(req, source));

    if (!result.success) {
      next(new ValidationError('Validation failed', formatZodIssues(result.error)));
      return;
    }

    if (source === 'body') req.body = result.data;
    else if (source === 'query') req.query = result.data;
    else req.params = result.data;

    next();
  };
}

export const validate = createValidationMiddleware;
export const validateBody = (schema: z.ZodType) => createValidationMiddleware(schema, 'body');
export const validateQuery = (schema: z.ZodType) => createValidationMiddleware(schema, 'query');
export const validateParams = (schema: z.ZodType) => createValidationMiddleware(schema, 'params');

export const commonSchemas = {
  idParam: z.object({
    id: z.string().min(1, 'id is required'),
  }),
  uuidParam: z.object({
    id: z.string().uuid('must be a valid UUID'),
  }),
  slugParam: z.object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a slug like my-product'),
  }),
  paginationQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['asc', 'desc']).default('desc'),
  }),
  searchQuery: z.object({
    q: z.string().min(1, 'q is required'),
  }),
  emailBody: z.object({
    email: z.string().email('must be a valid email'),
  }),
};
