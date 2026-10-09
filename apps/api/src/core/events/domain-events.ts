import { Injectable, Logger } from '@nestjs/common';

type Handler<T> = (payload: T) => Promise<void> | void;

/** Modüller arası gevşek bağlı olay yayını (ör. aksiyon durumu değişti → DÖF modülü dinler). */
@Injectable()
export class DomainEvents {
  private readonly logger = new Logger(DomainEvents.name);
  private readonly handlers = new Map<string, Handler<any>[]>();

  on<T>(event: string, handler: Handler<T>) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  /** Dinleyiciler sırayla çalışır; bir dinleyicinin hatası diğerlerini durdurmaz. */
  async emit<T>(event: string, payload: T) {
    for (const handler of this.handlers.get(event) ?? []) {
      try {
        await handler(payload);
      } catch (err) {
        this.logger.error(`Handler for ${event} failed`, err as Error);
      }
    }
  }
}

export const ActionEvents = {
  StatusChanged: 'action.statusChanged',
} as const;

export interface ActionStatusChangedEvent {
  actionId: string;
  sourceType: string;
  sourceId: string | null;
  from: string;
  to: string;
}
