// Core inventory types for Phase 6

export interface Warehouse {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    state?: string;
    country: string;
    postalCode: string;
    coordinates?: { lat: number; lng: number };
  };
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
    secondaryPhone?: string;
    otpNumber?: string;
  };
  pathao?: {
    storeId?: number;
    cityId?: number;
    zoneId?: number;
    areaId?: number;
  };
  shipping?: {
    insideDhakaFee?: number;
    outsideDhakaFee?: number;
    insideDhakaEta?: string;
    outsideDhakaEta?: string;
    freeShippingThresholdOverride?: number;
  };
  capacity?: {
    maxItems?: number;
    maxWeightKg?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: {
    phone?: string;
    email?: string;
    address?: string;
  };
  productsSupplied: string[]; // array of product IDs
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  reorderLevel: number;
  restockThreshold?: number;
  lastUpdated: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  warehouseId: string;
  items: Array<{ productId: string; quantity: number; unitCost: number }>;
  status: 'pending' | 'approved' | 'declined' | 'fulfilled' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  expectedDelivery?: string;
}

export interface InventoryContextState {
  warehouses: Warehouse[];
  suppliers: Supplier[];
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  loading: boolean;
  error: string | null;
}

export interface InventoryContextActions {
  addWarehouse: (wh: Warehouse) => void;
  updateWarehouse: (wh: Partial<Warehouse> & { id: string }) => void;
  removeWarehouse: (id: string) => void;

  addSupplier: (s: Supplier) => void;
  updateSupplier: (s: Partial<Supplier> & { id: string }) => void;
  removeSupplier: (id: string) => void;

  addInventoryItem: (item: InventoryItem) => void;
  updateInventoryItem: (item: Partial<InventoryItem> & { id: string }) => void;
  adjustInventoryQuantity: (id: string, delta: number) => void;

  createPurchaseOrder: (po: PurchaseOrder) => void;
  updatePurchaseOrder: (po: Partial<PurchaseOrder> & { id: string }) => void;
  cancelPurchaseOrder: (id: string) => void;
}
