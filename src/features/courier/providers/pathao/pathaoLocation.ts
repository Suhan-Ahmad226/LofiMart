/**
 * Pathao location resolution.
 *
 * Pathao prices and routes on a three-level hierarchy (city → zone → area). The
 * merchant only ever holds a free-text city name, so something has to resolve
 * it. This module's defining rule:
 *
 *   **An unmapped location returns `null`. It never falls back to a default.**
 *
 * Defaulting to Dhaka would quote a Dhaka price for a Chattogram parcel, bill
 * the customer the wrong amount, and route the parcel to the wrong hub. Failing
 * loudly costs a seller one field to fix; guessing costs a delivery, a refund
 * and a support ticket.
 *
 * Results are cached in Redis because the city list changes rarely and the
 * shipping-preview endpoint calls this on every checkout render.
 */

import { ensureRedis } from '../../../shared/services/messaging/redis';
import type { CourierLocationRef } from '../../core/contracts';
import { PATHAO_PROVIDER_CODE } from './pathaoConstants';
import { listPathaoAreas, listPathaoCities, listPathaoZones } from './pathaoClient';
import { extractPathaoListRows } from './pathaoSchemas';
import type { PathaoArea, PathaoCity, PathaoZone } from './pathaoTypes';

const CACHE_PREFIX = 'courier:pathao:locations';
const CACHE_TTL_SECONDS = 60 * 60 * 6;

/**
 * Suffixes and spelling variants that should not create a distinct location.
 * "Dhaka Division", "Dhaka District" and "ঢাকা" all mean the same city, so
 * normalising them avoids duplicate entries and misses.
 */
const CITY_NOISE = [
  'division',
  'district',
  'city',
  'upazila',
  'ঢাকা',
  'চট্টগ্রাম',
  'সিলেট',
  'রাজশাহী',
  'খুলনা',
  'বরিশাল',
];

export function normalizeCityKey(raw: string): string {
  let key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[.\-_'`]/g, ' ');

  // Strip Bangla and Arabic digits/characters so a mixed-script name still
  // reduces to a comparable key.
  key = key.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  for (const noise of CITY_NOISE) {
    key = key.replace(new RegExp(`(^|\\s)${noise}(\\s|$)`, 'g'), ' ');
  }

  return key.replace(/\s+/g, ' ').trim();
}

function cacheKey(kind: string, id?: number | string): string {
  return id === undefined ? `${CACHE_PREFIX}:${kind}` : `${CACHE_PREFIX}:${kind}:${id}`;
}

async function readCache<T>(key: string): Promise<T | null> {
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
  await ensureRedis()
    .then((redis) => redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS))
    // A cache write failure must degrade to a live API call, never to an error
    // surfaced to a shopper at checkout.
    .catch(() => undefined);
}

/** Reads the nested `id`/`name` pair out of a Pathao list row. */
function readRow<T extends { id: number; name: string }>(row: unknown): T | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;

  const id = Number(record.city_id ?? record.zone_id ?? record.area_id);
  const name = String(
    record.city_name ?? record.zone_name ?? record.area_name ?? record.name ?? '',
  ).trim();

  if (!Number.isFinite(id) || !name) return null;
  return { id, name } as T;
}

export async function fetchPathaoCities(): Promise<PathaoCity[]> {
  const cached = await readCache<PathaoCity[]>(cacheKey('cities'));
  if (cached) return cached;

  const rows = extractPathaoListRows(await listPathaoCities())
    .map((row) => readRow<{ id: number; name: string }>(row))
    .filter((row): row is { id: number; name: string } => row !== null)
    .map((row) => ({ city_id: row.id, city_name: row.name }));

  await writeCache(cacheKey('cities'), rows);
  return rows;
}

export async function fetchPathaoZones(cityId: number): Promise<PathaoZone[]> {
  const cached = await readCache<PathaoZone[]>(cacheKey('zones', cityId));
  if (cached) return cached;

  const rows = extractPathaoListRows(await listPathaoZones(cityId))
    .map((row) => readRow<{ id: number; name: string }>(row))
    .filter((row): row is { id: number; name: string } => row !== null)
    .map((row) => ({ zone_id: row.id, zone_name: row.name }));

  await writeCache(cacheKey('zones', cityId), rows);
  return rows;
}

export async function fetchPathaoAreas(zoneId: number): Promise<PathaoArea[]> {
  const cached = await readCache<PathaoArea[]>(cacheKey('areas', zoneId));
  if (cached) return cached;

  const rows = extractPathaoListRows(await listPathaoAreas(zoneId))
    .map((row) => readRow<{ id: number; name: string }>(row))
    .filter((row): row is { id: number; name: string } => row !== null)
    .map((row) => ({ area_id: row.id, area_name: row.name }));

  await writeCache(cacheKey('areas', zoneId), rows);
  return rows;
}

