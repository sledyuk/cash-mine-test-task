import { StyleSheet, Text, View } from 'react-native';

import type { ClaimDisplayStatus } from '@/claims/record';
import { radius, spacing } from '@/theme';

const LABELS: Record<ClaimDisplayStatus, string> = {
  submitting: 'Submitting',
  unknown: 'Confirming',
  pending: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  rejected: 'Not submitted',
};

const TONES: Record<ClaimDisplayStatus, { bg: string; fg: string }> = {
  submitting: { bg: '#EFF6FF', fg: '#1D4ED8' },
  unknown: { bg: '#FFFBEB', fg: '#B45309' },
  pending: { bg: '#EFF6FF', fg: '#1D4ED8' },
  completed: { bg: '#F0FDF4', fg: '#15803D' },
  failed: { bg: '#FEF2F2', fg: '#B91C1C' },
  rejected: { bg: '#F3F4F6', fg: '#374151' },
};

export function StatusChip({ status }: { status: ClaimDisplayStatus }) {
  const tone = TONES[status];
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text style={[styles.label, { color: tone.fg }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  label: { fontSize: 12, fontWeight: '600' },
});
