import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ApiError, createClaim, getClaim, queryKeys } from '@/api';
import { REQUEST_TIMEOUT_MS } from '@/api/config';
import { tryWithLock } from '@/lib/storage';

import { applyEvent, readRecords, useClaimRecords } from './journal';
import { retryDelayMs, type ClaimRecord } from './record';

// Drives claim records forward: sends, retries unknown outcomes with the same
// Idempotency-Key and body, and polls pending claims until they settle.
// Only one tab sends a given key at a time (per-key Web Lock).

const POLL_INTERVAL_MS = 2000;
/** A "submitting" record older than this was abandoned (tab closed mid-request). */
const STALE_SUBMITTING_MS = REQUEST_TIMEOUT_MS + 5000;

const sending = new Set<string>();
const nextPollAt = new Map<string, number>();

function refreshServerData(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.balances });
  void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
}

function toRecordError(error: unknown): ClaimRecord['error'] {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message, field: error.field };
  }
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) };
}

export async function sendClaim(scope: string, key: string, queryClient: QueryClient) {
  if (sending.has(key)) return;
  sending.add(key);
  try {
    await tryWithLock(`cashmine.send.${key}`, async () => {
      const record = await applyEvent(scope, key, { type: 'send', at: Date.now() });
      if (!record || record.phase !== 'submitting') return;

      try {
        const { claim, replayed } = await createClaim(record.key, record.body);
        await applyEvent(scope, key, { type: 'accepted', claim, replayed, at: Date.now() });
        refreshServerData(queryClient);
      } catch (error) {
        if (error instanceof ApiError && error.rejected) {
          // The server definitely did not create a claim.
          await applyEvent(scope, key, {
            type: 'rejected',
            error: toRecordError(error),
            at: Date.now(),
          });
          // Usually means our snapshot was stale (e.g. amount > live available).
          refreshServerData(queryClient);
        } else {
          // Timeout, 5xx, lost connection or rate limit: the claim may or may not exist.
          const retryAfterMs = error instanceof ApiError ? error.retryAfterMs : undefined;
          await applyEvent(scope, key, {
            type: 'unknown',
            error: toRecordError(error),
            retryInMs: retryDelayMs(record.attempts, retryAfterMs),
            at: Date.now(),
          });
        }
      }
    });
  } finally {
    sending.delete(key);
  }
}

async function pollClaim(scope: string, record: ClaimRecord, queryClient: QueryClient) {
  const claim = record.claim;
  if (!claim) return;
  nextPollAt.set(record.key, Date.now() + POLL_INTERVAL_MS);
  try {
    const latest = await getClaim(claim.id);
    await applyEvent(scope, record.key, { type: 'claim-updated', claim: latest, at: Date.now() });
    if (latest.status !== 'pending') refreshServerData(queryClient);
  } catch (error) {
    if (error instanceof ApiError && error.retryAfterMs) {
      nextPollAt.set(record.key, Date.now() + error.retryAfterMs);
    }
    // Otherwise just try again on the next tick.
  }
}

function tick(scope: string, queryClient: QueryClient) {
  const now = Date.now();
  for (const record of readRecords(scope)) {
    if (record.phase === 'unknown' && (record.nextAttemptAt ?? 0) <= now) {
      void sendClaim(scope, record.key, queryClient);
    } else if (
      record.phase === 'submitting' &&
      !sending.has(record.key) &&
      now - record.updatedAt > STALE_SUBMITTING_MS
    ) {
      void sendClaim(scope, record.key, queryClient);
    } else if (
      record.phase === 'accepted' &&
      record.claim?.status === 'pending' &&
      (nextPollAt.get(record.key) ?? 0) <= now
    ) {
      void pollClaim(scope, record, queryClient);
    }
  }
}

/** Mount once at the root: resumes open claims on load and keeps them moving. */
export function useClaimRunner() {
  const queryClient = useQueryClient();
  const { scope } = useClaimRecords();

  useEffect(() => {
    if (!scope) return;
    tick(scope, queryClient);
    const interval = setInterval(() => tick(scope, queryClient), 1000);
    const onOnline = () => tick(scope, queryClient);
    if (typeof window !== 'undefined') window.addEventListener?.('online', onOnline);
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') window.removeEventListener?.('online', onOnline);
    };
  }, [scope, queryClient]);
}
