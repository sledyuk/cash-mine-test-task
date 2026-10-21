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
 *
 * Likewise, a claim that settled after the snapshot was taken leaves `claiming` at once
 * (and a failed one goes back to `available`) instead of waiting for the next snapshot.
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

    const amount = toUnits(record.body.amount, item.decimals);
    const claim = record.claim;

    if (!claim || snapshotAt < Date.parse(claim.createdAt)) {
      // The snapshot predates the claim. A failed claim returned its amount, so it nets out.
      if (claim?.status === 'failed') continue;
      available -= amount;
      if (!claim || claim.status === 'pending') claiming += amount;
      inFlight += amount;
    } else if (claim.status !== 'pending' && snapshotAt < Date.parse(claim.updatedAt)) {
      // The snapshot still counts the claim as claiming, but we already saw it settle.
      claiming -= amount;
      if (claim.status === 'failed') available += amount;
    }
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
