/**
 * tokenStorage: the keychain layer under AuthContext.
 *
 * AuthContext's own suite covers the migration end to end; these are the
 * lower-level guarantees — the accessibility class the tokens are written
 * under, the delete-before-set re-key, and the "never throw at a caller"
 * contract that keeps a missing native module from crashing bootstrap.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  LEGACY_ACCESS_TOKEN_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
} from '../../src/config/storageKeys';
import { clearTokens, getTokens, setTokens } from '../../src/services/tokenStorage';

const ACCESS_SECURE_KEY = 'jarvis_recipes_access_token';
const REFRESH_SECURE_KEY = 'jarvis_recipes_refresh_token';

describe('tokenStorage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  describe('setTokens', () => {
    it('writes both tokens as this-device-only keychain items', async () => {
      await setTokens('a1', 'r1');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ACCESS_SECURE_KEY, 'a1', {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(REFRESH_SECURE_KEY, 'r1', {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    });

    it('deletes before writing so each write is a clean re-key', async () => {
      const order: string[] = [];
      (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => {
        order.push('delete');
      });
      (SecureStore.setItemAsync as jest.Mock).mockImplementation(async () => {
        order.push('set');
      });

      await setTokens('a1', 'r1');

      expect(order).toEqual(['delete', 'delete', 'set', 'set']);
    });
  });

  describe('getTokens', () => {
    it('reads the pair back out of the keychain', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === ACCESS_SECURE_KEY ? 'a1' : key === REFRESH_SECURE_KEY ? 'r1' : null,
        ),
      );

      expect(await getTokens()).toEqual({ accessToken: 'a1', refreshToken: 'r1' });
    });

    it('returns nulls instead of throwing when the keychain is unavailable', async () => {
      // e.g. an OTA update onto a binary without the native module.
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(
        new Error('Unsupported on web'),
      );

      expect(await getTokens()).toEqual({ accessToken: null, refreshToken: null });
    });

    it('migrates a legacy AsyncStorage pair on the first read', async () => {
      await AsyncStorage.multiSet([
        [LEGACY_ACCESS_TOKEN_KEY, 'legacy-a'],
        [LEGACY_REFRESH_TOKEN_KEY, 'legacy-r'],
      ]);

      expect(await getTokens()).toEqual({
        accessToken: 'legacy-a',
        refreshToken: 'legacy-r',
      });
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ACCESS_SECURE_KEY,
        'legacy-a',
        expect.anything(),
      );
      expect(await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(LEGACY_REFRESH_TOKEN_KEY)).toBeNull();
    });

    it('does not touch AsyncStorage when the keychain already has a token', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === ACCESS_SECURE_KEY ? 'a1' : null),
      );
      await AsyncStorage.multiSet([
        [LEGACY_ACCESS_TOKEN_KEY, 'legacy-a'],
        [LEGACY_REFRESH_TOKEN_KEY, 'legacy-r'],
      ]);

      expect(await getTokens()).toEqual({ accessToken: 'a1', refreshToken: null });
      expect(await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)).toBe('legacy-a');
    });
  });

  describe('clearTokens', () => {
    it('wipes the keychain items and any leftover plaintext copies', async () => {
      await AsyncStorage.multiSet([
        [LEGACY_ACCESS_TOKEN_KEY, 'legacy-a'],
        [LEGACY_REFRESH_TOKEN_KEY, 'legacy-r'],
      ]);

      await clearTokens();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ACCESS_SECURE_KEY);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_SECURE_KEY);
      expect(await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(LEGACY_REFRESH_TOKEN_KEY)).toBeNull();
    });

    it('still clears AsyncStorage when the keychain delete fails', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('locked'));
      await AsyncStorage.setItem(LEGACY_ACCESS_TOKEN_KEY, 'legacy-a');

      await expect(clearTokens()).resolves.toBeUndefined();
      expect(await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)).toBeNull();
    });
  });
});
