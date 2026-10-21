import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, request } from '@/api';
import { setToken } from '@/auth/token';
import { colors, radius, spacing } from '@/theme';

import { Banner, Button, Card, text } from './ui';

type Props = { onCancel?: () => void; reason?: string };

/** Asks for the API token, checks it against the API, and stores it in this browser only. */
export function TokenForm({ onCancel, reason }: Props) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const token = value.trim();
    if (!token) {
      setError('Paste your token.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await request('/v1/balances', { headers: { Authorization: `Bearer ${token}` } });
      setToken(token);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
        setError('This token was not accepted. Check that it is complete and not expired.');
      } else {
        // Can't verify right now (network, 5xx, rate limit): keep it, the app will retry.
        setToken(token);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={text.title}>Connect your account</Text>
      {reason ? <Banner tone="warning" title={reason} /> : null}
      <Card>
        <Text style={text.body}>Paste your API token.</Text>
        <Text style={text.muted}>
          It is stored only in this browser and sent only to the CashMine API. You can change it any
          time.
        </Text>
        <TextInput
          testID="token-input"
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setError(null);
          }}
          placeholder="ct1.…"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          secureTextEntry
          onSubmitEditing={save}
          style={[styles.input, error && styles.inputError]}
          accessibilityLabel="API token"
        />
        {error ? <Text style={text.error}>{error}</Text> : null}
        <Button title="Save token" onPress={save} loading={checking} testID="token-save" />
        {onCancel ? <Button title="Cancel" variant="secondary" onPress={onCancel} /> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
});
