import { EventEmitter } from 'node:events';

export type DomainEventType =
  'pipeline.progress' | 'pipeline.done' | 'sensor.received' | 'calendar.changed';

export interface DomainEvent {
  type: DomainEventType;
  at: string;
  data: Record<string, unknown>;
}

/**
 * In-process event bus feeding the SSE stream: the web shows a run's progress and new sensor
 * pieces as they arrive.
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
