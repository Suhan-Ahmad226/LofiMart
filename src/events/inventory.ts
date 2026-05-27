import type { DomainEvent } from './contracts';

export function warehouseCreatedEvent(payload: {
  warehouseId: string;
  name: string;
  managerId?: string;
}): DomainEvent<typeof payload> {
  return {
    name: 'inventory.warehouse.created',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export function lowStockScanCompletedEvent(payload: {
  sellerId?: string;
  threshold: number;
  resultCount: number;
}): DomainEvent<typeof payload> {
  return {
    name: 'inventory.low_stock_scan.completed',
    occurredAt: new Date().toISOString(),
    payload,
  };
}
