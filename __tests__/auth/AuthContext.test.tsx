/**
 * AuthContext: session persistence, bootstrap, logout and refresh.
 *
 * The highest-value case here is the AsyncStorage -> SecureStore migration: an
 * existing user who upgrades into the keychain build must come back logged in,
 * with the plaintext copies of their tokens gone.
 *
 * `recipesApi` is deliberately NOT mocked — the refresh path under test lives
 * there, and exercising it for real is what proves AuthContext's handler wiring
 * (getRefreshToken / updateTokens / logout) is hooked up.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as SecureStore from 'expo-secure-store';

import authApi from '../../src/api/authApi';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import {
  LEGACY_ACCESS_TOKEN_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  USER_KEY,
} from '../../src/config/storageKeys';

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    defaults: { baseURL: '' },
  },
}));

const ACCESS_SECURE_KEY = 'jarvis_recipes_access_token';
const REFRESH_SECURE_KEY = 'jarvis_recipes_refresh_token';

const USER = { id: 7, email: 'cook@example.com', username: 'cook' };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

/** Populate the mocked keychain for the two token keys tokenStorage uses. */
const setKeychainTokens = (access: string | null, refresh: string | null): void => {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(
      key === ACCESS_SECURE_KEY ? access : key === REFRESH_SECURE_KEY ? refresh : null,
    ),
  );
};

const renderAuth = () => renderHook(() => useAuth(), { wrapper });

/** Render and wait for bootstrapAuth to settle. */
const renderBootstrapped = async () => {
  const hook = renderAuth();
  await waitFor(() => expect(hook.result.current.state.isLoading).toBe(false));
  return hook;
};

