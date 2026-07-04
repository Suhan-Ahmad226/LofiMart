export type WarehouseView = {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    state?: string;
    country: string;
    postalCode: string;
  };
  contact?: {
    phone?: string;
    email?: string;
  };
  capacity?: {
    maxItems?: number;
    maxWeightKg?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateWarehouseInput = {
  name: string;
  location: WarehouseView['location'];
  contact?: WarehouseView['contact'];
  capacity?: WarehouseView['capacity'];
  managerId?: string;
};

export type SellerInventoryItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  oldPrice?: number | null;
  image?: string | null;
  category?: string | null;
  stock: number;
  rating: number;
  reviewsCount: number;
  sellerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  ordered_qty: number;
  available: number;
};

export interface InventoryRepository {
  listWarehouses(): Promise<WarehouseView[]>;
  createWarehouse(input: CreateWarehouseInput): Promise<WarehouseView>;
  listSellerInventory(sellerId: string): Promise<SellerInventoryItem[]>;
  listLowStockProducts(sellerId: string, threshold: number): Promise<SellerInventoryItem[]>;
}
