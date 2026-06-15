// Tiny pub/sub. Match logic, cinematics, UI, and audio all talk through this.
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    // one bad listener (e.g. a flaky audio/speech call) must not break the emitter
    // or the game loop that triggered it.
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error(`[skk] listener error on "${event}" (recovered):`, e); }
    }
  }
}
