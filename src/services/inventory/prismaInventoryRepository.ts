import { prisma } from '../database/prisma';
import type {
  CreateWarehouseInput,
  InventoryRepository,
  SellerInventoryItem,
  WarehouseView,
} from '../../modules/inventory/contracts';

const DEFAULT_WAREHOUSES = [
  {
    name: 'Main Warehouse Dhaka',
    address: 'Section 10, Mirpur Industrial Area',
    city: 'Dhaka',
    state: 'Dhaka',
    country: 'Bangladesh',
    postalCode: '1216',
    maxItems: 5000,
    maxWeightKg: 15000,
  },
  {
    name: 'Chittagong Branch',
    address: 'Agrabad Commercial Area',
    city: 'Chattogram',
    state: 'Chattogram',
    country: 'Bangladesh',
    postalCode: '4100',
    maxItems: 2000,
    maxWeightKg: 7000,
  },
] as const;

function mapWarehouse(warehouse: {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string | null;
  country: string;
  postalCode: string;
  phone: string | null;
  email: string | null;
  maxItems: number | null;
  maxWeightKg: number | null;
  createdAt: Date;
  updatedAt: Date;
}): WarehouseView {
  return {
    id: warehouse.id,
    name: warehouse.name,
    location: {
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state ?? undefined,
      country: warehouse.country,
      postalCode: warehouse.postalCode,
    },
    contact: {
      phone: warehouse.phone ?? undefined,
      email: warehouse.email ?? undefined,
    },
    capacity: {
      maxItems: warehouse.maxItems ?? undefined,
      maxWeightKg: warehouse.maxWeightKg ?? undefined,
    },
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
  };
}

function mapInventoryItem(product: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: unknown;
  oldPrice: unknown;
  image: string | null;
  category: string | null;
  stock: number;
  rating: number;
  reviewsCount: number;
  sellerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  orderItems?: Array<{ qty: number }>;
  inventoryItems?: Array<{ quantity: number }>;
}): SellerInventoryItem {
  const orderedQty = (product.orderItems ?? []).reduce((total, item) => total + item.qty, 0);
  const inventoryQty = (product.inventoryItems ?? []).reduce((total, item) => total + item.quantity, 0);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: Number(product.price),
    oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
    image: product.image,
    category: product.category,
    stock: product.stock,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
    sellerId: product.sellerId,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    ordered_qty: orderedQty,
    available: inventoryQty || product.stock,
  };
}

async function ensureDefaultWarehouses() {
  const count = await prisma.warehouse.count();
  if (count > 0) {
    return;
  }

  await prisma.warehouse.createMany({
    data: DEFAULT_WAREHOUSES.map((warehouse) => ({ ...warehouse })),
  });
}

export class PrismaInventoryRepository implements InventoryRepository {
  async listWarehouses() {
    await ensureDefaultWarehouses();

    const warehouses = await prisma.warehouse.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return warehouses.map(mapWarehouse);
  }

  async createWarehouse(input: CreateWarehouseInput) {
    const warehouse = await prisma.warehouse.create({
      data: {
        name: input.name,
        address: input.location.address,
        city: input.location.city,
        state: input.location.state,
        country: input.location.country,
        postalCode: input.location.postalCode,
        phone: input.contact?.phone,
        email: input.contact?.email,
        maxItems: input.capacity?.maxItems,
        maxWeightKg: input.capacity?.maxWeightKg,
        managerId: input.managerId,
      },
    });

    return mapWarehouse(warehouse);
  }

  async listSellerInventory(sellerId: string) {
    const products = await prisma.product.findMany({
      where: {
        sellerId,
      },
      include: {
        orderItems: {
          select: {
            qty: true,
          },
        },
        inventoryItems: {
          select: {
            quantity: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return products.map(mapInventoryItem);
  }

  async listLowStockProducts(sellerId: string, threshold: number) {
    const products = await prisma.product.findMany({
      where: {
        ...(sellerId ? { sellerId } : {}),
        stock: {
          lt: threshold,
        },
      },
      include: {
        orderItems: {
          select: {
            qty: true,
          },
        },
        inventoryItems: {
          select: {
            quantity: true,
          },
        },
      },
      orderBy: {
        stock: 'asc',
      },
    });

    return products.map(mapInventoryItem);
  }
}
