import type { Claim, ClaimBody } from '@/api/types';

// A ClaimRecord is this device's durable memory of one claim the user confirmed.
// It is written BEFORE the request goes out, so a crash, reload or lost response
// can never lose the idempotency key or let the same intent be sent with a new key.
//
//   submitting ──accepted──▶ accepted (claim.status: pending → completed | failed)
//       │  ▲
//   unknown│ │ retry with the SAME key and body
//       ▼  │
//     unknown ──rejected──▶ rejected (server said no; nothing was claimed)

export type ClaimPhase = 'submitting' | 'unknown' | 'accepted' | 'rejected';

export type ClaimRecord = {
  key: string;
  body: ClaimBody;
  decimals: number;
  phase: ClaimPhase;
  claim: Claim | null;
  /** The server answered a retry with the original claim (Idempotent-Replayed). */
  replayed: boolean;
  error: { code: string; message: string; field?: string } | null;
  attempts: number;
  nextAttemptAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ClaimEvent =
  | { type: 'send'; at: number }
  | { type: 'accepted'; claim: Claim; replayed: boolean; at: number }
  | { type: 'unknown'; error: ClaimRecord['error']; retryInMs: number; at: number }
  | { type: 'rejected'; error: ClaimRecord['error']; at: number }
  | { type: 'claim-updated'; claim: Claim; at: number };

export function newRecord(key: string, body: ClaimBody, decimals: number, at: number): ClaimRecord {
  return {
    key,
    body,
    decimals,
    phase: 'submitting',
    claim: null,
    replayed: false,
    error: null,
    attempts: 0,
    nextAttemptAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

/** Pure state transition. Events that don't apply to the current phase are ignored. */
export function transition(record: ClaimRecord, event: ClaimEvent): ClaimRecord {
  switch (event.type) {
    case 'send':
      if (record.phase !== 'submitting' && record.phase !== 'unknown') return record;
      return {
        ...record,
        phase: 'submitting',
        attempts: record.attempts + 1,
        nextAttemptAt: null,
        updatedAt: event.at,
      };

    case 'accepted':
      // A late success always wins over "unknown", but never over a settled state.
      if (record.phase === 'accepted' || record.phase === 'rejected') return record;
      return {
        ...record,
        phase: 'accepted',
        claim: event.claim,
        replayed: event.replayed,
        error: null,
        nextAttemptAt: null,
        updatedAt: event.at,
      };

    case 'unknown':
      if (record.phase !== 'submitting') return record;
      return {
        ...record,
        phase: 'unknown',
        error: event.error,
        nextAttemptAt: event.at + event.retryInMs,
        updatedAt: event.at,
      };

    case 'rejected':
      if (record.phase !== 'submitting') return record;
      return {
        ...record,
        phase: 'rejected',
        error: event.error,
        nextAttemptAt: null,
        updatedAt: event.at,
      };

    case 'claim-updated':
      if (record.phase !== 'accepted' || record.claim?.id !== event.claim.id) return record;
      // Never move a settled claim back to pending on a stale read.
      if (record.claim.status !== 'pending' && event.claim.status === 'pending') return record;
      return { ...record, claim: event.claim, updatedAt: event.at };
  }
}

export type ClaimDisplayStatus =
  'submitting' | 'unknown' | 'pending' | 'completed' | 'failed' | 'rejected';

export function displayStatus(record: ClaimRecord): ClaimDisplayStatus {
  if (record.phase === 'accepted') return record.claim?.status ?? 'pending';
  return record.phase;
}

/** The outcome of sending is not known yet: block new claims for this asset. */
export function isUnresolved(record: ClaimRecord): boolean {
  return record.phase === 'submitting' || record.phase === 'unknown';
}

/** Still needs work from the app (sending, retrying or polling). */
export function isOpen(record: ClaimRecord): boolean {
  return (
    isUnresolved(record) || (record.phase === 'accepted' && record.claim?.status === 'pending')
  );
}

/** Exponential backoff for unknown outcomes, capped. */
export function retryDelayMs(attempts: number, retryAfterMs?: number): number {
  if (retryAfterMs) return retryAfterMs;
  return Math.min(2000 * 2 ** Math.max(0, attempts - 1), 30_000);
}
