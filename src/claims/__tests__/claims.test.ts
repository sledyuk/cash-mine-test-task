import type { BalanceItem, Claim } from '@/api/types';
import { toUnits } from '@/money/amount';

import { reconcile } from '../reconcile';
import { displayStatus, isUnresolved, newRecord, transition, type ClaimRecord } from '../record';

const body = { asset: 'ETH', amount: '0.5', destinationId: 'dest_wallet' };
const eth = (units: string) => toUnits(units, 18);

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'clm_1',
    asset: 'ETH',
    amount: '0.5',
    fee: '0.0012',
    receiveAmount: '0.4988',
    destinationId: 'dest_wallet',
    status: 'pending',
    failureReason: null,
    createdAt: '2026-10-21T08:00:10.000Z',
    updatedAt: '2026-10-21T08:00:10.000Z',
    ...overrides,
  };
}

const error = { code: 'TIMEOUT', message: 'timed out' };

describe('claim record transitions', () => {
  const fresh = () => newRecord('key-1', body, 18, 0);

  it('goes submitting → unknown → submitting (same key) → accepted', () => {
    let r = transition(fresh(), { type: 'send', at: 1 });
    expect(r).toMatchObject({ phase: 'submitting', attempts: 1 });

    r = transition(r, { type: 'unknown', error, retryInMs: 2000, at: 2 });
    expect(r).toMatchObject({ phase: 'unknown', nextAttemptAt: 2002 });
    expect(isUnresolved(r)).toBe(true);

    r = transition(r, { type: 'send', at: 3 });
    expect(r).toMatchObject({ phase: 'submitting', attempts: 2, key: 'key-1', body });

    r = transition(r, { type: 'accepted', claim: claim(), replayed: true, at: 4 });
    expect(r).toMatchObject({ phase: 'accepted', replayed: true, error: null });
    expect(displayStatus(r)).toBe('pending');
  });

  it('ignores late failures once accepted, and never re-sends an accepted claim', () => {
    const accepted = transition(transition(fresh(), { type: 'send', at: 1 }), {
      type: 'accepted',
      claim: claim(),
      replayed: false,
      at: 2,
    });
    expect(transition(accepted, { type: 'unknown', error, retryInMs: 1, at: 3 })).toBe(accepted);
    expect(transition(accepted, { type: 'rejected', error, at: 3 })).toBe(accepted);
    expect(transition(accepted, { type: 'send', at: 3 })).toBe(accepted);
  });

  it('settles via claim updates and never goes back to pending', () => {
    let r = transition(fresh(), { type: 'accepted', claim: claim(), replayed: false, at: 1 });
    r = transition(r, { type: 'claim-updated', claim: claim({ status: 'completed' }), at: 2 });
    expect(displayStatus(r)).toBe('completed');

    const stale = transition(r, { type: 'claim-updated', claim: claim(), at: 3 });
    expect(displayStatus(stale)).toBe('completed');
  });

  it('marks a definitive server rejection as rejected and stops retrying', () => {
    const r = transition(transition(fresh(), { type: 'send', at: 1 }), {
      type: 'rejected',
      error: { code: 'VALIDATION', message: 'too much', field: 'amount' },
      at: 2,
    });
    expect(r).toMatchObject({ phase: 'rejected', nextAttemptAt: null });
    expect(isUnresolved(r)).toBe(false);
  });
});

describe('reconcile (balance after claim)', () => {
  const item: BalanceItem = {
    asset: 'ETH',
    decimals: 18,
    available: '10',
    pending: '0.02',
    claiming: '0',
    usdPrice: '2461.08',
  };
  const accepted = (c: Claim): ClaimRecord => ({
    ...newRecord('k', body, 18, 0),
    phase: 'accepted',
    claim: c,
  });

  it('moves an in-flight claim from available to claiming right away', () => {
    const unknown: ClaimRecord = { ...newRecord('k', body, 18, 0), phase: 'unknown' };
    const r = reconcile(item, '2026-10-21T08:00:00.000Z', [unknown]);
    expect(r.available).toBe(eth('9.5'));
    expect(r.claiming).toBe(eth('0.5'));
    expect(r.inFlight).toBe(eth('0.5'));
  });

  it('keeps the adjustment while the snapshot predates the claim (no jump back up)', () => {
    const r = reconcile(item, '2026-10-21T08:00:05.000Z', [accepted(claim())]);
    expect(r.available).toBe(eth('9.5'));
  });

  it('hands over to the server once the snapshot includes the claim (no double count)', () => {
    const serverItem = { ...item, available: '9.5', claiming: '0.5' };
    const r = reconcile(serverItem, '2026-10-21T08:00:15.000Z', [accepted(claim())]);
    expect(r.available).toBe(eth('9.5'));
    expect(r.claiming).toBe(eth('0.5'));
    expect(r.inFlight).toBe(0n);
  });

  it('ignores failed and rejected claims and other assets', () => {
    const failed = accepted(claim({ status: 'failed', failureReason: 'x' }));
    const rejected: ClaimRecord = { ...newRecord('k2', body, 18, 0), phase: 'rejected' };
    const btc: ClaimRecord = {
      ...newRecord('k3', { ...body, asset: 'BTC' }, 8, 0),
      phase: 'unknown',
    };
    const r = reconcile(item, '2026-10-21T08:00:00.000Z', [failed, rejected, btc]);
    expect(r.available).toBe(eth('10'));
    expect(r.inFlight).toBe(0n);
  });

  it('never offers a negative claimable amount', () => {
    const big: ClaimRecord = {
      ...newRecord('k', { ...body, amount: '12' }, 18, 0),
      phase: 'unknown',
    };
    const r = reconcile(item, '2026-10-21T08:00:00.000Z', [big]);
    expect(r.available).toBe(eth('-2'));
    expect(r.claimable).toBe(0n);
  });
});
