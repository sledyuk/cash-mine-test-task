import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // Definitive client errors (auth, validation, not found) won't fix themselves.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.rejected) && failureCount < 3,
        // Respect the server's rate-limit hint, otherwise back off exponentially.
        retryDelay: (attempt, error) =>
          error instanceof ApiError && error.retryAfterMs
            ? error.retryAfterMs
            : Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: { retry: false },
    },
  });
}
