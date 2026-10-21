import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { chaosModes } from '@/api/chaos';
import { getToken, maskToken } from '@/auth/token';
import { useClaimRecords } from '@/claims/journal';
import type { ReconciledBalance } from '@/claims/reconcile';
import { displayStatus, isOpen, type ClaimRecord } from '@/claims/record';
import { Screen } from '@/components/Screen';
import { StatusChip } from '@/components/StatusChip';
import { TokenForm } from '@/components/TokenForm';
import { Banner, Button, Card, CenteredLoader, text } from '@/components/ui';
import { BALANCES_REFRESH_MS, useBalances } from '@/hooks/useBalances';
import { useNow } from '@/hooks/useNow';
import { describeError, formatAge, formatTime } from '@/lib/format';
import { formatUnits, formatUsd, toUsdCents } from '@/money/amount';
import { colors, spacing } from '@/theme';

/** Snapshots older than this are flagged as stale (server recomputes every 15s). */
const STALE_AFTER_MS = 60_000;

export default function HomeScreen() {
  const [changingToken, setChangingToken] = useState(false);
  const { balances, asOf, error, isPending, isFetching, refetch, dataUpdatedAt } = useBalances();
  const { records } = useClaimRecords();
  const now = useNow();

  if (changingToken) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Change token' }} />
        <TokenForm onCancel={() => setChangingToken(false)} />
      </Screen>
    );
  }

  const errorInfo = error ? describeError(error) : null;
  const changeTokenButton = (
    <Button title="Change token" variant="secondary" onPress={() => setChangingToken(true)} />
  );

  const snapshotAge = asOf ? now - Date.parse(asOf) : 0;
  const recentClaims = records.filter((r) => isOpen(r) || now - r.updatedAt < 10 * 60_000);
  const modes = chaosModes();

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={isFetching && !isPending} onRefresh={() => void refetch()} />
      }
    >
      <Stack.Screen options={{ title: 'Payback' }} />

      <View style={styles.headerRow}>
        <Text style={text.muted}>Token {maskToken(getToken() ?? '')}</Text>
        <Button title="Change token" variant="ghost" onPress={() => setChangingToken(true)} />
      </View>

      {modes.length > 0 ? (
        <Banner tone="warning" title={`Test mode: ${modes.join(', ')}`}>
          Faults are injected on purpose. Open the app with ?chaos=off to disable.
        </Banner>
      ) : null}

      {isPending && !error ? <CenteredLoader label="Loading balances…" /> : null}

      {errorInfo && !balances ? (
        <Banner
          tone="danger"
          title={errorInfo.title}
          action={
            errorInfo.auth ? (
              changeTokenButton
            ) : (
              <Button title="Try again" onPress={() => refetch()} />
            )
          }
        >
          {errorInfo.message}
        </Banner>
      ) : null}

      {balances && asOf ? (
        <>
          {errorInfo ? (
            <Banner
              tone="warning"
              title="Couldn't refresh"
              action={
                errorInfo.auth ? (
                  changeTokenButton
                ) : (
                  <Button title="Retry" variant="secondary" onPress={() => refetch()} />
                )
              }
            >
              {`${errorInfo.message} Showing the last snapshot from ${formatTime(asOf)}.`}
            </Banner>
          ) : null}

          <TotalsCard
            balances={balances}
            asOf={asOf}
            snapshotAge={snapshotAge}
            fetchedAge={now - dataUpdatedAt}
            refreshing={isFetching}
            onRefresh={() => refetch()}
          />

          {recentClaims.length > 0 ? <ClaimsCard records={recentClaims} /> : null}

          <Text style={text.heading}>Assets</Text>
          {balances.map((b) => (
            <AssetCard key={b.asset} balance={b} />
          ))}

          <Button
            title="View activity"
            variant="secondary"
            onPress={() => router.push('/activity')}
          />
        </>
      ) : null}
    </Screen>
  );
}

