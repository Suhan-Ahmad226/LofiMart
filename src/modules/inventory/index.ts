import { eventPublisher } from '../../events/publisher';
import { createInventoryModule } from './application';
import { PrismaInventoryRepository } from '../../services/inventory/prismaInventoryRepository';

const inventoryRepository = new PrismaInventoryRepository();

export const inventoryModule = createInventoryModule({
  repository: inventoryRepository,
  publisher: eventPublisher,
});
