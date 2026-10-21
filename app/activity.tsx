import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getActivity, queryKeys, type ActivityItem } from '@/api';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, CenteredLoader, text } from '@/components/ui';
import { describeError, formatDateTime } from '@/lib/format';
import { colors, spacing } from '@/theme';

const TYPE_LABEL: Record<ActivityItem['type'], string> = {
  accrual: 'Payback',
  reversal: 'Reversal',
  claim: 'Claim',
};

export default function ActivityScreen() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.activity,
    queryFn: ({ pageParam, signal }) => getActivity(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  // New items can arrive while paging; never show the same entry twice.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  }, [query.data]);

  const errorInfo = query.error ? describeError(query.error) : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Activity' }} />

      {query.isPending && !query.error ? <CenteredLoader label="Loading activity…" /> : null}

      {errorInfo && items.length === 0 ? (
        <Banner
          tone="danger"
          title={errorInfo.title}
          action={<Button title="Try again" onPress={() => query.refetch()} />}
        >
          {errorInfo.message}
        </Banner>
      ) : null}

      {!query.isPending && items.length === 0 && !errorInfo ? (
        <Text style={text.muted}>No activity yet.</Text>
      ) : null}

      {items.map((item) => (
        <ActivityRow key={item.id} item={item} />
      ))}

      {errorInfo && items.length > 0 ? (
        <Banner tone="warning" title={`Couldn't load more: ${errorInfo.title}`} />
      ) : null}

      {query.hasNextPage ? (
        <Button
          title="Load more"
          variant="secondary"
          onPress={() => query.fetchNextPage()}
          loading={query.isFetchingNextPage}
        />
      ) : items.length > 0 ? (
        <Text style={[text.muted, styles.end]}>That&apos;s everything.</Text>
      ) : null}
    </Screen>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const negative = item.amount.startsWith('-');
  return (
    <Card>
      <View style={styles.row}>
        <Text style={text.body}>
          {TYPE_LABEL[item.type]}
          {item.exchange ? ` · ${item.exchange}` : ''}
        </Text>
        <Text style={[styles.amount, negative ? styles.negative : styles.positive]}>
          {`${negative ? '' : '+'}${item.amount} ${item.asset}`}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={text.muted}>{formatDateTime(item.createdAt)}</Text>
        <Text style={text.muted}>{item.status}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  amount: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  negative: { color: colors.danger },
  positive: { color: '#15803D' },
  end: { textAlign: 'center' },
});
