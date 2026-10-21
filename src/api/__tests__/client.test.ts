import { ApiError, request } from '../client';
import { API_BASE_URL } from '../config';

jest.mock('@/auth/token', () => ({ getToken: () => 'user-entered-token' }));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

afterEach(() => fetchMock.mockReset());

describe('request', () => {
  it('builds the URL, sends the runtime token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));

    const data = await request<{ id: number }>('/v1/items', { query: { page: 2, q: undefined } });

    expect(data).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/v1/items?page=2`);
    expect(init.headers.Authorization).toBe('Bearer user-entered-token');
  });

  it('maps the API error body, including the field', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'VALIDATION', message: 'too much', field: 'amount' } }, 400),
    );

    const error = await request('/v1/claims').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION', field: 'amount' });
    expect((error as ApiError).rejected).toBe(true);
    expect((error as ApiError).outcomeUnknown).toBe(false);
  });

  it('reads retryAfterMs on 429 and does not treat it as a rejection', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'RATE_LIMITED', message: 'slow down', retryAfterMs: 2300 } },
        429,
      ),
    );

    const error = (await request('/v1/balances').catch((e: unknown) => e)) as ApiError;

    expect(error.retryAfterMs).toBe(2300);
    expect(error.rejected).toBe(false);
  });

  it('treats 504 and network failures as unknown outcomes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'TIMEOUT', message: 'x' } }, 504),
    );
    const timeout = (await request('/v1/claims').catch((e: unknown) => e)) as ApiError;
    expect(timeout.outcomeUnknown).toBe(true);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const network = (await request('/v1/claims').catch((e: unknown) => e)) as ApiError;
    expect(network).toMatchObject({ code: 'NETWORK', status: 0 });
    expect(network.outcomeUnknown).toBe(true);
  });
});