/**
 * Resolves a merchant's city name to a Pathao city id.
 *
 * Returns `null` when there is no match. An exact normalised match wins; only
 * then is a unique-prefix match accepted, so "Syl" resolving to "Sylhet" works
 * while an ambiguous prefix such as "Dhaka"/"Dharanagar" stays unresolved rather
 * than picking the first row.
 */
export async function resolvePathaoCity(city: string): Promise<{ id: number; name: string } | null> {
  const target = normalizeCityKey(city);
  if (!target) return null;

  const cities = await fetchPathaoCities();
  if (cities.length === 0) return null;

  const byKey = cities.map((entry) => ({
    id: entry.city_id,
    name: entry.city_name,
    key: normalizeCityKey(entry.city_name),
  }));

  const exact = byKey.find((entry) => entry.key === target);
  if (exact) return { id: exact.id, name: exact.name };

  const prefixed = byKey.filter((entry) => entry.key.startsWith(target));
  if (prefixed.length === 1) return { id: prefixed[0].id, name: prefixed[0].name };

  return null;
}

export interface PathaoLocationResolution {
  cityId: number | null;
  zoneId: number | null;
  areaId: number | null;
  cityName: string | null;
  zoneName: string | null;
  areaName: string | null;
  /** Human-readable reason the location could not be fully resolved. */
  reason: string | null;
}

/**
 * Resolves a full city / zone / area triple.
 *
 * Any level the merchant has not supplied stays `null` rather than being
 * guessed, and `reason` explains what is missing so the seller UI can prompt for
 * exactly that field.
 */
export async function resolvePathaoLocation(input: {
  city?: string | null;
  zone?: string | null;
  area?: string | null;
}): Promise<PathaoLocationResolution> {
  const empty: PathaoLocationResolution = {
    cityId: null,
    zoneId: null,
    areaId: null,
    cityName: null,
    zoneName: null,
    areaName: null,
    reason: 'No city was provided.',
  };

  if (!input.city?.trim()) return empty;

  const city = await resolvePathaoCity(input.city);
  if (!city) {
    return { ...empty, reason: `"${input.city}" is not a location the courier serves.` };
  }

  let zoneId: number | null = null;
  let zoneName: string | null = null;

  if (input.zone?.trim()) {
    const target = normalizeCityKey(input.zone);
    const zones = await fetchPathaoZones(city.id);
    const match =
      zones.find((zone) => normalizeCityKey(zone.zone_name) === target) ??
      (() => {
        const prefixed = zones.filter((zone) => normalizeCityKey(zone.zone_name).startsWith(target));
        return prefixed.length === 1 ? prefixed[0] : undefined;
      })();

    if (!match) {
      return {
        cityId: city.id,
        cityName: city.name,
        zoneId: null,
        zoneName: null,
        areaId: null,
        areaName: null,
        reason: `Zone "${input.zone}" is not valid for ${city.name}.`,
      };
    }

    zoneId = match.zone_id;
    zoneName = match.zone_name;
  }

  let areaId: number | null = null;
  let areaName: string | null = null;

  if (input.area?.trim() && zoneId !== null) {
    const target = normalizeCityKey(input.area);
    const areas = await fetchPathaoAreas(zoneId);
    const match =
      areas.find((area) => normalizeCityKey(area.area_name) === target) ??
      (() => {
        const prefixed = areas.filter((area) => normalizeCityKey(area.area_name).startsWith(target));
        return prefixed.length === 1 ? prefixed[0] : undefined;
      })();

    if (!match) {
      return {
        cityId: city.id,
        cityName: city.name,
        zoneId,
        zoneName,
        areaId: null,
        areaName: null,
        reason: `Area "${input.area}" is not valid for ${zoneName}.`,
      };
    }

    areaId = match.area_id;
    areaName = match.area_name;
  }

  return {
    cityId: city.id,
    cityName: city.name,
    zoneId,
    zoneName,
    areaId,
    areaName,
    reason:
      zoneId === null
        ? `Select a zone within ${city.name}.`
        : areaId === null
          ? `Select an area within ${zoneName}.`
          : null,
  };
}

/**
 * Adapts a full resolution to the provider-neutral contract shape.
 *
 * Returns `null` unless city, zone and area are all resolved, so a partially
 * mapped location can never reach the price plan or the booking payload.
 */
export function toCourierLocationRef(
  resolution: PathaoLocationResolution,
): CourierLocationRef | null {
  if (resolution.cityId === null || resolution.zoneId === null || resolution.areaId === null) {
    return null;
  }

  return {
    provider: PATHAO_PROVIDER_CODE,
    cityId: resolution.cityId,
    zoneId: resolution.zoneId,
    areaId: resolution.areaId,
    label: [resolution.cityName, resolution.zoneName, resolution.areaName]
      .filter(Boolean)
      .join(', '),
  };
}
