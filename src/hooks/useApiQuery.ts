import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { api, type ApiError, type RequestOptions } from '@/api';

type Options<T> = Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'> & {
  query?: RequestOptions['query'];
};

/**
 * Typed GET query keyed by path + params.
 * Example: `const { data } = useApiQuery<Todo[]>('/todos', { query: { page: 1 } })`
 */
export function useApiQuery<T>(path: string, { query, ...options }: Options<T> = {}) {
  return useQuery<T, ApiError>({
    queryKey: [path, query ?? {}],
    queryFn: ({ signal }) => api.get<T>(path, { query, signal }),
    ...options,
  });
}
