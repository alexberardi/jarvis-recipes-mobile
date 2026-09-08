/**
 * Auth session state.
 *
 * The access/refresh pair is a jarvis-auth credential valid against the whole
 * stack, so it is persisted to the OS keychain (services/tokenStorage), never
 * to AsyncStorage. Only the non-secret user blob stays in AsyncStorage.
 *
 * Token refresh itself lives in api/recipesApi (`refreshAuthToken`) so the 401
 * retry path and the periodic timer below share one single-flight request — the
 * refresh token rotates on every use and must not be double-spent.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import authApi from '../api/authApi';
import { refreshAuthToken, setAuthHandlers } from '../api/recipesApi';
import { loadServerUrls } from '../config/serverConfig';
import { USER_KEY } from '../config/storageKeys';
import { clearTokens, getTokens, setTokens } from '../services/tokenStorage';

export interface AuthUser {
  id: number;
  email: string;
  username?: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user: AuthUser;
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
};

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  bootstrapAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const parseUser = (value: string | null): AuthUser | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as AuthUser;
  } catch (error) {
    console.warn('[AuthContext] Failed to parse stored user:', error instanceof Error ? error.message : String(error));
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState);
  // Synchronous mirror of `state`. The refresh in recipesApi is module-level and
  // can read the token pair in the window between a setState and its re-render,
  // so the getters handed to it must not go through React's async state — a
  // stale read there would replay an already-rotated refresh token.
  const stateRef = useRef<AuthState>(initialState);

  const applyState = useCallback((next: AuthState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const persistAuth = useCallback(
    async (payload: { accessToken: string; refreshToken: string; user: AuthUser }) => {
      const { accessToken, refreshToken, user } = payload;
      applyState({
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
        isLoading: false,
      });
      await Promise.all([
        setTokens(accessToken, refreshToken),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
      ]);
    },
    [applyState],
  );

  /** Commit a rotated token pair (called by the shared refresh in recipesApi). */
  const persistTokens = useCallback(
    async (accessToken: string, refreshToken: string) => {
      applyState({
        ...stateRef.current,
        accessToken,
        refreshToken,
        isAuthenticated: true,
      });
      await setTokens(accessToken, refreshToken);
    },
    [applyState],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.post<AuthResponse>('/auth/login', { email, password });
      await persistAuth({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        user: res.data.user,
      });
    },
    [persistAuth],
  );

  const register = useCallback(
    async (email: string, password: string, username?: string) => {
      const res = await authApi.post<AuthResponse>('/auth/register', {
        email,
        password,
        username,
      });
      await persistAuth({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        user: res.data.user,
      });
    },
    [persistAuth],
  );

  const logout = useCallback(async () => {
    // Drop the session in memory first so nothing can keep using the token if
    // the storage wipe below fails.
    applyState({
      ...initialState,
      isLoading: false,
    });
    await Promise.all([clearTokens(), AsyncStorage.removeItem(USER_KEY)]);
  }, [applyState]);

  /**
   * Refresh via the shared single-flight in recipesApi, so a manual refresh,
   * the periodic timer and a 401 retry can never spend the same rotating
   * refresh token twice.
   */
  const refreshAccessToken = useCallback(() => refreshAuthToken(), []);

  const bootstrapAuth = useCallback(async () => {
    try {
      // BEFORE the tokens are read, and before anything can issue a request:
      // this app is self-hosted, so the server address is a stored setting and
      // the axios clients resolve it per request. Leaving it until later would
      // point the first calls after a cold start -- the token refresh among them
      // -- at the build's localhost defaults.
      await loadServerUrls();

      const [{ accessToken, refreshToken }, storedUser] = await Promise.all([
        // Migrates any pre-keychain tokens out of AsyncStorage on first run.
        getTokens(),
        AsyncStorage.getItem(USER_KEY),
      ]);
      const user = parseUser(storedUser);

      if (accessToken && refreshToken && user) {
        applyState({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        applyState({
          ...initialState,
          isLoading: false,
        });
      }
    } catch (error) {
      console.warn('[AuthContext] Bootstrap auth failed:', error instanceof Error ? error.message : String(error));
      applyState({
        ...initialState,
        isLoading: false,
      });
    }
  }, [applyState]);

  // Wire the API client to this session before anything can issue a request.
  useEffect(() => {
    setAuthHandlers({
      getAccessTokenHandler: () => stateRef.current.accessToken,
      getRefreshTokenHandler: () => stateRef.current.refreshToken,
      updateTokensHandler: persistTokens,
      logoutHandler: logout,
    });
  }, [logout, persistTokens]);

  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    const timer = setInterval(() => {
      refreshAccessToken().catch(() => {
        // best-effort; a dead session is force-logged-out by the refresh itself
      });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.isAuthenticated, refreshAccessToken]);

  const value = useMemo(
    () => ({
      state,
      login,
      register,
      logout,
      refreshAccessToken,
      bootstrapAuth,
    }),
    [bootstrapAuth, login, logout, refreshAccessToken, register, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
