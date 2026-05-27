import type { DomainEvent } from './contracts';

export function orderPlacedEvent(payload: {
  orderId: string;
  userId: string;
  total: number;
}): DomainEvent<typeof payload> {
  return {
    name: 'order.placed',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export function paymentCompletedEvent(payload: {
  transactionId: string;
  orderId?: string;
  provider: string;
  amount: number;
}): DomainEvent<typeof payload> {
  return {
    name: 'payment.completed',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export function userRegisteredEvent(payload: {
  userId: string;
  email: string;
}): DomainEvent<typeof payload> {
  return {
    name: 'user.registered',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export function inventoryUpdatedEvent(payload: {
  productId: string;
  warehouseId?: string;
  delta: number;
  reason: string;
}): DomainEvent<typeof payload> {
  return {
    name: 'inventory.updated',
    occurredAt: new Date().toISOString(),
    payload,
  };
}
