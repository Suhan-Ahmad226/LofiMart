import api from '@/src/lib/api';
import { Warehouse, Supplier, InventoryItem, PurchaseOrder } from '@/src/types/inventory';

const CACHE_TTL = 5 * 60 * 1000; // 5min

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
      
      const res = await api.get('/admin/inventory/warehouses');
      setCached('warehouses', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createWarehouse(warehouse: Omit<Warehouse, 'id'>): Promise<Warehouse> {
    const res = await api.post('/admin/inventory/warehouses', warehouse);
    clearCached('warehouses');
    return res.data;
  },

  async updateWarehouse(warehouseId: string, warehouse: Omit<Warehouse, 'id'>): Promise<Warehouse> {
    const res = await api.patch(`/admin/inventory/warehouses/${warehouseId}`, warehouse);
    clearCached('warehouses');
    return res.data;
  },

  async deleteWarehouse(id: string): Promise<void> {
    await api.delete(`/admin/inventory/warehouses/${id}`);
    clearCached('warehouses');
  },

  async updateWarehousePathaoConfig(
    warehouseId: string,
    payload: {
      storeId?: number | null;
      cityId?: number | null;
      zoneId?: number | null;
      areaId?: number | null;
      contactName?: string;
      secondaryContact?: string;
      otpNumber?: string;
    },
  ) {
    const res = await api.patch(`/admin/inventory/warehouses/${warehouseId}/pathao`, payload);
    clearCached('warehouses');
    return res.data;
  },

  async fetchPathaoCities() {
    const res = await api.get('/logistics/pathao/cities');
    return res.data;
  },

  async fetchPathaoZones(cityId: number) {
    const res = await api.get(`/logistics/pathao/cities/${cityId}/zones`);
    return res.data;
  },

  async fetchPathaoAreas(zoneId: number) {
    const res = await api.get(`/logistics/pathao/zones/${zoneId}/areas`);
    return res.data;
  },

  async fetchPathaoStores() {
    const res = await api.get('/logistics/pathao/stores');
    return res.data;
  },

  async fetchPathaoStoreInfo(storeId: number) {
    const res = await api.get(`/logistics/pathao/stores/${storeId}`);
    return res.data;
  },

  async createPathaoStore(payload: { warehouseId?: string } & Record<string, unknown>) {
    const res = await api.post('/logistics/pathao/stores', payload);
    return res.data;
  },

  async calculatePathaoPrice(payload: {
    store_id: number;
    item_type?: 1 | 2;
    delivery_type?: 12 | 48;
    item_weight?: number;
    recipient_city: number;
    recipient_zone: number;
  }) {
    const res = await api.post('/logistics/pathao/price', payload);
    return res.data;
  },

  async fetchPathaoOrderInfo(consignmentId: string) {
    const res = await api.get(`/logistics/pathao/orders/${encodeURIComponent(consignmentId)}/info`);
    return res.data;
  },

  async fetchSuppliers(): Promise<Supplier[]> {
    try {
      const cached = await getCached('suppliers');
      if (cached) return cached;
      
      const res = await api.get('/suppliers');
      setCached('suppliers', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createSupplier(supplier: Omit<Supplier, 'id'>): Promise<Supplier> {
    const res = await api.post('/suppliers', supplier);
    clearCached('suppliers');
    return res.data;
  },

  async fetchInventory(): Promise<InventoryItem[]> {
    try {
      const cached = await getCached('inventory');
      if (cached) return cached;
      
      const res = await api.get('/inventory');
      setCached('inventory', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createInventoryItem(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    const res = await api.post('/inventory', item);
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
      
      const res = await api.get('/purchaseOrders');
      setCached('purchaseOrders', res.data);
      return res.data;
    } catch {
      return silentFallback([]);
    }
  },

  async createPurchaseOrder(po: Omit<PurchaseOrder, 'id'>): Promise<PurchaseOrder> {
    const res = await api.post('/purchaseOrders', po);
    clearCached('purchaseOrders');
    return res.data;
  },

  async cancelPurchaseOrder(id: string): Promise<void> {
    await api.patch(`/purchaseOrders/${id}`, { status: 'cancelled' });
    clearCached('purchaseOrders');
  },
};
