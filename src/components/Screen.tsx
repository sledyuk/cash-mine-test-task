import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
};

/**
 * Mobile-first page shell: full-bleed background with a centered column
 * capped at `layout.maxWidth`, so it fills a phone and stays tidy on desktop.
 */
export function Screen({ children, refreshControl }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
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
