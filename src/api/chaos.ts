// Client-side fault injection, to show the failure paths working against the real API.
// Enable with `?chaos=lost-response,flaky,slow` in the URL (kept for the browser session),
// disable with `?chaos=off`.
//
// - lost-response: the first POST /v1/claims per Idempotency-Key reaches the server,
//   but its response is thrown away, as if the connection dropped. The outcome is unknown.
// - flaky: ~30% of GET requests fail with a synthetic 503 without being sent.
// - slow: adds 3s before every request.

export type ChaosMode = 'lost-response' | 'flaky' | 'slow';

const SESSION_KEY = 'cashmine.chaos';
const ALL: ChaosMode[] = ['lost-response', 'flaky', 'slow'];

function readModes(): Set<ChaosMode> {
  if (typeof window === 'undefined') return new Set();
  try {
    const param = new URLSearchParams(window.location.search).get('chaos');
    if (param !== null) {
      if (param === 'off') window.sessionStorage.removeItem(SESSION_KEY);
      else window.sessionStorage.setItem(SESSION_KEY, param);
    }
    const raw = window.sessionStorage.getItem(SESSION_KEY) ?? '';
    return new Set(ALL.filter((mode) => raw.split(',').includes(mode)));
  } catch {
    return new Set();
  }
}

const modes = readModes();
const droppedKeys = new Set<string>();

export function chaosModes(): ChaosMode[] {
  return [...modes];
}

export function chaosEnabled(mode: ChaosMode): boolean {
  return modes.has(mode);
}

/** True the first time a given idempotency key is seen while lost-response is on. */
export function shouldDropResponse(idempotencyKey: string | undefined): boolean {
  if (!idempotencyKey || !modes.has('lost-response') || droppedKeys.has(idempotencyKey)) {
    return false;
  }
  droppedKeys.add(idempotencyKey);
  return true;
}
