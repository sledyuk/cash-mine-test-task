import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.surface : colors.primary} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' ? styles.primaryText : styles.secondaryText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type Tone = 'info' | 'warning' | 'danger' | 'success';

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={[styles.banner, bannerTone[tone]]} accessibilityRole="alert">
      <Text style={styles.bannerTitle}>{title}</Text>
      {children ? <Text style={styles.bannerBody}>{children}</Text> : null}
      {action}
    </View>
  );
}

export function KeyValue({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, strong && styles.kvStrong]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function CenteredLoader({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export const text = StyleSheet.create({
  title: { ...typography.title, color: colors.text },
  heading: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { ...typography.body, color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.text },
});

const bannerTone = StyleSheet.create({
  info: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  warning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  danger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  success: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
});

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent', minHeight: 36, paddingHorizontal: spacing.sm },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  primaryText: { color: colors.surface },
  secondaryText: { color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  bannerTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  bannerBody: { ...typography.caption, color: colors.text, lineHeight: 18 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  kvLabel: { ...typography.caption, color: colors.textMuted, flexShrink: 0 },
  kvValue: { fontSize: 14, color: colors.text, textAlign: 'right', flexShrink: 1 },
  kvStrong: { fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  muted: { ...typography.caption, color: colors.textMuted },
});
