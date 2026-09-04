/**
 * recipesApi: the single-flight refresh and the narrowed 401 handling.
 *
 * jarvis-auth rotates refresh tokens, so the invariant these tests defend is
 * "N callers hitting a stale access token produce exactly ONE /auth/refresh".
 * The second invariant is that only the refresh call's own 401/403 may end the
 * session — a 403 on a data request or a flaky network must not.
 */
import { AxiosError } from 'axios';

import authApi from '../../src/api/authApi';
import recipesApi, {
  recipesRequest,
  refreshAuthToken,
  setAuthHandlers,
} from '../../src/api/recipesApi';

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    defaults: { baseURL: '' },
  },
}));

/** An axios-shaped rejection carrying an HTTP status. */
const httpError = (status: number): AxiosError =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  }) as AxiosError;

/** A rejection with no response at all — offline, DNS failure, timeout. */
const networkError = (): AxiosError =>
  Object.assign(new Error('Network Error'), { isAxiosError: true }) as AxiosError;

let accessToken: string | null;
let refreshToken: string | null;
let updateTokens: jest.Mock;
let logout: jest.Mock;
let requestSpy: jest.SpyInstance;

describe('recipesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessToken = 'access-1';
    refreshToken = 'refresh-1';
    updateTokens = jest.fn(async (nextAccess: string, nextRefresh: string) => {
      accessToken = nextAccess;
      refreshToken = nextRefresh;
    });
    logout = jest.fn(async () => {
      accessToken = null;
      refreshToken = null;
    });
    setAuthHandlers({
      getAccessTokenHandler: () => accessToken,
      getRefreshTokenHandler: () => refreshToken,
      updateTokensHandler: updateTokens,
      logoutHandler: logout,
    });
    requestSpy = jest.spyOn(recipesApi, 'request');
  });

  afterEach(() => {
    requestSpy.mockRestore();
  });

  describe('single-flight refresh', () => {
    it('issues EXACTLY ONE /auth/refresh for N concurrent 401s', async () => {
      (authApi.post as jest.Mock).mockImplementation(
        async () =>
          new Promise((resolve) =>
            // Resolve on a later tick so all five callers are genuinely in
            // flight at the same time — an immediate resolve would serialize
            // them and pass even without coalescing.
            setTimeout(
              () => resolve({ data: { access_token: 'access-2', refresh_token: 'refresh-2' } }),
              10,
            ),
          ),
      );
      requestSpy.mockImplementation(async (config: any) => {
        if (config.headers?.Authorization === 'Bearer access-2') {
          return { data: { ok: config.url } };
        }
        throw httpError(401);
      });

      const results = await Promise.all([
        recipesRequest({ url: '/recipes/1' }),
        recipesRequest({ url: '/recipes/2' }),
        recipesRequest({ url: '/recipes/3' }),
        recipesRequest({ url: '/recipes/4' }),
        recipesRequest({ url: '/recipes/5' }),
      ]);

      expect(authApi.post).toHaveBeenCalledTimes(1);
      expect(authApi.post).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: 'refresh-1',
      });
      expect(updateTokens).toHaveBeenCalledTimes(1);
      expect(results).toEqual([
        { ok: '/recipes/1' },
        { ok: '/recipes/2' },
        { ok: '/recipes/3' },
        { ok: '/recipes/4' },
        { ok: '/recipes/5' },
      ]);
    });

    it('coalesces direct refreshAuthToken callers too', async () => {
      (authApi.post as jest.Mock).mockImplementation(
        async () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ data: { access_token: 'access-2', refresh_token: 'refresh-2' } }),
              10,
            ),
          ),
      );

      const tokens = await Promise.all([
        refreshAuthToken(),
        refreshAuthToken(),
        refreshAuthToken(),
      ]);

      expect(authApi.post).toHaveBeenCalledTimes(1);
      expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
    });

    it('starts a new request once the previous refresh has settled', async () => {
      (authApi.post as jest.Mock)
        .mockResolvedValueOnce({
          data: { access_token: 'access-2', refresh_token: 'refresh-2' },
        })
        .mockResolvedValueOnce({
          data: { access_token: 'access-3', refresh_token: 'refresh-3' },
        });

      await refreshAuthToken();
      await refreshAuthToken();

      expect(authApi.post).toHaveBeenCalledTimes(2);
      // The second call must spend the ROTATED token, not the original.
      expect((authApi.post as jest.Mock).mock.calls[1][1]).toEqual({
        refresh_token: 'refresh-2',
      });
    });
  });

  describe('what does and does not end a session', () => {
    it('does NOT log out on a 403 from a data request', async () => {
      requestSpy.mockRejectedValue(httpError(403));

      await expect(recipesRequest({ url: '/recipes/9' })).rejects.toMatchObject({
        response: { status: 403 },
      });

      // A 403 is a permission denial, not a stale token: no refresh, no logout.
      expect(authApi.post).not.toHaveBeenCalled();
      expect(logout).not.toHaveBeenCalled();
    });

    it('does NOT log out on a transient network failure during refresh', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (authApi.post as jest.Mock).mockRejectedValue(networkError());
      requestSpy.mockRejectedValue(httpError(401));

      await expect(recipesRequest({ url: '/recipes/9' })).rejects.toMatchObject({
        response: { status: 401 },
      });

      expect(logout).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('does NOT log out when refresh fails with a 5xx', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (authApi.post as jest.Mock).mockRejectedValue(httpError(503));

      await expect(refreshAuthToken()).resolves.toBeNull();

      expect(logout).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('logs out when the REFRESH call itself returns 401', async () => {
      (authApi.post as jest.Mock).mockRejectedValue(httpError(401));

      await expect(refreshAuthToken()).resolves.toBeNull();

      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('logs out when the REFRESH call itself returns 403', async () => {
      (authApi.post as jest.Mock).mockRejectedValue(httpError(403));

      await expect(refreshAuthToken()).resolves.toBeNull();

      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('logs out when there is no refresh token left to spend', async () => {
      refreshToken = null;

      await expect(refreshAuthToken()).resolves.toBeNull();

      expect(authApi.post).not.toHaveBeenCalled();
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry behaviour', () => {
    it('retries a 401 exactly once and gives up rather than looping', async () => {
      (authApi.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'access-2', refresh_token: 'refresh-2' },
      });
      requestSpy.mockRejectedValue(httpError(401));

      await expect(recipesRequest({ url: '/recipes/9' })).rejects.toMatchObject({
        response: { status: 401 },
      });

      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect(authApi.post).toHaveBeenCalledTimes(1);
    });

    it('replays the original request with the new bearer token', async () => {
      (authApi.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'access-2', refresh_token: 'refresh-2' },
      });
      requestSpy
        .mockRejectedValueOnce(httpError(401))
        .mockResolvedValueOnce({ data: { title: 'Tacos' } });

      await expect(
        recipesRequest({ url: '/recipes/9', method: 'GET' }),
      ).resolves.toEqual({ title: 'Tacos' });

      expect(requestSpy.mock.calls[1][0]).toMatchObject({
        url: '/recipes/9',
        method: 'GET',
        headers: { Authorization: 'Bearer access-2' },
      });
    });

    it('does not try to refresh a 401 from /auth/login', async () => {
      requestSpy.mockRejectedValue(httpError(401));

      await expect(recipesRequest({ url: '/auth/login' })).rejects.toMatchObject({
        response: { status: 401 },
      });

      expect(authApi.post).not.toHaveBeenCalled();
      expect(logout).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });

    it('does not recurse when /auth/refresh is routed through this client', async () => {
      requestSpy.mockRejectedValue(httpError(401));

      await expect(recipesRequest({ url: '/auth/refresh' })).rejects.toMatchObject({
        response: { status: 401 },
      });

      expect(authApi.post).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('request interceptor', () => {
    it('attaches the current access token as a bearer header', () => {
      const handler = (recipesApi.interceptors.request as any).handlers[0].fulfilled;

      expect(handler({ headers: {} }).headers.Authorization).toBe('Bearer access-1');
    });

    it('sends no Authorization header when there is no session', () => {
      accessToken = null;
      const handler = (recipesApi.interceptors.request as any).handlers[0].fulfilled;

      expect(handler({ headers: {} }).headers.Authorization).toBeUndefined();
    });
  });
});
