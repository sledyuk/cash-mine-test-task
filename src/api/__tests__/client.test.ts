import { ApiError, request } from '../client';

jest.mock('../config', () => ({
  apiConfig: { baseUrl: 'https://api.test', token: 'secret' },
}));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => fetchMock.mockReset());

describe('request', () => {
  it('builds the URL, sends the bearer token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));

    const data = await request<{ id: number }>('/items', { query: { page: 2, q: undefined } });

    expect(data).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/items?page=2');
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  it('throws ApiError with status and body on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'nope' }, 404));

    const error = await request('/missing').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, body: { message: 'nope' } });
  });
});