function TotalsCard({
  balances,
  asOf,
  snapshotAge,
  fetchedAge,
  refreshing,
  onRefresh,
}: {
  balances: ReconciledBalance[];
  asOf: string;
  snapshotAge: number;
  fetchedAge: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  let total = 0n;
  let claimable = 0n;
  for (const b of balances) {
    total += toUsdCents(b.available + b.pending + b.claiming, b.decimals, b.usdPrice);
    claimable += toUsdCents(b.claimable, b.decimals, b.usdPrice);
  }
  const stale = snapshotAge > STALE_AFTER_MS;

  return (
    <Card>
      <Text style={text.muted}>Claimable now</Text>
      <Text style={styles.total} testID="total-claimable">
        {formatUsd(claimable)}
      </Text>
      <Text style={text.muted}>
        {`Total payback ${formatUsd(total)} (available + pending + claiming)`}
      </Text>
      <View style={styles.freshRow}>
        <Text style={[text.muted, stale && styles.stale]} testID="freshness">
          {`Snapshot ${formatAge(snapshotAge)} (${formatTime(asOf)}) · checked ${formatAge(fetchedAge)}`}
        </Text>
        <Button title="Refresh" variant="ghost" onPress={onRefresh} loading={refreshing} />
      </View>
      {stale ? (
        <Text style={[text.muted, styles.stale]}>
          This data may be out of date. Balances refresh every {BALANCES_REFRESH_MS / 1000}s.
        </Text>
      ) : null}
    </Card>
  );
}

function AssetCard({ balance: b }: { balance: ReconciledBalance }) {
  const usd = toUsdCents(b.available, b.decimals, b.usdPrice);
  return (
    <Card>
      <View style={styles.assetHeader}>
        <Text style={text.heading}>{b.asset}</Text>
        <Text style={text.muted}>{formatUsd(usd)}</Text>
      </View>
      <Amount
        label="Available"
        value={formatUnits(b.available, b.decimals)}
        asset={b.asset}
        strong
      />
      <Amount label="Pending" value={formatUnits(b.pending, b.decimals)} asset={b.asset} />
      <Amount label="Claiming" value={formatUnits(b.claiming, b.decimals)} asset={b.asset} />
      {b.inFlight > 0n ? (
        <Text style={text.muted}>
          {`Includes your claim of ${formatUnits(b.inFlight, b.decimals)} ${b.asset}, not yet in the server snapshot.`}
        </Text>
      ) : null}
      <Button
        title={`Claim ${b.asset}`}
        onPress={() => router.push({ pathname: '/claim/[asset]', params: { asset: b.asset } })}
        disabled={b.claimable === 0n}
        testID={`claim-${b.asset}`}
      />
    </Card>
  );
}

function Amount({
  label,
  value,
  asset,
  strong,
}: {
  label: string;
  value: string;
  asset: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.amountRow}>
      <Text style={text.muted}>{label}</Text>
      <Text style={[styles.amount, strong && styles.amountStrong]} selectable>
        {`${value} ${asset}`}
      </Text>
    </View>
  );
}

function ClaimsCard({ records }: { records: ClaimRecord[] }) {
  return (
    <Card>
      <Text style={text.heading}>Your claims</Text>
      {records.map((r) => (
        <Pressable
          key={r.key}
          onPress={() => router.push({ pathname: '/claims/[key]', params: { key: r.key } })}
          style={styles.claimRow}
          accessibilityRole="link"
        >
          <Text style={text.body}>{`${r.body.amount} ${r.body.asset}`}</Text>
          <StatusChip status={displayStatus(r)} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontSize: 32, fontWeight: '700', color: colors.text },
  freshRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stale: { color: '#B45309' },
  assetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  amount: { fontSize: 14, color: colors.text, textAlign: 'right', flexShrink: 1 },
  amountStrong: { fontWeight: '700', fontSize: 16 },
  claimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
