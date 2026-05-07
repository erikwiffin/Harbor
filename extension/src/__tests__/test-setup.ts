/**
 * Global test setup.
 *
 * Vitest runs in Node, but the extension code references `chrome` (and
 * sometimes `browser`) at module load time. We install an in-memory mock
 * that supports the surface the policy/sessions code actually uses.
 *
 * Tests that need fine-grained control over storage state import
 * `resetMockBrowser()` or `getMockStorage()` from this module.
 */

interface MockStorageArea {
  data: Record<string, unknown>;
  get: (key?: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (kv: Record<string, unknown>) => Promise<void>;
  remove?: (key: string | string[]) => Promise<void>;
  clear?: () => Promise<void>;
}

interface MockStorage {
  local: MockStorageArea;
  managed: MockStorageArea;
  session?: MockStorageArea;
  onChanged: {
    listeners: Array<(changes: unknown, area: string) => void>;
    addListener: (listener: (changes: unknown, area: string) => void) => void;
    removeListener: (listener: (changes: unknown, area: string) => void) => void;
  };
}

function makeArea(): MockStorageArea {
  const area: MockStorageArea = {
    data: {},
    async get(key) {
      if (key === undefined) return { ...area.data };
      if (typeof key === 'string') {
        return key in area.data ? { [key]: area.data[key] } : {};
      }
      if (Array.isArray(key)) {
        const out: Record<string, unknown> = {};
        for (const k of key) if (k in area.data) out[k] = area.data[k];
        return out;
      }
      // Object form: defaults
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(key)) {
        out[k] = k in area.data ? area.data[k] : (key as Record<string, unknown>)[k];
      }
      return out;
    },
    async set(kv) {
      for (const [k, v] of Object.entries(kv)) area.data[k] = v;
    },
    async remove(key) {
      const keys = typeof key === 'string' ? [key] : key;
      for (const k of keys) delete area.data[k];
    },
    async clear() {
      area.data = {};
    },
  };
  return area;
}

function makeStorage(): MockStorage {
  const local = makeArea();
  const managed = makeArea();
  const session = makeArea();
  const onChanged = {
    listeners: [] as Array<(changes: unknown, area: string) => void>,
    addListener(l: (changes: unknown, area: string) => void) {
      onChanged.listeners.push(l);
    },
    removeListener(l: (changes: unknown, area: string) => void) {
      const i = onChanged.listeners.indexOf(l);
      if (i >= 0) onChanged.listeners.splice(i, 1);
    },
  };

  // Wrap set to fire onChanged.
  const wrap = (area: MockStorageArea, name: 'local' | 'managed' | 'session') => {
    const origSet = area.set;
    area.set = async (kv: Record<string, unknown>) => {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
      for (const [k, v] of Object.entries(kv)) {
        changes[k] = { oldValue: area.data[k], newValue: v };
      }
      await origSet.call(area, kv);
      for (const l of onChanged.listeners) l(changes, name);
    };
  };
  wrap(local, 'local');
  wrap(managed, 'managed');
  wrap(session, 'session');

  return { local, managed, session, onChanged };
}

const storage = makeStorage();

(globalThis as unknown as { chrome?: unknown }).chrome = {
  storage,
  runtime: {
    id: 'harbor-test',
    sendMessage: async () => undefined,
    getURL: (path: string) => `chrome-extension://harbor-test/${path}`,
    onMessage: { addListener() {}, removeListener() {} },
  },
  windows: {
    create: async () => ({ id: 1 }),
    remove: async () => undefined,
    get: async () => ({ id: 1, tabs: [] }),
    onRemoved: { addListener() {} },
  },
  tabs: {
    update: async () => undefined,
  },
};

// =============================================================================
// Test helpers
// =============================================================================

export function getMockStorage(): MockStorage {
  return storage;
}

export function resetMockBrowser(): void {
  storage.local.data = {};
  storage.managed.data = {};
  if (storage.session) storage.session.data = {};
  storage.onChanged.listeners.length = 0;
}
