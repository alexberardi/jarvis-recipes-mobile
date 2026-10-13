/**
 * Authenticated axios client for jarvis-recipes-server, with a single-flight
 * token refresh shared by every caller.
 *
 * jarvis-auth ROTATES refresh tokens: each successful /auth/refresh invalidates
 * the token it was called with. So two unserialized refreshes race to spend the
 * same token and the loser is rejected (in strict mode the whole token family
 * can be revoked, logging the user out). Every refresh in the app therefore
 * goes through `refreshAuthToken()` — the 401 retry below AND AuthContext's
 * background timer — which coalesces concurrent callers onto one in-flight
 * promise.
 *
 * Token access and the forced-logout hook are wired up by AuthContext at mount
 * time via `setAuthHandlers`.
 */
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

import authApi from './authApi';
import { getServerUrls } from '../config/serverConfig';

type AccessTokenFn = () => string | null;
type RefreshTokenFn = () => string | null;
type UpdateTokensFn = (accessToken: string, refreshToken: string) => Promise<void>;
type LogoutFn = () => Promise<void>;

type RefreshResponse = {
  access_token: string;
  refresh_token?: string;
};

let getAccessToken: AccessTokenFn = () => null;
let getRefreshToken: RefreshTokenFn = () => null;
let updateTokens: UpdateTokensFn = async () => {};
let logout: LogoutFn = async () => {};

export const setAuthHandlers = (handlers: {
  getAccessTokenHandler: AccessTokenFn;
  getRefreshTokenHandler: RefreshTokenFn;
  updateTokensHandler: UpdateTokensFn;
  logoutHandler: LogoutFn;
}): void => {
  getAccessToken = handlers.getAccessTokenHandler;
  getRefreshToken = handlers.getRefreshTokenHandler;
  updateTokens = handlers.updateTokensHandler;
  logout = handlers.logoutHandler;
};

const recipesApi: AxiosInstance = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
  // Without this a request against an unreachable host hangs indefinitely, so
  // the UI spins forever and (for a refresh) the single-flight promise below
  // would never release.
  timeout: 10000,
});

recipesApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Per request, not at module load: the endpoint is a setting on a self-hosted
  // app, and `axios.create` would freeze whatever was known at import time --
  // before AsyncStorage has been read.
  config.baseURL = getServerUrls().recipes;
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints where a 401 means "bad credentials", not "stale session" — and
// where refreshing would either recurse (/auth/refresh) or be meaningless.
const SKIP_REFRESH_PATHS = new Set<string>(['/auth/login', '/auth/register', '/auth/refresh']);

/**
 * Only a 401 means the access token was rejected. A 403 is a legitimate
 * permission denial (someone else's recipe, a disabled feature) and free-text
 * message matching is guesswork — treating either as an auth failure logged the
 * user out on a request that merely wasn't allowed.
 */
const isInvalidTokenError = (error: AxiosError): boolean => error.response?.status === 401;

let refreshPromise: Promise<string | null> | null = null;

const doRefresh = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    // No session left to refresh — drop to the login screen rather than
    // lingering authenticated-but-broken behind empty screens.
    await logout();
    return null;
  }

  try {
    const res = await authApi.post<RefreshResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    const newAccess = res.data.access_token;
    const newRefresh = res.data.refresh_token ?? refreshToken;
    // Await persistence: the rotated refresh token must be committed before the
    // next refresh can fire, otherwise a later path replays a spent token.
    await updateTokens(newAccess, newRefresh);
    return newAccess;
  } catch (error) {
    // A 401/403 means the refresh token itself was rejected — the session is
    // genuinely over, so force a clean logout. Anything else (offline, DNS
    // failure, 5xx, timeout) is transient: keep the user signed in and recover
    // on the next attempt.
    const status = (error as AxiosError)?.response?.status;
    if (status === 401 || status === 403) {
      await logout();
    } else {
      console.warn(
        '[recipesApi] Token refresh failed (transient):',
        error instanceof Error ? error.message : String(error),
      );
    }
    return null;
  }
};

/**
 * Refresh the access token, coalescing concurrent callers onto one request so
 * the rotating refresh token is never double-spent. Used by the 401 retry path
 * here and by AuthContext's periodic refresh.
 */
export const refreshAuthToken = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

export const recipesRequest = async <T = any>(
  config: AxiosRequestConfig,
  retryCount = 0,
): Promise<T> => {
  try {
    const res = await recipesApi.request<T>(config);
    return (res as any)?.data ?? (res as any);
  } catch (err: any) {
    const error = err as AxiosError;
    if (
      !isInvalidTokenError(error) ||
      retryCount > 0 ||
      SKIP_REFRESH_PATHS.has(config.url ?? '')
    ) {
      throw error;
    }

    const newAccessToken = await refreshAuthToken();
    if (!newAccessToken) {
      // `doRefresh` has already forced a logout if the session is dead; a
      // transient failure just surfaces here so the caller can retry.
      throw error;
    }

    return recipesRequest<T>(
      {
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${newAccessToken}`,
        },
      },
      retryCount + 1,
    );
  }
};

export default recipesApi;
