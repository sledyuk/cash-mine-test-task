// Thin wrapper over localStorage. It can be missing (native, SSR) or throw
// (private mode, quota), and the app must keep working in memory then.

const memory = new Map<string, string>();

function local(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getItem(key: string): string | null {
  try {
    return local()?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function setItem(key: string, value: string): void {
  memory.set(key, value);
  try {
    local()?.setItem(key, value);
  } catch {
    // keep the in-memory copy
  }
}

export function removeItem(key: string): void {
  memory.delete(key);
  try {
    local()?.removeItem(key);
  } catch {
    // ignore
  }
}

/** Fires when another tab changes `key`. Returns an unsubscribe function. */
export function onExternalChange(key: string, callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key === key || event.key === null) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/**
 * Runs `fn` while holding a lock shared by all tabs of this origin (Web Locks API).
 * Falls back to running directly where the API is missing.
 */
export async function withLock<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return fn();
  return locks.request(name, async () => fn());
}

/** Like withLock, but skips (returns null) if another tab holds the lock. */
export async function tryWithLock<T>(name: string, fn: () => Promise<T> | T): Promise<T | null> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return fn();
  return locks.request(name, { ifAvailable: true }, async (lock) => (lock ? fn() : null));
}
