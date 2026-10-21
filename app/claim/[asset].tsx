import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getClaimOptions, queryKeys, type ClaimOptions } from '@/api';
import { startClaim, useClaimRecords } from '@/claims/journal';
import type { ReconciledBalance } from '@/claims/reconcile';
import { isUnresolved } from '@/claims/record';
import { sendClaim } from '@/claims/runner';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, CenteredLoader, KeyValue, text } from '@/components/ui';
import { useBalances } from '@/hooks/useBalances';
import { describeError } from '@/lib/format';
import {
  claimErrorMessage,
  formatUnits,
  formatUsd,
  quoteClaim,
  toUnits,
  toUsdCents,
} from '@/money/amount';
import { colors, radius, spacing } from '@/theme';

export default function ClaimScreen() {
  const { asset = '' } = useLocalSearchParams<{ asset: string }>();
  const balancesQuery = useBalances();
  const options = useQuery({
    queryKey: queryKeys.claimOptions(asset),
    queryFn: ({ signal }) => getClaimOptions(asset, signal),
    // Fee and minimum must be current when the user decides.
    staleTime: 0,
  });

  const balance = balancesQuery.balances?.find((b) => b.asset === asset);
  const error = options.error ?? balancesQuery.error;

  return (
    <Screen>
      <Stack.Screen options={{ title: `Claim ${asset}` }} />
      {balance && options.data ? (
        <ClaimForm balance={balance} options={options.data} />
      ) : error ? (
        <Banner
          tone="danger"
          title={describeError(error).title}
          action={
            <Button
              title="Try again"
              onPress={() => {
                void options.refetch();
                void balancesQuery.refetch();
              }}
            />
          }
        >
          {describeError(error).message}
        </Banner>
      ) : balancesQuery.data && !balance ? (
        <Banner tone="danger" title={`No ${asset} balance`}>
          This asset is not in your balances.
        </Banner>
      ) : (
        <CenteredLoader label="Loading claim options…" />
      )}
    </Screen>
  );
}

function ClaimForm({ balance, options }: { balance: ReconciledBalance; options: ClaimOptions }) {
  const queryClient = useQueryClient();
  const { scope, records } = useClaimRecords();
  const { asset, decimals } = balance;

  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [destinationId, setDestinationId] = useState(options.destinations[0]?.id ?? '');
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [submitting, setSubmitting] = useState(false);

  const blocking = records.find((r) => r.body.asset === asset && isUnresolved(r));
  const rules = { decimals, minAmount: options.minAmount, fee: options.fee };
  const quote = quoteClaim(amount, { ...rules, available: balance.claimable });
  const belowMin = balance.claimable < toUnits(options.minAmount, decimals);
  const destination = options.destinations.find((d) => d.id === destinationId);

  async function confirm() {
    if (!quote.ok || !scope || !destination) return;
    setSubmitting(true);
    const body = { asset, amount: formatUnits(quote.amount, decimals), destinationId };
    const result = await startClaim(scope, body, decimals);
    const key = result.ok ? result.record.key : result.blockedBy.key;
    if (result.ok) void sendClaim(scope, key, queryClient);
    router.replace({ pathname: '/claims/[key]', params: { key } });
  }

  if (submitting) return <CenteredLoader label="Submitting your claim…" />;

  if (blocking) {
    return (
      <Banner
        tone="warning"
        title="A claim is still being confirmed"
        action={
          <Button
            title="View that claim"
            onPress={() =>
              router.replace({ pathname: '/claims/[key]', params: { key: blocking.key } })
            }
          />
        }
      >
        {`We haven't confirmed your ${blocking.body.amount} ${asset} claim yet. To avoid claiming twice, new ${asset} claims are paused until we know its outcome.`}
      </Banner>
    );
  }

  if (step === 'review' && quote.ok && destination) {
    return (
      <>
        <Card>
          <Text style={text.heading}>Review your claim</Text>
          <KeyValue label="Amount" value={`${formatUnits(quote.amount, decimals)} ${asset}`} />
          <KeyValue label="Fee" value={`− ${formatUnits(quote.fee, decimals)} ${asset}`} />
          <KeyValue
            label="You receive"
            value={`${formatUnits(quote.receive, decimals)} ${asset}`}
            strong
          />
          <KeyValue
            label="≈ USD"
            value={formatUsd(toUsdCents(quote.receive, decimals, balance.usdPrice))}
          />
          <KeyValue label="To" value={destination.label} />
        </Card>
        <Text style={text.muted}>
          The amount leaves your available balance right away and shows as claiming until it
          completes.
        </Text>
        <Button title="Confirm claim" onPress={confirm} loading={submitting} testID="confirm" />
        <Button
          title="Edit"
          variant="secondary"
          onPress={() => setStep('edit')}
          disabled={submitting}
        />
      </>
    );
  }

  const showError = touched && !quote.ok;

  return (
    <>
      <Card>
        <KeyValue
          label="Available to claim"
          value={`${formatUnits(balance.claimable, decimals)} ${asset}`}
          strong
        />
        <KeyValue label="Minimum" value={`${options.minAmount} ${asset}`} />
        <KeyValue label="Fee" value={`${options.fee} ${asset}`} />
      </Card>

      {belowMin ? (
        <Banner tone="info" title="Not enough to claim yet">
          {`Your available ${asset} is below the minimum claim of ${options.minAmount} ${asset}.`}
        </Banner>
      ) : null}

      <Card>
        <Text style={text.heading}>Amount</Text>
        <View style={styles.inputRow}>
          <TextInput
            testID="amount-input"
            value={amount}
            onChangeText={(t) => setAmount(t)}
            onBlur={() => setTouched(true)}
            placeholder="0.0"
            inputMode="decimal"
            keyboardType="decimal-pad"
            autoCorrect={false}
            style={[styles.input, showError && styles.inputError]}
            accessibilityLabel={`Amount in ${asset}`}
          />
          <Button
            title="Max"
            variant="secondary"
            onPress={() => {
              setAmount(formatUnits(balance.claimable, decimals));
              setTouched(true);
            }}
            disabled={belowMin}
            testID="max"
          />
        </View>
        {showError ? (
          <Text style={text.error} testID="amount-error">
            {claimErrorMessage(quote.error, rules, asset)}
          </Text>
        ) : null}
        {quote.ok ? (
          <View style={styles.quote}>
            <KeyValue label="Fee" value={`− ${formatUnits(quote.fee, decimals)} ${asset}`} />
            <KeyValue
              label="You receive"
              value={`${formatUnits(quote.receive, decimals)} ${asset}`}
              strong
            />
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={text.heading}>Send to</Text>
        {options.destinations.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => setDestinationId(d.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: d.id === destinationId }}
            style={[styles.destination, d.id === destinationId && styles.destinationActive]}
          >
            <View style={[styles.radio, d.id === destinationId && styles.radioActive]} />
            <Text style={text.body}>{d.label}</Text>
          </Pressable>
        ))}
      </Card>

      <Button
        title="Review"
        onPress={() => {
          setTouched(true);
          if (quote.ok && destination) setStep('review');
        }}
        disabled={belowMin || !destination}
        testID="review"
      />
    </>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  quote: { gap: spacing.xs, paddingTop: spacing.xs },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  destinationActive: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.border },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
});
