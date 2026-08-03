import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from './errorHandler';

type ValidationSource = 'body' | 'query' | 'params';

function extractData(req: Request, source: ValidationSource): unknown {
  switch (source) {
    case 'body':
      return req.body;
    case 'query':
      return req.query;
    case 'params':
      return req.params;
  }
}

export function validate(schema: z.ZodType, source: ValidationSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const data = extractData(req, source);
    const result = schema.safeParse(data);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || 'root';
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }
      next(new ValidationError('Validation failed', fieldErrors));
      return;
    }

    if (source === 'body') req.body = result.data;
    if (source === 'query') req.query = result.data as unknown as typeof req.query;
    if (source === 'params') req.params = result.data as unknown as typeof req.params;

    next();
  };
}

export function validateBody(schema: z.ZodType) {
  return validate(schema, 'body');
}

export function validateQuery(schema: z.ZodType) {
  return validate(schema, 'query');
}

export function validateParams(schema: z.ZodType) {
  return validate(schema, 'params');
}

export const commonSchemas = {
  idParam: z.object({
    id: z.string().min(1, 'ID is required'),
  }),

  paginationQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['asc', 'desc']).default('desc'),
  }),

  searchQuery: z.object({
    q: z.string().min(1).max(500).trim(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  emailBody: z.object({
    email: z.string().email('Invalid email address'),
  }),

  phoneBody: z.object({
    phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
  }),

  uuidParam: z.object({
    id: z.string().uuid('Invalid ID format'),
  }),

  slugParam: z.object({
    slug: z.string().min(1, 'Slug is required').max(200),
  }),
};
