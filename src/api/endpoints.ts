import { request, requestRaw } from './client';
import type { ActivityPage, Balances, Claim, ClaimBody, ClaimOptions } from './types';

export function getBalances(signal?: AbortSignal) {
  return request<Balances>('/v1/balances', { signal });
}

export function getClaimOptions(asset: string, signal?: AbortSignal) {
  return request<ClaimOptions>('/v1/claim-options', { query: { asset }, signal });
}

export function getClaim(id: string, signal?: AbortSignal) {
  return request<Claim>(`/v1/claims/${encodeURIComponent(id)}`, { signal });
}

export function getActivity(cursor: string | null, signal?: AbortSignal) {
  return request<ActivityPage>('/v1/activity', { query: { limit: 20, cursor }, signal });
}

/** Creates (or, with a reused key and identical body, replays) a claim. */
export async function createClaim(idempotencyKey: string, body: ClaimBody) {
  const res = await requestRaw<Claim>('/v1/claims', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return { claim: res.data, replayed: res.headers.get('Idempotent-Replayed') === 'true' };
}

export const queryKeys = {
  balances: ['balances'] as const,
  claimOptions: (asset: string) => ['claim-options', asset] as const,
  activity: ['activity'] as const,
};
