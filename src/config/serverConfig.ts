/**
 * The addresses of this install's Jarvis services.
 *
 * A self-hosted app cannot ship its endpoints. The values in config/env are the
 * documented local-dev ports and are only ever right on a developer's own
 * machine, so the address has to be something the person can set and change --
 * the same reasoning as jarvis-node-mobile's server switcher on its landing
 * screen.
 *
 * Deliberately NO network discovery. Scanning the LAN means an iOS local-network
 * permission prompt at the worst possible moment (before the person has decided
 * to trust the app) and a scan that fails silently on any network that isolates
 * clients. Typing an address is boring and it works.
 *
 * Two services, so two addresses. Deriving the second from the first would
 * assume the documented ports on one host, which is true of a `jarvis` CLI
 * install and false the moment anything sits behind a reverse proxy.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTH_API_BASE_URL, RECIPES_API_BASE_URL } from './env';
import { SERVER_URLS_KEY } from './storageKeys';

export type ServerUrls = {
  auth: string;
  recipes: string;
};

/** The documented local-dev ports, used until someone sets an address. */
export const DEFAULT_URLS: ServerUrls = {
  auth: AUTH_API_BASE_URL,
  recipes: RECIPES_API_BASE_URL,
};

/**
 * The addresses in force right now.
 *
 * Held in memory as well as in AsyncStorage because the axios interceptors read
 * it on EVERY request and cannot await: an async read there would either block
 * every call on a storage round trip or race the first few requests after a
 * cold start, which is exactly when login happens.
 */
let current: ServerUrls = { ...DEFAULT_URLS };

export const getServerUrls = (): ServerUrls => current;

/** Trim, for values coming back out of storage. */
const clean = (url: string): string => url.trim();

/**
 * Normalise what a person typed into something axios can use.
 *
 * A bare host is the common case -- people type `10.0.0.122:7030`, not
 * `http://10.0.0.122:7030` -- and axios treats a schemeless baseURL as a
 * relative path, so the request silently goes nowhere.
 */
export const normalizeUrl = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  // Trailing slashes are stripped from the part AFTER the scheme, never from the
  // scheme's own "//". Stripping the whole string turned "http://" into "http:",
  // which then failed the scheme test and was prefixed again into
  // "http://http:" -- an address that parses, has a hostname, and goes nowhere.
  //
  // The slash matters: `${base}/recipes` against a base ending in one gives a
  // double slash, which some servers 404 and others redirect, losing the
  // Authorization header on the way.
  const parts = withScheme.match(/^(https?:\/\/)(.*)$/i);
  const rest = (parts?.[2] ?? '').replace(/\/+$/, '');
  return rest ? `${parts![1]}${rest}` : '';
};

/** True when this looks like something worth trying to connect to. */
export const isValidUrl = (input: string): boolean => {
  const normalized = normalizeUrl(input);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

/**
 * Given one address, guess the other.
 *
 * A convenience for the overwhelmingly common install -- both services on one
 * host at their documented ports -- and nothing more. The dialog shows what was
 * guessed, so a proxied setup can correct it before saving rather than
 * discovering it was wrong at the login screen.
 */
export const deriveCompanionUrl = (input: string, port: number): string => {
  const normalized = normalizeUrl(input);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    // Only when the address is a bare host:port. A path means a reverse proxy,
    // where the sibling service is somewhere this cannot work out.
    if (parsed.pathname && parsed.pathname !== '/') return '';
    return `${parsed.protocol}//${parsed.hostname}:${port}`;
  } catch {
    return '';
  }
};

export const AUTH_DEFAULT_PORT = 7701;
export const RECIPES_DEFAULT_PORT = 7030;

/** Load the saved addresses. Falls back to the build's defaults. */
export const loadServerUrls = async (): Promise<ServerUrls> => {
  try {
    const raw = await AsyncStorage.getItem(SERVER_URLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ServerUrls>;
      current = {
        auth: parsed.auth ? clean(parsed.auth) : DEFAULT_URLS.auth,
        recipes: parsed.recipes ? clean(parsed.recipes) : DEFAULT_URLS.recipes,
      };
    }
  } catch {
    // A corrupt value must not stop the app booting; the defaults still let a
    // developer run against localhost and the dialog lets anyone else fix it.
    current = { ...DEFAULT_URLS };
  }
  return current;
};

export const saveServerUrls = async (urls: ServerUrls): Promise<ServerUrls> => {
  current = { auth: normalizeUrl(urls.auth), recipes: normalizeUrl(urls.recipes) };
  await AsyncStorage.setItem(SERVER_URLS_KEY, JSON.stringify(current));
  return current;
};

/** Forget the saved addresses and go back to the build's defaults. */
export const resetServerUrls = async (): Promise<ServerUrls> => {
  current = { ...DEFAULT_URLS };
  await AsyncStorage.removeItem(SERVER_URLS_KEY);
  return current;
};
