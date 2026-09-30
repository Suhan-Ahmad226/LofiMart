import api from '../../../lib/api';
import { Warehouse, Supplier, InventoryItem, PurchaseOrder } from '../../../types/inventory';

const CACHE_TTL = 5 * 60 * 1000; // 5min

/** One level of a courier's location directory, as returned by /logistics/locations. */
export type CourierLocationOption = {
  id: string;
  name: string;
  level: string;
  parentId: string | null;
  homeDeliveryAvailable: boolean | null;
  pickupAvailable: boolean | null;
};

export type CourierLocationResponse = {
  provider: string;
  level: string;
  parentId: string | null;
  nodes: CourierLocationOption[];
};

/** A pickup point registered with a courier. */
export type CourierStoreOption = {
  externalStoreId: string;
  externalStoreName: string | null;
  active: boolean;
  /** Courier-specific detail, treated as opaque by this layer. */
  metadata?: {
    address?: string | null;
    cityId?: number | null;
    zoneId?: number | null;
    areaId?: number | null;
  } | null;
};

export type CourierStoreMappingOption = {
  id: string;
  warehouseId: string;
  externalStoreId: string;
  externalStoreName: string | null;
  status: string;
  isActive: boolean;
  bookable: boolean;
  cityId: number | null;
  zoneId: number | null;
  areaId: number | null;
  lastError: string | null;
};

export type CourierStoresResponse = {
  provider: string;
  remoteStores: CourierStoreOption[] | null;
  mappings: CourierStoreMappingOption[];
};

function getBrowserStorage() {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  return globalThis.localStorage;
}

// Helper: Cache with TTL
const getCached = async (key: string): Promise<any> => {
  const storage = getBrowserStorage();
  const cached = storage?.getItem(`inventory_${key}`);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL) return data;
  }
  return null;
};

const setCached = (key: string, data: any) => {
  const storage = getBrowserStorage();
  storage?.setItem(`inventory_${key}`, JSON.stringify({
    data,
    timestamp: Date.now()
  }));
};

const clearCached = (key: string) => {
  const storage = getBrowserStorage();
  storage?.removeItem(`inventory_${key}`);
};

const silentFallback = <T,>(fallback: T): T => fallback;

export const inventoryApi = {
  async fetchWarehouses(): Promise<Warehouse[]> {
    try {
      const cached = await getCached('warehouses');
      if (cached) return cached;

      const res = await api.get<Warehouse[]>('/admin/inventory/warehouses');
      setCached('warehouses', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createWarehouse(warehouse: Omit<Warehouse, 'id'>): Promise<Warehouse> {
    const res = await api.post<Warehouse>('/admin/inventory/warehouses', warehouse);
    clearCached('warehouses');
    return res.data;
  },

  async updateWarehouse(warehouseId: string, warehouse: Omit<Warehouse, 'id'>): Promise<Warehouse> {
    const res = await api.patch<Warehouse>(`/admin/inventory/warehouses/${warehouseId}`, warehouse);
    clearCached('warehouses');
    return res.data;
  },

  async deleteWarehouse(id: string): Promise<void> {
    await api.delete(`/admin/inventory/warehouses/${id}`);
    clearCached('warehouses');
  },

  /**
   * Links a warehouse to a courier: pickup contact plus the courier's own ids for
   * the pickup location.
   *
   * Provider-neutral. The `provider` field is what makes it extensible — this
   * method, and the route behind it, have no idea which courier is being mapped.
   */
  async updateWarehouseCourierConfig(
    warehouseId: string,
    payload: {
      provider: string;
      storeId?: string | null;
      cityId?: number | null;
      zoneId?: number | null;
      areaId?: number | null;
      contactName?: string;
      secondaryContact?: string;
      otpNumber?: string;
    },
  ) {
    const res = await api.patch(`/admin/inventory/warehouses/${warehouseId}/courier`, payload);
    clearCached('warehouses');
    return res.data;
  },

  /**
   * One level of a courier's location directory.
   *
   * Replaces the per-courier `cities` / `cities/{id}/zones` / `zones/{id}/areas`
   * route tree with a single parameterised call, so a new courier needs no new
   * client method and no new route.
   */
  async fetchCourierLocations(input: {
    provider: string;
    level: 'city' | 'zone' | 'area' | 'district' | 'postcode' | 'other';
    parentId?: string | null;
  }): Promise<CourierLocationResponse> {
    const params = new URLSearchParams({ provider: input.provider, level: input.level });
    if (input.parentId) params.set('parentId', input.parentId);

    const res = await api.get<CourierLocationResponse>(`/logistics/locations?${params.toString()}`);
    return res.data;
  },

  /**
   * Lists a courier's known pickup points.
   *
   * `provider` is required rather than optional because the endpoint has no
   * sensible default: it returns 400 without one. Making it optional here is what
   * allowed a caller to omit it and get an empty store list with no error.
   */
  async fetchCourierStores(input: { provider: string; warehouseId?: string }): Promise<CourierStoresResponse> {
    const params = new URLSearchParams({ provider: input.provider });
    if (input.warehouseId) params.set('warehouseId', input.warehouseId);

    const res = await api.get<CourierStoresResponse>(`/logistics/stores?${params.toString()}`);
    return res.data;
  },

  /**
   * Registers a warehouse as a courier pickup point.
   *
   * The three location ids are required: a pickup point registered against a
   * guessed location collects parcels from the wrong hub, and the courier would
   * have no way of telling us we were wrong.
   */
  async createCourierStore(payload: {
    provider: string;
    warehouseId: string;
    cityId: number;
    zoneId: number;
    areaId: number;
  }): Promise<Record<string, unknown>> {
    const res = await api.post<Record<string, unknown>>('/logistics/stores', payload);
    clearCached('warehouses');
    return res.data;
  },

  async fetchSuppliers(): Promise<Supplier[]> {
    try {
      const cached = await getCached('suppliers');
      if (cached) return cached;

      const res = await api.get<Supplier[]>('/suppliers');
      setCached('suppliers', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createSupplier(supplier: Omit<Supplier, 'id'>): Promise<Supplier> {
    const res = await api.post<Supplier>('/suppliers', supplier);
    clearCached('suppliers');
    return res.data;
  },

  async fetchInventory(): Promise<InventoryItem[]> {
    try {
      const cached = await getCached('inventory');
      if (cached) return cached;

      const res = await api.get<InventoryItem[]>('/inventory');
      setCached('inventory', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createInventoryItem(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    const res = await api.post<InventoryItem>('/inventory', item);
    clearCached('inventory');
    return res.data;
  },

  async adjustInventoryQuantity(id: string, delta: number): Promise<void> {
    await api.patch(`/inventory/${id}`, { delta });
    clearCached('inventory');
  },

  async fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    try {
      const cached = await getCached('purchaseOrders');
      if (cached) return cached;

      const res = await api.get<PurchaseOrder[]>('/purchaseOrders');
      setCached('purchaseOrders', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createPurchaseOrder(po: Omit<PurchaseOrder, 'id'>): Promise<PurchaseOrder> {
    const res = await api.post<PurchaseOrder>('/purchaseOrders', po);
    clearCached('purchaseOrders');
    return res.data;
  },

  async cancelPurchaseOrder(id: string): Promise<void> {
    await api.patch(`/purchaseOrders/${id}`, { status: 'cancelled' });
    clearCached('purchaseOrders');
  },
};
