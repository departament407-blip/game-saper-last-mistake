type Handler<Payload> = (payload: Payload) => void;

export class EventBus<Events extends object> {
  private handlers = new Map<keyof Events, Set<Handler<Events[keyof Events]>>>();

  on<Name extends keyof Events>(eventName: Name, handler: Handler<Events[Name]>): () => void {
    const handlers = this.handlers.get(eventName) ?? new Set<Handler<Events[keyof Events]>>();
    handlers.add(handler as Handler<Events[keyof Events]>);
    this.handlers.set(eventName, handlers);

    return () => {
      handlers.delete(handler as Handler<Events[keyof Events]>);
    };
  }

  emit<Name extends keyof Events>(eventName: Name, payload: Events[Name]): void {
    const handlers = this.handlers.get(eventName);

    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => handler(payload));
  }
}
