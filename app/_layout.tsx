import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createQueryClient } from '@/api';
import { useToken } from '@/auth/token';
import { useClaimRunner } from '@/claims/runner';
import { Screen } from '@/components/Screen';
import { TokenForm } from '@/components/TokenForm';
import { colors } from '@/theme';

export default function RootLayout() {
  const token = useToken();

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {token ? (
        // Keyed by token: switching tokens drops every cached response of the old one.
        <AuthedApp key={token} />
      ) : (
        <Screen>
          <TokenForm />
        </Screen>
      )}
    </SafeAreaProvider>
  );
}

function AuthedApp() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ClaimRunner />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
        }}
      />
    </QueryClientProvider>
  );
}

function ClaimRunner() {
  useClaimRunner();
  return null;
}
