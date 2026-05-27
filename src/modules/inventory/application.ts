import type { EventPublisher } from '../../events/contracts';
import { lowStockScanCompletedEvent, warehouseCreatedEvent } from '../../events/inventory';
import type { CreateWarehouseInput, InventoryRepository } from './contracts';

export function createInventoryModule(dependencies: {
  repository: InventoryRepository;
  publisher: EventPublisher;
}) {
  const { repository, publisher } = dependencies;

  return {
    async listWarehouses() {
      return repository.listWarehouses();
    },

    async createWarehouse(input: CreateWarehouseInput) {
      const warehouse = await repository.createWarehouse(input);

      await publisher.publish(
        warehouseCreatedEvent({
          warehouseId: warehouse.id,
          name: warehouse.name,
          managerId: input.managerId,
        }),
      );

      return warehouse;
    },

    async listSellerInventory(sellerId: string) {
      return repository.listSellerInventory(sellerId);
    },

    async listLowStockProducts(sellerId: string, threshold: number) {
      return repository.listLowStockProducts(sellerId, threshold);
    },

    async scanLowStockProducts(sellerId: string | undefined, threshold: number) {
      const items = sellerId
        ? await repository.listLowStockProducts(sellerId, threshold)
        : await repository.listLowStockProducts('', threshold);

      await publisher.publish(
        lowStockScanCompletedEvent({
          sellerId,
          threshold,
          resultCount: items.length,
        }),
      );

      return items;
    },
  };
}
