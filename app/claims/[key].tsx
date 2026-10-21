import { useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useClaimRecords } from '@/claims/journal';
import { displayStatus, type ClaimRecord } from '@/claims/record';
import { sendClaim } from '@/claims/runner';
import { Screen } from '@/components/Screen';
import { StatusChip } from '@/components/StatusChip';
import { Banner, Button, Card, KeyValue, text } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { formatDateTime } from '@/lib/format';
import { colors, spacing } from '@/theme';

export default function ClaimStatusScreen() {
  const { key = '' } = useLocalSearchParams<{ key: string }>();
  const { records } = useClaimRecords();
  const record = records.find((r) => r.key === key);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Claim status' }} />
      {record ? (
        <ClaimStatus record={record} />
      ) : (
        <Banner tone="info" title="Claim not found on this device">
          Claims made on other devices or more than a day ago are listed in Activity.
        </Banner>
      )}
      <Button title="Back to balances" variant="secondary" onPress={() => router.dismissTo('/')} />
    </Screen>
  );
}

function ClaimStatus({ record }: { record: ClaimRecord }) {
  const queryClient = useQueryClient();
  const { scope } = useClaimRecords();
  const now = useNow();
  const status = displayStatus(record);
  const { asset, amount } = record.body;
  const claim = record.claim;

  return (
    <>
      <Card>
        <View style={styles.header}>
          <Text style={text.heading}>{`${amount} ${asset}`}</Text>
          <StatusChip status={status} />
        </View>
        {claim ? (
          <>
            <KeyValue label="Fee" value={`− ${claim.fee} ${asset}`} />
            <KeyValue label="You receive" value={`${claim.receiveAmount} ${asset}`} strong />
            <KeyValue label="Claim ID" value={claim.id} />
            <KeyValue label="Created" value={formatDateTime(claim.createdAt)} />
          </>
        ) : null}
      </Card>

      {status === 'submitting' ? (
        <View style={styles.progress}>
          <ActivityIndicator color={colors.primary} />
          <Text style={text.body}>Submitting your claim…</Text>
        </View>
      ) : null}

      {status === 'unknown' ? (
        <Banner
          tone="warning"
          title="We're confirming your claim"
          action={
            <Button
              title="Check now"
              variant="secondary"
              onPress={() => scope && void sendClaim(scope, record.key, queryClient)}
              testID="check-now"
            />
          }
        >
          {`We didn't get a clear answer from the server (${record.error?.message ?? 'no response'}). Your claim may already have gone through. We keep checking with the same request, so it can never be submitted twice. ${
            record.nextAttemptAt && record.nextAttemptAt > now
              ? `Next check in ${Math.ceil((record.nextAttemptAt - now) / 1000)}s.`
              : 'Checking…'
          } Attempts: ${record.attempts}.`}
        </Banner>
      ) : null}

      {status === 'pending' ? (
        <Banner tone="info" title="Claim submitted">
          {`${record.replayed ? 'We found the claim you already submitted, so no new claim was made. ' : ''}It is being processed and usually completes within about 20 seconds. You can leave this screen.`}
        </Banner>
      ) : null}

      {status === 'completed' ? (
        <Banner tone="success" title="Claim completed">
          {`${claim?.receiveAmount ?? ''} ${asset} was sent to your destination.`}
        </Banner>
      ) : null}

      {status === 'failed' ? (
        <Banner tone="danger" title="Claim failed">
          {`${claim?.failureReason ?? 'The claim could not be completed.'} The amount is back in your available balance.`}
        </Banner>
      ) : null}

      {status === 'rejected' ? (
        <Banner
          tone="danger"
          title="Claim not submitted"
          action={
            <Button
              title="Try again"
              onPress={() => router.replace({ pathname: '/claim/[asset]', params: { asset } })}
            />
          }
        >
          {`${record.error?.message ?? 'The server rejected the claim.'} Nothing was claimed.${
            record.error?.field === 'amount'
              ? ' Your balance may have changed; we refreshed it.'
              : ''
          }`}
        </Banner>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
