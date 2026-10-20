import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, typography } from '@/theme';

export default function HomeScreen() {
  return (
    <Screen>
      <Text style={styles.title}>cash-mine</Text>
      <Text style={styles.body}>Expo Router is up and running.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
});
