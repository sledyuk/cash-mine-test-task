import { useSyncExternalStore } from 'react';

import { getItem, onExternalChange, removeItem, setItem } from '@/lib/storage';

// The token is entered by the user at runtime and kept only in this browser.
// It is never part of the source, the repo or the build.
const TOKEN_KEY = 'cashmine.token';

let current: string | null = getItem(TOKEN_KEY);
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

onExternalChange(TOKEN_KEY, () => {
  current = getItem(TOKEN_KEY);
  emit();
});

export function getToken(): string | null {
  return current;
}

export function setToken(token: string): void {
  current = token.trim();
  setItem(TOKEN_KEY, current);
  emit();
}

export function clearToken(): void {
  current = null;
  removeItem(TOKEN_KEY);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken, getToken);
}

/**
 * Short, non-reversible fingerprint used to scope local data (claim journal) to a token,
 * so switching tokens never mixes one account's claims into another's balances.
 */
export function tokenScope(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function maskToken(token: string): string {
  return token.length <= 10 ? '••••' : `${token.slice(0, 6)}…${token.slice(-4)}`;
}
