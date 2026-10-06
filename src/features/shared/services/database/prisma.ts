import { PrismaClient } from '@prisma/client';
import { getTenantContext } from './tenantContext';

declare global {
  var __amarshopPrisma__: PrismaClient | undefined;
}

const tenantScopedModels = new Set([
  'User',
  'Product',
  'Order',
  'Warehouse',
  'Store',
]);

function withTenantFilter(args: Record<string, any>, tenantId: string) {
  const nextArgs = { ...args };
  nextArgs.where = {
    ...(nextArgs.where || {}),
    tenantId,
  };
  return nextArgs;
}

function buildRuntimeDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error('DATABASE_URL is required');
  }

  try {
    const url = new URL(raw);
    // Vercel/serverless creates many short-lived Prisma clients. Prisma's
    // default pool (often 15 connections) can exhaust Supabase session-pooler
    // limits under normal concurrency. Start with one connection per function
    // and let the external pooler absorb concurrency.
    url.searchParams.set('connection_limit', '1');
    return url.toString();
  } catch {
    // Preserve the existing value if a non-standard DATABASE_URL is supplied;
    // env validation will report the malformed URL elsewhere.
    return raw;
  }
}

const basePrisma =
  globalThis.__amarshopPrisma__ ??
  new PrismaClient({
    datasourceUrl: buildRuntimeDatabaseUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__amarshopPrisma__ = basePrisma;
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const context = getTenantContext();
        const tenantId = context.tenantId;

        if (!tenantId || context.bypass || !model || !tenantScopedModels.has(model)) {
          return query(args);
        }

        // Prisma's extended unique selectors allow a unique field plus
        // non-unique predicates such as tenantId. Keep the tenant predicate on
        // every tenant-owned read/write operation so an ID alone can never cross
        // the active tenant boundary.
        if ([
          'findUnique',
          'findFirst',
          'findMany',
          'count',
          'aggregate',
          'update',
          'updateMany',
          'delete',
          'deleteMany',
          'upsert',
        ].includes(operation)) {
          return query(withTenantFilter(args as Record<string, any>, tenantId));
        }

        if (['create', 'createMany'].includes(operation)) {
          const nextArgs = { ...(args as Record<string, any>) };

          if (nextArgs.data) {
            if (Array.isArray(nextArgs.data)) {
              nextArgs.data = nextArgs.data.map((item) => ({ ...item, tenantId }));
            } else {
              nextArgs.data = { ...nextArgs.data, tenantId };
            }
          }

          if (nextArgs.where) {
            nextArgs.where = {
              ...nextArgs.where,
              tenantId,
            };
          }

          return query(nextArgs);
        }

        return query(args);
      },
    },
  },
});

export const prismaDirect = basePrisma;

export async function checkDatabaseHealth() {
  const startedAt = Date.now();
  await prisma.$queryRaw`SELECT 1`;

  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    provider: 'postgresql',
  };
}
