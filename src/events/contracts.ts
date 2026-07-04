export type DomainEvent<TPayload = Record<string, unknown>> = {
  name: string;
  occurredAt: string;
  payload: TPayload;
};

export interface EventPublisher {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
}
