/**
 * Courier administrative operations, expressed provider-neutrally.
 *
 * Everything the seller onboarding flow and the admin logistics screen need that
 * is *not* the core quote/book/track path: browsing a courier's location
 * hierarchy, listing and registering pickup points, and probing provider health.
 *
 * This exists so those two surfaces call `listCourierStores('pathao')` rather than
 * branching on a courier name. When a second courier is registered, both surfaces
 * work against it unchanged.
 */

import type { Prisma } from '@prisma/client';

import { prismaDirect } from '../../shared/services/database/prisma';
import { logger } from '../../../lib/logger';
import type {
  CourierHealthReport,
  CourierLocationNode,
  CourierLocationRef,
  CourierStoreCreateInput,
  CourierStoreCreateResult,
  CourierStoreRef,
} from '../core/contracts';
import { CourierValidationError } from '../core/errors';
import type { CourierCapabilities } from '../core/capabilities';
import { requireCourierProvider } from '../registry/providerRegistry';

const LOCATION_CACHE_PREFIX = 'courier:locations';
const LOCATION_CACHE_TTL_SECONDS = 60 * 60 * 6;

function cachePrefix(): string {
  return LOCATION_CACHE_PREFIX;
}

/* -------------------------------------------------------------- locations */

/**
 * One level of a courier's location hierarchy.
 *
 * Cached, because a seller stepping through city → zone → area re-requests the
 * parent list on every selection, and a checkout render resolves a city on every
 * load. The cache is keyed per provider so a second courier gets its own entries.
 */
export async function listCourierLocations(
  providerCode: string,
  input: { level: CourierLocationNode['level']; parentId?: string | null },
): Promise<CourierLocationNode[]> {
  const provider = requireCourierProvider(providerCode);

  if (!provider.getCapabilities().locationLookup || !provider.listLocations) {
    throw new CourierValidationError(providerCode, 'This courier does not publish a location directory.');
  }

  const key = `${cachePrefix()}:${providerCode}:${input.level}:${input.parentId ?? 'root'}`;

  const cached = await readCache<CourierLocationNode[]>(key);
  if (cached) return cached;

  const nodes = await provider.listLocations({
    level: input.level,
    parentId: input.parentId ?? null,
  });

  // A cache failure must degrade to a slower response, never to an error at
  // checkout, so a write error is deliberately not fatal.
  await writeCache(key, nodes);
  return nodes;
}

async function readCache<T>(key: string): Promise<T | null> {
  const { ensureRedis } = await import('../../shared/services/messaging/redis');
  const raw = await ensureRedis()
    .then((redis) => redis.get(key))
    .catch(() => null);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: unknown): Promise<void> {
  const { ensureRedis } = await import('../../shared/services/messaging/redis');
  await ensureRedis()
    .then((redis) => redis.set(key, JSON.stringify(value), 'EX', LOCATION_CACHE_TTL_SECONDS))
    .catch(() => undefined);
}

/**
 * Invalidates a courier's cached location directory.
 *
 * Separate from the TTL because a courier can add a serviceable city without
 * waiting six hours, and an operator fixing a mapping problem needs the fix to
 * take effect now.
 */
