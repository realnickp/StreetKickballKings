// Persistence behind one interface so the storage backend can swap
// (localStorage now, Capacitor Preferences later) without touching game code.
const STORAGE_KEY = 'skk-save-v1';

export class SaveManager {
  constructor({ backend } = {}) {
    this.memory = new Map();
    this.useLocal = backend !== 'memory' && hasLocalStorage();
    if (this.useLocal) this.loadFromLocal();
  }

  get(key, fallback = null) {
    const v = this.memory.has(key) ? this.memory.get(key) : fallback;
    return v;
  }

  set(key, value) {
    this.memory.set(key, value);
    this.persist();
  }

  getAll() {
    return Object.fromEntries(this.memory);
  }

  exportCode() {
    return btoa(JSON.stringify(this.getAll()));
  }

  importCode(code) {
    const obj = JSON.parse(atob(code));
    this.memory = new Map(Object.entries(obj));
    this.persist();
  }

  loadFromLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.memory = new Map(Object.entries(JSON.parse(raw)));
    } catch { /* corrupted or unavailable: start fresh */ }
  }

  persist() {
    if (!this.useLocal) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getAll()));
    } catch { /* quota/private mode: stay in memory */ }
  }
}

function hasLocalStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}
