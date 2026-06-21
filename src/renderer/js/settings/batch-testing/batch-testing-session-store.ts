class BatchTestingSessionStore {
  storeKey: string;

  constructor(storeKey: string) {
    this.storeKey = storeKey;
  }

  async load<T>() {
    if (!window.electronAPI?.store) {
      return null;
    }

    try {
      return ((await window.electronAPI.store.get(this.storeKey)) as T | null) || null;
    } catch (error) {
      console.error('[BatchTesting] Failed to load stored session:', error);
      return null;
    }
  }

  async save(session: unknown) {
    if (!window.electronAPI?.store) {
      return;
    }

    try {
      if (session == null) {
        await window.electronAPI.store.delete(this.storeKey);
        return;
      }

      await window.electronAPI.store.set(this.storeKey, session);
    } catch (error) {
      console.error('[BatchTesting] Failed to persist session:', error);
    }
  }
}

if (typeof window !== 'undefined') {
  (window as any).BatchTestingSessionStore = BatchTestingSessionStore;
}

export {};
