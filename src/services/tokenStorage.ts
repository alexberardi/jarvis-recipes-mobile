/**
 * Secure storage for JWT auth tokens.
 *
 * The access and refresh tokens are sensitive credentials, so they live in the
 * OS keychain (iOS Keychain / Android Keystore) via expo-secure-store — NOT
 * AsyncStorage, which is an unencrypted on-disk store readable from device
 * backups or on a compromised device. These are jarvis-auth tokens, so a leak
 * out of this app is a credential valid against the whole Jarvis stack, not
 * just the recipes service.
 *
 * Both tokens are written WHEN_UNLOCKED_THIS_DEVICE_ONLY: never carried into an
 * iCloud/iTunes backup or a device migration, and unreadable while the device
 * is locked. (keychainAccessible is iOS-only; on Android the Keystore key is
 * inherently non-exportable, which gives the same "this device only" property.)
 * No biometric gate is used here — this app has no biometric opt-in.
 *
 * SecureStore keys must match [A-Za-z0-9._-], so the legacy AsyncStorage keys
 * ('@jarvis_recipes/...') can't be reused. Tokens written by older builds are
 * migrated into the keychain on first read (see getTokens) and the plaintext
 * copies removed, so an existing session survives the upgrade without a
 * re-login.
 *
 * Non-secret session data (the user blob) stays in AsyncStorage — see
 * auth/AuthContext.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  LEGACY_ACCESS_TOKEN_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
} from '../config/storageKeys';

const ACCESS_TOKEN_SECURE_KEY = 'jarvis_recipes_access_token';
const REFRESH_TOKEN_SECURE_KEY = 'jarvis_recipes_refresh_token';

const PLAIN_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Persist a token pair. Each item is deleted before it is written so the write
 * is a keychain CREATE rather than an in-place UPDATE — a clean re-key that
 * can't leave a stale accessibility attribute behind.
 */
export const setTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_SECURE_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_SECURE_KEY).catch(() => {}),
  ]);
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, accessToken, PLAIN_OPTS),
    SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, refreshToken, PLAIN_OPTS),
  ]);
};

/**
 * Read both tokens from the keychain.
 *
 * One-time migration: when the keychain is empty but tokens written by an older
 * (AsyncStorage) build are present, move them into the keychain and remove the
 * plaintext copies. The migrated values are returned from this same call, so a
 * user who was logged in before the upgrade stays logged in.
 */
export const getTokens = async (): Promise<StoredTokens> => {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  try {
    accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_SECURE_KEY, PLAIN_OPTS);
  } catch {
    accessToken = null;
  }
  try {
    refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_SECURE_KEY, PLAIN_OPTS);
  } catch {
    refreshToken = null;
  }

  if (!accessToken && !refreshToken) {
    const [legacyAccess, legacyRefresh] = await Promise.all([
      AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY),
      AsyncStorage.getItem(LEGACY_REFRESH_TOKEN_KEY),
    ]);
    if (legacyAccess && legacyRefresh) {
      // Only drop the plaintext copies once the keychain write has succeeded,
      // so a failure here leaves the session recoverable on the next launch.
      await setTokens(legacyAccess, legacyRefresh);
      await AsyncStorage.multiRemove([LEGACY_ACCESS_TOKEN_KEY, LEGACY_REFRESH_TOKEN_KEY]);
      accessToken = legacyAccess;
      refreshToken = legacyRefresh;
    }
  }

  return { accessToken, refreshToken };
};

/**
 * Remove the tokens from the keychain, plus any leftover plaintext copies in
 * AsyncStorage. Called on logout and on a forced (session-dead) logout.
 */
export const clearTokens = async (): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_SECURE_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_SECURE_KEY).catch(() => {}),
    AsyncStorage.multiRemove([LEGACY_ACCESS_TOKEN_KEY, LEGACY_REFRESH_TOKEN_KEY]),
  ]);
};
