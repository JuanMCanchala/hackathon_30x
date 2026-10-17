import { EventEmitter } from 'node:events';

export type DomainEventType =
  | 'invoice.decided'
  | 'invoice.approved'
  | 'invoice.rejected'
  | 'approval.recorded'
  | 'proposal.created'
  | 'proposal.resolved'
  | 'policy.changed'
  | 'registry.changed'
  | 'audit.completed'
  | 'demo.reset'
  | 'demo.progress'
  | 'payment.updated';

export interface DomainEvent {
  type: DomainEventType;
  orgId: string;
  at: string;
  data: Record<string, unknown>;
}

/**
 * In-process event bus feeding the SSE stream (ADR-0014). A multi-instance deployment would
 * implement the same interface on Postgres LISTEN/NOTIFY.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: DomainEvent): void {
    this.emitter.emit('event', event);
  }

  subscribe(listener: (event: DomainEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
