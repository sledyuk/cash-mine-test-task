import { StyleSheet, Text, View } from 'react-native';

import { apiConfig } from '@/api';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

export default function HomeScreen() {
  return (
    <Screen>
      <Text style={styles.title}>cash-mine</Text>
      <Text style={styles.body}>Expo Router + TanStack Query are ready.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>API base URL</Text>
        <Text style={styles.value}>{apiConfig.baseUrl || 'not set (see .env.example)'}</Text>
        <Text style={styles.label}>API token</Text>
        <Text style={styles.value}>{apiConfig.token ? 'set' : 'not set'}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.body, color: colors.text, marginBottom: spacing.sm },
});