describe('AuthContext', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    // Default: nothing stored anywhere.
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  describe('bootstrap', () => {
    it('lands unauthenticated when nothing is stored', async () => {
      const { result } = await renderBootstrapped();

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.user).toBeNull();
      expect(result.current.state.accessToken).toBeNull();
    });

    it('restores a session from the keychain plus the stored user blob', async () => {
      setKeychainTokens('stored-access', 'stored-refresh');
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(USER));

      const { result } = await renderBootstrapped();

      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.user).toEqual(USER);
      expect(result.current.state.accessToken).toBe('stored-access');
      expect(result.current.state.refreshToken).toBe('stored-refresh');
    });

    it('stays logged out when tokens exist but the user blob does not', async () => {
      setKeychainTokens('stored-access', 'stored-refresh');

      const { result } = await renderBootstrapped();

      expect(result.current.state.isAuthenticated).toBe(false);
    });

    it('survives a corrupt user blob instead of throwing', async () => {
      setKeychainTokens('stored-access', 'stored-refresh');
      await AsyncStorage.setItem(USER_KEY, 'not json{');
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = await renderBootstrapped();

      expect(result.current.state.isAuthenticated).toBe(false);
      warn.mockRestore();
    });
  });

  describe('AsyncStorage -> SecureStore migration', () => {
    it('keeps a pre-upgrade session alive and wipes the plaintext tokens', async () => {
      // An install from before the keychain move: tokens and user all sitting
      // in AsyncStorage, keychain empty.
      await AsyncStorage.multiSet([
        [LEGACY_ACCESS_TOKEN_KEY, 'legacy-access'],
        [LEGACY_REFRESH_TOKEN_KEY, 'legacy-refresh'],
        [USER_KEY, JSON.stringify(USER)],
      ]);

      const { result } = await renderBootstrapped();

      // The user must NOT be bounced to the login screen by the upgrade.
      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.user).toEqual(USER);
      expect(result.current.state.accessToken).toBe('legacy-access');
      expect(result.current.state.refreshToken).toBe('legacy-refresh');

      // Both tokens moved into the keychain...
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ACCESS_SECURE_KEY,
        'legacy-access',
        expect.objectContaining({
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        REFRESH_SECURE_KEY,
        'legacy-refresh',
        expect.objectContaining({
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      );

      // ...and the unencrypted copies are gone, while the non-secret user
      // blob (which legitimately lives in AsyncStorage) survives.
      expect(await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(LEGACY_REFRESH_TOKEN_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(USER_KEY)).toBe(JSON.stringify(USER));
    });

    it('does not migrate a half-written legacy pair', async () => {
      await AsyncStorage.multiSet([
        [LEGACY_ACCESS_TOKEN_KEY, 'legacy-access'],
        [USER_KEY, JSON.stringify(USER)],
      ]);

      const { result } = await renderBootstrapped();

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      // Nothing was migrated, so nothing should have been thrown away either.
      expect(await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)).toBe('legacy-access');
    });

    it('leaves the keychain alone once it already holds tokens', async () => {
      setKeychainTokens('keychain-access', 'keychain-refresh');
      await AsyncStorage.multiSet([
        [LEGACY_ACCESS_TOKEN_KEY, 'stale-legacy-access'],
        [LEGACY_REFRESH_TOKEN_KEY, 'stale-legacy-refresh'],
        [USER_KEY, JSON.stringify(USER)],
      ]);

      const { result } = await renderBootstrapped();

      expect(result.current.state.accessToken).toBe('keychain-access');
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('login / register', () => {
    it('persists tokens to the keychain and only the user to AsyncStorage', async () => {
      (authApi.post as jest.Mock).mockResolvedValue({
        data: {
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
          token_type: 'bearer',
          user: USER,
        },
      });

      const { result } = await renderBootstrapped();

      await act(async () => {
        await result.current.login('cook@example.com', 'hunter2');
      });

      expect(authApi.post).toHaveBeenCalledWith('/auth/login', {
        email: 'cook@example.com',
        password: 'hunter2',
      });
      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.user).toEqual(USER);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ACCESS_SECURE_KEY,
        'fresh-access',
        expect.anything(),
      );
      // The credential must never land in the unencrypted store.
      expect(await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(USER_KEY)).toBe(JSON.stringify(USER));
    });

    it('register persists the same way and passes the username through', async () => {
      (authApi.post as jest.Mock).mockResolvedValue({
        data: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
          user: USER,
        },
      });

      const { result } = await renderBootstrapped();

      await act(async () => {
        await result.current.register('cook@example.com', 'hunter2', 'cook');
      });

      expect(authApi.post).toHaveBeenCalledWith('/auth/register', {
        email: 'cook@example.com',
        password: 'hunter2',
        username: 'cook',
      });
      expect(result.current.state.isAuthenticated).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        REFRESH_SECURE_KEY,
        'new-refresh',
        expect.anything(),
      );
    });

    it('leaves the session untouched when login is rejected', async () => {
      (authApi.post as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { response: { status: 401 } }),
      );

      const { result } = await renderBootstrapped();

      await expect(
        act(async () => {
          await result.current.login('cook@example.com', 'wrong');
        }),
      ).rejects.toThrow('Unauthorized');

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears state, the keychain and the stored user', async () => {
      setKeychainTokens('stored-access', 'stored-refresh');
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(USER));

      const { result } = await renderBootstrapped();
      expect(result.current.state.isAuthenticated).toBe(true);

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.user).toBeNull();
      expect(result.current.state.accessToken).toBeNull();
      expect(result.current.state.isLoading).toBe(false);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ACCESS_SECURE_KEY);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_SECURE_KEY);
      expect(await AsyncStorage.getItem(USER_KEY)).toBeNull();
    });
  });

  describe('refresh', () => {
    it('commits the rotated pair to the keychain and to state', async () => {
      setKeychainTokens('stored-access', 'stored-refresh');
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(USER));
      (authApi.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'rotated-access', refresh_token: 'rotated-refresh' },
      });

      const { result } = await renderBootstrapped();

      let token: string | null = null;
      await act(async () => {
        token = await result.current.refreshAccessToken();
      });

      expect(token).toBe('rotated-access');
      expect(authApi.post).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: 'stored-refresh',
      });
      expect(result.current.state.accessToken).toBe('rotated-access');
      expect(result.current.state.refreshToken).toBe('rotated-refresh');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ACCESS_SECURE_KEY,
        'rotated-access',
        expect.anything(),
      );
    });

    it('keeps the old refresh token when the server does not rotate it', async () => {
      setKeychainTokens('stored-access', 'stored-refresh');
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(USER));
      (authApi.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'rotated-access' },
      });

      const { result } = await renderBootstrapped();

      await act(async () => {
        await result.current.refreshAccessToken();
      });

      expect(result.current.state.refreshToken).toBe('stored-refresh');
    });

    it('logs the session out when the refresh token itself is rejected', async () => {
      setKeychainTokens('stored-access', 'stored-refresh');
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(USER));
      (authApi.post as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { response: { status: 401 } }),
      );

      const { result } = await renderBootstrapped();

      let token: string | null = 'unset';
      await act(async () => {
        token = await result.current.refreshAccessToken();
      });

      expect(token).toBeNull();
      expect(result.current.state.isAuthenticated).toBe(false);
      expect(await AsyncStorage.getItem(USER_KEY)).toBeNull();
    });

    it('logs out with no refresh token to spend', async () => {
      const { result } = await renderBootstrapped();

      let token: string | null = 'unset';
      await act(async () => {
        token = await result.current.refreshAccessToken();
      });

      expect(token).toBeNull();
      expect(authApi.post).not.toHaveBeenCalled();
      expect(result.current.state.isAuthenticated).toBe(false);
    });
  });
});
