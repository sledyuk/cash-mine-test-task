import { ApiError } from '@/api/client';

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

export function formatTime(iso: string | number): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type ErrorInfo = { title: string; message: string; auth: boolean };

export function describeError(error: unknown): ErrorInfo {
  if (!(error instanceof ApiError)) {
    return { title: 'Something went wrong', message: String(error), auth: false };
  }
  switch (error.code) {
    case 'UNAUTHORIZED':
      return {
        title: 'Token not accepted',
        message: 'Your token is missing, invalid or expired. Enter a valid token to continue.',
        auth: true,
      };
    case 'RATE_LIMITED':
      return {
        title: 'Too many requests',
        message: `The server asked us to slow down. Retrying in ${Math.ceil((error.retryAfterMs ?? 1000) / 1000)}s.`,
        auth: false,
      };
    case 'NETWORK':
      return {
        title: "Can't reach the server",
        message: 'Check your connection and try again.',
        auth: false,
      };
    case 'CLIENT_TIMEOUT':
    case 'TIMEOUT':
      return { title: 'The server is slow', message: 'The request timed out.', auth: false };
    case 'SERVER':
      return {
        title: 'Server error',
        message: 'A temporary server problem. Try again.',
        auth: false,
      };
    default:
      return { title: 'Request failed', message: error.message, auth: false };
  }
}
