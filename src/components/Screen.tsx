import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
};

/**
 * Mobile-first page shell: full-bleed background with a centered column
 * capped at `layout.maxWidth`, so it fills a phone and stays tidy on desktop.
 */
export function Screen({ children, scroll = true }: ScreenProps) {
  const content = <View style={styles.column}>{children}</View>;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
});
