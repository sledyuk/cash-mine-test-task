import { useSyncExternalStore } from 'react';

import type { ClaimBody } from '@/api/types';
import { tokenScope, useToken } from '@/auth/token';
import { getItem, setItem, withLock } from '@/lib/storage';

import { isUnresolved, newRecord, transition, type ClaimEvent, type ClaimRecord } from './record';

// Claim records persisted per token in localStorage, shared by every tab.
// All read-modify-write cycles run under a cross-tab lock.

const RETENTION_MS = 24 * 60 * 60 * 1000;

const storageKey = (scope: string) => `cashmine.claims.${scope}`;
const lockName = (scope: string) => `cashmine.claims.${scope}`;

const EMPTY: ClaimRecord[] = [];
const cache = new Map<string, { raw: string | null; records: ClaimRecord[] }>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function readRecords(scope: string): ClaimRecord[] {
  const raw = getItem(storageKey(scope));
  const cached = cache.get(scope);
  if (cached && cached.raw === raw) return cached.records;

  let records: ClaimRecord[] = EMPTY;
  if (raw) {
    try {
      records = JSON.parse(raw) as ClaimRecord[];
    } catch {
      records = EMPTY;
    }
  }
  cache.set(scope, { raw, records });
  return records;
}

function writeRecords(scope: string, records: ClaimRecord[]) {
  const now = Date.now();
  // Keep open claims forever; drop finished ones after a day.
  const kept = records.filter(
    (r) => isUnresolved(r) || r.claim?.status === 'pending' || now - r.updatedAt < RETENTION_MS,
  );
  setItem(storageKey(scope), JSON.stringify(kept));
  emit();
}

function newKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export type StartResult = { ok: true; record: ClaimRecord } | { ok: false; blockedBy: ClaimRecord };

/**
 * Records a new claim intent, unless a claim for the same asset is still unresolved
 * (in this tab or any other). The check and the write happen under one lock.
 */
export function startClaim(scope: string, body: ClaimBody, decimals: number): Promise<StartResult> {
  return withLock(lockName(scope), () => {
    const records = readRecords(scope);
    const blockedBy = records.find((r) => r.body.asset === body.asset && isUnresolved(r));
    if (blockedBy) return { ok: false, blockedBy } as const;

    const record = newRecord(newKey(), body, decimals, Date.now());
    writeRecords(scope, [record, ...records]);
    return { ok: true, record } as const;
  });
}

/** Applies an event to one record under the lock and returns the updated record. */
export function applyEvent(
  scope: string,
  key: string,
  event: ClaimEvent,
): Promise<ClaimRecord | undefined> {
  return withLock(lockName(scope), () => {
    const records = readRecords(scope);
    const index = records.findIndex((r) => r.key === key);
    const current = records[index];
    if (!current) return undefined;

    const next = transition(current, event);
    if (next !== current) {
      const copy = [...records];
      copy[index] = next;
      writeRecords(scope, copy);
    }
    return next;
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Other tabs write to the same keys; re-read on any claims key change.
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith('cashmine.claims.')) emit();
  });
}

export function useClaimRecords(): { scope: string | null; records: ClaimRecord[] } {
  const token = useToken();
  const scope = token ? tokenScope(token) : null;
  const records = useSyncExternalStore(
    subscribe,
    () => (scope ? readRecords(scope) : EMPTY),
    () => EMPTY,
  );
  return { scope, records };
}
