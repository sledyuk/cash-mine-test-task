import type { BalanceItem } from '@/api/types';
import { toUnits } from '@/money/amount';

import type { ClaimRecord } from './record';

export type ReconciledBalance = {
  asset: string;
  decimals: number;
  usdPrice: string;
  available: bigint;
  pending: bigint;
  claiming: bigint;
  /** Amount of this device's claims not yet reflected in the server snapshot. */
  inFlight: bigint;
  /** What the user can claim right now (never negative). */
  claimable: bigint;
};

/**
 * Derives what the user sees from the server snapshot plus this device's claim records.
 * Balances are never edited locally; they are recomputed from these two inputs.
 *
 * A claim counts locally (moved from available to claiming) only until a snapshot taken
 * at or after the claim's creation arrives. From then on the snapshot is the truth.
 * So the balance drops as soon as the user claims (no double claims) and does not jump
 * back up when the next snapshot still predates the claim.
 */
export function reconcile(
  item: BalanceItem,
  asOf: string,
  records: readonly ClaimRecord[],
): ReconciledBalance {
  const snapshotAt = Date.parse(asOf);
  let available = toUnits(item.available, item.decimals);
  let claiming = toUnits(item.claiming, item.decimals);
  let inFlight = 0n;

  for (const record of records) {
    if (record.body.asset !== item.asset || record.phase === 'rejected') continue;

    const claim = record.claim;
    if (claim) {
      // Failed claims return their amount to available on the server.
      if (claim.status === 'failed') continue;
      // The snapshot already includes this claim.
      if (snapshotAt >= Date.parse(claim.createdAt)) continue;
    }

    const amount = toUnits(record.body.amount, item.decimals);
    available -= amount;
    if (!claim || claim.status === 'pending') claiming += amount;
    inFlight += amount;
  }

  return {
    asset: item.asset,
    decimals: item.decimals,
    usdPrice: item.usdPrice,
    available,
    pending: toUnits(item.pending, item.decimals),
    claiming,
    inFlight,
    claimable: available > 0n ? available : 0n,
  };
}