export async function refreshCourierLocations(providerCode: string): Promise<void> {
  const { ensureRedis } = await import('../../shared/services/messaging/redis');

  // Scoped to this provider so refreshing Pathao cannot evict a second courier's
  // directory, and vice versa.
  const pattern = `${cachePrefix()}:${providerCode}:*`;

  await ensureRedis()
    .then(async (redis) => {
      const keys: string[] = [];
      let cursor = '0';

      // SCAN rather than KEYS: KEYS blocks the Redis event loop, and an admin
      // action must never stall every other queued job.
      do {
        const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== '0');

      if (keys.length > 0) await redis.del(...keys);
    })
    .catch((error: unknown) => {
      logger.warn('Could not refresh the courier location cache.', {
        providerCode,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    });
}

/* ----------------------------------------------------------------- stores */

export async function listCourierStores(providerCode: string): Promise<CourierStoreRef[]> {
  const provider = requireCourierProvider(providerCode);
  assertStoreManagement(provider);

  return provider.listStores!();
}

/**
 * Registers a warehouse as a courier pickup point.
 *
 * Idempotent, and that is the whole point of this function rather than a thin
 * pass-through to the adapter. Registering a store is a POST with no idempotency
 * key, and Pathao takes up to an hour to approve one, so a naive "create on
 * demand" would give a merchant two pickup points for a single warehouse the
 * first time a request timed out. The order of operations is:
 *
 *   1. a mapping that already has a real courier id wins, whatever its approval
 *      state — the store exists, it is only the courier's review that is pending;
 *   2. a mapping whose id is still a sentinel means we created a store and never
 *      learned its id, so re-list and match on name. This is the recovery path and
 *      it is the *only* path that may run against an existing row, because
 *      creating a second store for a warehouse that already has one is precisely
 *      the failure this function exists to prevent;
 *   3. with no mapping at all, re-list by name to adopt a store created by a
 *      request whose response never arrived, and only create one if that finds
 *      nothing.
 */
export async function registerCourierStore(input: {
  providerCode: string;
  warehouseId: string;
  store: CourierStoreCreateInput;
}): Promise<CourierStoreCreateResult & { mapping: CourierStoreMappingView; created: boolean }> {
  const { providerCode, warehouseId, store } = input;
  const provider = requireCourierProvider(providerCode);
  assertStoreManagement(provider);

  const existing = await prismaDirect.courierStoreMapping.findFirst({
    where: { provider: providerCode, warehouseId },
  });

  if (existing && !isUnresolvedStoreId(existing.externalStoreId)) {
    return {
      provider: providerCode,
      externalStoreId: existing.externalStoreId,
      externalStoreName: existing.externalStoreName,
      approved: existing.status === 'active',
      message: 'This pickup point is already registered with the courier.',
      created: false,
      mapping: toMappingView(existing),
    };
  }

  // A sentinel id means the courier may already hold this store from an earlier
  // attempt whose response was lost. Re-list and match by name. If nothing matches,
  // the store is *not* created again: the request that made it may still be in
  // flight, or the courier's list may simply be behind. Creating a second store
  // here is the one outcome that cannot be undone, so the safe answer is to leave
  // the row pending and let the next attempt look again.
  if (existing) {
    const recovered = await adoptExistingStore({
      providerCode,
      warehouseId,
      store,
      mappingId: existing.id,
    });

    return {
      provider: providerCode,
      externalStoreId: recovered?.externalStoreId ?? existing.externalStoreId,
      externalStoreName: recovered?.externalStoreName ?? existing.externalStoreName,
      approved: recovered?.active === true,
      message:
        recovered?.active === true
          ? 'Pickup point approved by the courier and is ready to book against.'
          : 'Pickup point is registered and awaiting courier approval. It will be checked again on the next attempt.',
      created: false,
      mapping: recovered
        ? await persistMapping({
            providerCode,
            warehouseId,
            externalStoreId: recovered.externalStoreId,
            externalStoreName: recovered.externalStoreName ?? null,
            active: recovered.active === true,
            status: recovered.active === true ? 'active' : 'pending',
            location: store.location,
            lastError: null,
          })
        : toMappingView(existing),
    };
  }

  // Recover a store created by a request whose response never arrived. Matching
  // on the exact store name is safe because the name is unique per warehouse and
  // is the field Pathao echoes back on creation.
  const remoteName = store.name.trim().toLowerCase();
  const remote = await provider.listStores!();
  const match = remote.find(
    (candidate) => (candidate.externalStoreName ?? '').trim().toLowerCase() === remoteName,
  );

  if (match) {
    const mapping = await persistMapping({
      providerCode,
      warehouseId,
      externalStoreId: match.externalStoreId,
      externalStoreName: match.externalStoreName ?? null,
      active: match.active === true,
      status: match.active === true ? 'active' : 'pending',
      location: store.location,
      lastError: null,
    });

    return {
      provider: providerCode,
      externalStoreId: match.externalStoreId,
      externalStoreName: match.externalStoreName ?? null,
      approved: match.active === true,
      message: 'Found an existing pickup point at the courier and linked it to this warehouse.',
      created: false,
      mapping,
    };
  }

  const result = await provider.createStore!(store);

  // The create response has no id, so read it back. A failure here is not fatal:
  // the mapping is written as `pending` with no id and the next attempt recovers
  // it by name.
  let externalStoreId: string | null = result.externalStoreId;
  if (!externalStoreId) {
    try {
      const after = await provider.listStores!();
      const found = after.find(
        (candidate) =>
          (candidate.externalStoreName ?? '').trim().toLowerCase() === remoteName,
      );
      externalStoreId = found?.externalStoreId ?? null;
    } catch (error) {
      logger.warn('Could not read back a newly created courier store.', {
        providerCode,
        warehouseId,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const mapping = await persistMapping({
    providerCode,
    warehouseId,
    externalStoreId,
    externalStoreName: result.externalStoreName ?? store.name,
    // A store the courier has not approved yet is stored as `pending` so the
    // booking path can refuse it with a clear message instead of sending parcels
    // to a pickup point the courier has not accepted.
    active: result.approved === true,
    status: result.approved ? 'active' : 'pending',
    location: store.location,
    // Not an error: an unapproved store is a normal intermediate state, so the
    // courier's own explanatory message is not recorded as a failure.
    lastError: null,
  });

  return { ...result, externalStoreId, mapping, created: true };
}

export type CourierStoreMappingView = {
  id: string;
  provider: string;
  warehouseId: string;
  externalStoreId: string;
  externalStoreName: string | null;
  status: string;
  isActive: boolean;
  cityId: number | null;
  zoneId: number | null;
  areaId: number | null;
  verifiedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Placeholder id for a store we created but have not yet been able to identify.
 *
 * The schema requires an id, and inventing a real-looking one would be worse than
 * an obviously fake one: a fabricated id would be sent to the courier at booking
 * time. The `pending:` prefix is checked before booking, so it can never escape.
 */
const UNRESOLVED_STORE_ID_PREFIX = 'pending:';

function isUnresolvedStoreId(externalStoreId: string): boolean {
  return externalStoreId.startsWith(UNRESOLVED_STORE_ID_PREFIX);
}

/**
 * Looks for a previously created store at the courier, by name.
 *
 * Returns `null` on both "not there" and "could not ask" — a listing failure must
 * not be read as proof that the store is missing, because acting on that belief is
 * how duplicates get created.
 */
async function adoptExistingStore(input: {
  providerCode: string;
  warehouseId: string;
  store: CourierStoreCreateInput;
  mappingId: string;
}): Promise<CourierStoreRef | null> {
  const provider = requireCourierProvider(input.providerCode);
  assertStoreManagement(provider);

  const targetName = input.store.name.trim().toLowerCase();

  try {
    const remote = await provider.listStores!();
    return (
      remote.find(
        (candidate) => (candidate.externalStoreName ?? '').trim().toLowerCase() === targetName,
      ) ?? null
    );
  } catch (error) {
    logger.warn('Could not re-list courier stores while recovering a mapping.', {
      providerCode: input.providerCode,
      warehouseId: input.warehouseId,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

function toMappingView(row: {
  id: string;
  provider: string;
  warehouseId: string;
  externalStoreId: string;
  externalStoreName: string | null;
  status: string;
  isActive: boolean;
  cityId: number | null;
  zoneId: number | null;
  areaId: number | null;
  verifiedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CourierStoreMappingView {
  return { ...row };
}

async function persistMapping(input: {
  providerCode: string;
  warehouseId: string;
  externalStoreId: string | null;
  externalStoreName: string | null;
  active: boolean;
  status?: string;
  location: CourierLocationRef;
  lastError?: string | null;
}): Promise<CourierStoreMappingView> {
  const { providerCode, warehouseId, location } = input;

  // `externalStoreId` is required by the schema, so a store whose id could not be
  // discovered yet is tracked with a sentinel and recovered by name on the next
  // attempt. Deleting the row instead would lose the "we already created one" fact
  // that makes the whole flow idempotent.
  const externalStoreId = input.externalStoreId ?? `${UNRESOLVED_STORE_ID_PREFIX}${warehouseId}`;

  const row = await prismaDirect.courierStoreMapping.upsert({
    where: { provider_warehouseId: { provider: providerCode, warehouseId } },
    create: {
      provider: providerCode,
      warehouseId,
      externalStoreId,
      externalStoreName: input.externalStoreName,
      status: input.status ?? (input.active ? 'active' : 'pending'),
      isActive: input.active,
      cityId: location.cityId,
      zoneId: location.zoneId,
      areaId: location.areaId,
      lastError: input.lastError ?? null,
    },
    update: {
      externalStoreId,
      externalStoreName: input.externalStoreName,
      status: input.status ?? (input.active ? 'active' : 'pending'),
      isActive: input.active,
      cityId: location.cityId,
      zoneId: location.zoneId,
      areaId: location.areaId,
      ...(input.active ? { verifiedAt: new Date() } : {}),
      lastError: input.lastError ?? null,
    },
  });

  return toMappingView(row);
}

/**
 * The pickup point mapped to a warehouse, or `null` when none is registered.
 *
 * Returns `null` rather than a partially mapped store so the booking path cannot
 * pass a warehouse without a usable pickup point into a courier call.
 */
export async function findCourierStoreMapping(
  providerCode: string,
  warehouseId: string | null,
): Promise<CourierStoreRef | null> {
  if (!warehouseId) return null;

  const mapping = await prismaDirect.courierStoreMapping.findFirst({
    where: { provider: providerCode, warehouseId },
  });

  // A store awaiting courier approval cannot be booked against, so it is treated
  // as unmapped. The mapping row survives, so the seller UI can still explain the
  // situation rather than showing an empty picker.
  if (!mapping || !mapping.isActive || mapping.status !== 'active') return null;
  if (isUnresolvedStoreId(mapping.externalStoreId)) return null;

  return {
    provider: providerCode,
    externalStoreId: mapping.externalStoreId,
    externalStoreName: mapping.externalStoreName,
    active: true,
    metadata: {
      warehouseId: mapping.warehouseId,
      cityId: mapping.cityId,
      zoneId: mapping.zoneId,
      areaId: mapping.areaId,
    },
  };
}

/** Every store mapping for a warehouse, including ones still under review. */
export async function listCourierStoreMappings(
  warehouseId?: string | null,
): Promise<CourierStoreMappingView[]> {
  const rows = await prismaDirect.courierStoreMapping.findMany({
    where: warehouseId ? { warehouseId } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  return rows.map(toMappingView);
}

/* ----------------------------------------------------------------- health */

export async function checkCourierHealth(providerCode: string): Promise<CourierHealthReport> {
  const provider = requireCourierProvider(providerCode);

  if (!provider.checkHealth) {
    return {
      provider: providerCode,
      healthy: false,
      missingConfig: [],
      tokenState: { hasCachedToken: false, expiresAt: null, refreshAvailable: false },
      webhookConfigured: false,
      latencyMs: null,
      message: `${provider.name} does not expose a connectivity probe.`,
      checkedAt: new Date().toISOString(),
    };
  }

  return provider.checkHealth();
}

/**
 * Capabilities for a provider, or all-false when it is not registered.
 *
 * Lets a UI render its action set from one generic call without knowing whether
 * the code it was given is a live courier.
 */
export function describeCourierCapabilities(providerCode: string): CourierCapabilities {
  const provider = requireCourierProvider(providerCode);
  return provider.getCapabilities();
}

function assertStoreManagement(provider: {
  code: string;
  getCapabilities(): CourierCapabilities;
  listStores?: () => Promise<CourierStoreRef[]>;
}): asserts provider is typeof provider & Required<Pick<typeof provider, 'listStores'>> {
  const capabilities = provider.getCapabilities();

  if (!capabilities.storeManagement || !provider.listStores) {
    throw new CourierValidationError(
      provider.code,
      'This courier does not support pickup point registration through the API.',
    );
  }
}

/** Re-exported so routes can narrow a JSON column without importing Prisma. */
export type { Prisma };
