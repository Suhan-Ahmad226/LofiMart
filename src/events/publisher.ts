import type { DomainEvent, EventPublisher } from './contracts';
import { logger } from '../lib/logger';

class ConsoleEventPublisher implements EventPublisher {
  async publish<TPayload>(event: DomainEvent<TPayload>) {
    logger.info('domain.event', {
      name: event.name,
      occurredAt: event.occurredAt,
      payload: event.payload as Record<string, unknown>,
    });
  }
}

export const eventPublisher: EventPublisher = new ConsoleEventPublisher();
