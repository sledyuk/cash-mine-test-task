import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getBalances, queryKeys } from '@/api';
import { useClaimRecords } from '@/claims/journal';
import { reconcile, type ReconciledBalance } from '@/claims/reconcile';

/** Server snapshots are recomputed every 15s, so polling faster is pointless. */
export const BALANCES_REFRESH_MS = 15_000;

export function useBalances() {
  const query = useQuery({
    queryKey: queryKeys.balances,
    queryFn: ({ signal }) => getBalances(signal),
    refetchInterval: BALANCES_REFRESH_MS,
  });
  const { records } = useClaimRecords();

  const balances = useMemo<ReconciledBalance[] | undefined>(() => {
    const data = query.data;
    if (!data) return undefined;
    return data.items.map((item) => reconcile(item, data.asOf, records));
  }, [query.data, records]);

  return { ...query, balances, asOf: query.data?.asOf };
}
