interface PlainNumberValue {
  toNumber?: () => number;
}

export function toPlainNumber(value: unknown) {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as PlainNumberValue).toNumber === 'function') {
    return (value as PlainNumberValue).toNumber!();
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

interface OrderInput {
  id: string;
  orderCode?: string | null;
  status: string;
  total: unknown;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  createdAt?: Date | null;
  items?: OrderItemInput[];
  shipments?: OrderShipmentInput[];
}

interface OrderItemInput {
  id: string;
  productId: string | number;
  qty: number;
  price: unknown;
  product?: {
    id: string | number;
    name: string;
    sku?: string | null;
    image?: string | null;
  } | null;
}

interface OrderShipmentInput {
  id: string;
  orderId: string | number;
  sellerId: string | number;
  warehouseId?: string | number | null;
  status: string;
  total: unknown;
  itemCount: number;
  courierProvider?: string | null;
  trackingId?: string | null;
  pickupRequestedAt?: Date | string | null;
  pickedUpAt?: Date | string | null;
  outForDeliveryAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  deliveryFailureReason?: string | null;
  shipmentMetadata?: unknown;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  warehouse?: WarehouseInput | null;
  seller?: SellerInput | null;
  items?: ShipmentItemInput[];
}

interface WarehouseInput {
  id: string | number;
  name: string;
  city: string;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  contactName?: string | null;
}

interface SellerInput {
  id: string | number;
  name?: string | null;
  storeName?: string | null;
}

interface ShipmentItemInput {
  id: string | number;
  orderItemId: string | number;
  productId: string | number;
  qty: number;
  price: unknown;
  product?: ProductInput | null;
}

interface ProductInput {
  id: string | number;
  name: string;
  image?: string | null;
  slug?: string | null;
}

export function serializeOrder(order: OrderInput) {
  return {
    id: order.id,
    order_code: order.orderCode ?? null,
    status: order.status,
    total: toPlainNumber(order.total),
    payment_method: order.paymentMethod ?? null,
    payment_status: order.paymentStatus ?? null,
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : undefined,
    items: order.items?.map(serializeOrderItem),
    shipments: order.shipments?.map(serializeOrderShipment),
  };
}

export function serializeOrderItem(item: OrderItemInput) {
  return {
    id: item.id,
    product_id: item.productId,
    quantity: item.qty,
    price: toPlainNumber(item.price),
    product: item.product
      ? {
          id: item.product.id,
          name: item.product.name,
          sku: item.product.sku ?? null,
          image: item.product.image ?? null,
        }
      : null,
  };
}

export function serializeOrderShipment(shipment: OrderShipmentInput) {
  return {
    id: shipment.id,
    order_id: shipment.orderId,
    seller_id: shipment.sellerId,
    warehouse_id: shipment.warehouseId ?? null,
    status: shipment.status,
    total: Number(shipment.total),
    item_count: shipment.itemCount,
    courier_provider: shipment.courierProvider ?? null,
    tracking_id: shipment.trackingId ?? null,
    pickup_requested_at: shipment.pickupRequestedAt ? new Date(shipment.pickupRequestedAt).toISOString() : null,
    picked_up_at: shipment.pickedUpAt ? new Date(shipment.pickedUpAt).toISOString() : null,
    out_for_delivery_at: shipment.outForDeliveryAt ? new Date(shipment.outForDeliveryAt).toISOString() : null,
    delivered_at: shipment.deliveredAt ? new Date(shipment.deliveredAt).toISOString() : null,
    delivery_failure_reason: shipment.deliveryFailureReason ?? null,
    shipment_metadata: shipment.shipmentMetadata ?? null,
    created_at: shipment.createdAt ? new Date(shipment.createdAt).toISOString() : undefined,
    updated_at: shipment.updatedAt ? new Date(shipment.updatedAt).toISOString() : undefined,
    warehouse: shipment.warehouse
      ? {
          id: shipment.warehouse.id,
          name: shipment.warehouse.name,
          city: shipment.warehouse.city,
          state: shipment.warehouse.state ?? null,
          country: shipment.warehouse.country,
          postal_code: shipment.warehouse.postalCode ?? null,
          phone: shipment.warehouse.phone ?? null,
          contact_name: shipment.warehouse.contactName ?? null,
        }
      : null,
    seller: shipment.seller
      ? {
          id: shipment.seller.id,
          name: shipment.seller.name ?? null,
          store_name: shipment.seller.storeName ?? null,
        }
      : null,
    items: shipment.items?.map((item: ShipmentItemInput) => ({
      id: item.id,
      order_item_id: item.orderItemId,
      product_id: item.productId,
      quantity: item.qty,
      price: Number(item.price),
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            image: item.product.image ?? null,
            slug: item.product.slug ?? null,
          }
        : null,
    })),
  };
}