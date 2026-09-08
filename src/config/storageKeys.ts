/**
 * Centralized on-device storage key constants.
 *
 * Secrets do NOT live here — the JWT access/refresh pair is stored in the OS
 * keychain under its own keys (see services/tokenStorage.ts). The token keys
 * below are the LEGACY AsyncStorage names, kept only so tokens written by an
 * older build can be migrated into the keychain on first read after upgrade.
 */

/** Legacy (pre-keychain) access token key — migration source only. */
export const LEGACY_ACCESS_TOKEN_KEY = '@jarvis_recipes/access_token';
/** Legacy (pre-keychain) refresh token key — migration source only. */
export const LEGACY_REFRESH_TOKEN_KEY = '@jarvis_recipes/refresh_token';

/** Serialized user object. Non-secret, so it stays in AsyncStorage. */
export const USER_KEY = '@jarvis_recipes/user';

/**
 * Where this install's Jarvis lives.
 *
 * Non-secret, and it has to survive a restart: the app is self-hosted, so a
 * build cannot know the address and the compiled-in defaults are only useful
 * on a developer's own machine.
 */
export const SERVER_URLS_KEY = '@jarvis_recipes/server_urls';
