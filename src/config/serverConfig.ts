/**
 * Where this install's Jarvis lives.
 *
 * A self-hosted app cannot ship its endpoints. The compiled-in values are the
 * documented local-dev ports and are only ever right on a developer's own
 * machine, so the address has to be something the person can set.
 *
 * ONE address: jarvis-config-service. It already holds every service's
 * externally-reachable coordinates -- `external_host`/`external_port` exist for
 * exactly this case -- so the app asks it for auth and recipes rather than
 * making someone type each. Moving a service to a new host then stops being an
 * app problem, which is the whole point of the registry.
 *
 * Deliberately no network scanning: that costs an iOS local-network prompt
 * before the person has decided to trust the app, and fails silently on any
 * network that isolates clients. The address is typed; it is just typed once.
 *
 * Precedence, most specific first:
 *   1. a manual override, when someone has set one
 *   2. what config-service said this launch
 *   3. what it said last launch (so a brief outage does not sign anyone out)
 *   4. the build's defaults
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { discoverServices } from './configDiscovery';
import { AUTH_API_BASE_URL, RECIPES_API_BASE_URL } from './env';
import { SERVER_URLS_KEY } from './storageKeys';

export type ServerUrls = {
  auth: string;
  recipes: string;
};

export type ServerSettings = {
  /** jarvis-config-service, the one address a person types. */
  configUrl: string;
  /** Overrides for a service config-service does not know about. */
  overrides: Partial<ServerUrls>;
  /** What discovery last resolved. Cached so a cold start survives an outage. */
  discovered: Partial<ServerUrls>;
};

export const DEFAULT_URLS: ServerUrls = {
  auth: AUTH_API_BASE_URL,
  recipes: RECIPES_API_BASE_URL,
};

/** The documented local-dev port for config-service. */
export const CONFIG_DEFAULT_PORT = 7700;

const EMPTY: ServerSettings = { configUrl: '', overrides: {}, discovered: {} };

let settings: ServerSettings = { ...EMPTY };

/**
 * The addresses in force right now.
 *
 * Resolved synchronously from memory because the axios interceptors call this on
 * EVERY request and cannot await: a storage read there would either block every
 * call or race the first few after a cold start, which is when login happens.
 */
export const getServerUrls = (): ServerUrls => ({
  auth: settings.overrides.auth || settings.discovered.auth || DEFAULT_URLS.auth,
  recipes: settings.overrides.recipes || settings.discovered.recipes || DEFAULT_URLS.recipes,
});

export const getServerSettings = (): ServerSettings => settings;

/**
 * Normalise what a person typed.
 *
 * A bare host is the common case -- people type `10.0.0.122:7700`, not
 * `http://10.0.0.122:7700` -- and axios treats a schemeless baseURL as a
 * relative path, so the request silently goes nowhere.
 */
export const normalizeUrl = (input: string): string => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  // Trailing slashes come off the part AFTER the scheme, never off the scheme's
  // own "//". Stripping the whole string turned "http://" into "http:", which
  // then failed the scheme test and was prefixed again into "http://http:" -- an
  // address that parses, has a hostname, and goes nowhere.
  const parts = withScheme.match(/^(https?:\/\/)(.*)$/i);
  const rest = (parts?.[2] ?? '').replace(/\/+$/, '');
  return rest ? `${parts![1]}${rest}` : '';
};

export const isValidUrl = (input: string): boolean => {
  const normalized = normalizeUrl(input);
  if (!normalized) return false;
  try {
    return Boolean(new URL(normalized).hostname);
  } catch {
    return false;
  }
};

const persist = async () => {
  await AsyncStorage.setItem(SERVER_URLS_KEY, JSON.stringify(settings));
};

/**
 * Load what was stored, then refresh from config-service in the background.
 *
 * The stored values are applied FIRST and synchronously, so the app has usable
 * addresses before anything requests. Discovery then updates them if it can; if
 * it cannot, the cached ones stand.
 */
export const loadServerUrls = async (): Promise<ServerUrls> => {
  try {
    const raw = await AsyncStorage.getItem(SERVER_URLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ServerSettings>;
      settings = {
        configUrl: parsed.configUrl ?? '',
        overrides: parsed.overrides ?? {},
        discovered: parsed.discovered ?? {},
      };
    }
  } catch {
    // A corrupt value must not stop the app booting: the screen that would let
    // someone fix it is behind the app.
    settings = { ...EMPTY };
  }

  if (settings.configUrl) await refreshFromConfigService();
  return getServerUrls();
};

/**
 * Re-ask config-service. Returns what it resolved.
 *
 * A service it does not know about keeps its previous value rather than being
 * cleared -- an operator who has not yet added the recipes row on the admin
 * Services page should not have a working install broken by asking.
 */
export const refreshFromConfigService = async (): Promise<Partial<ServerUrls>> => {
  if (!settings.configUrl) return {};

  const found = await discoverServices(settings.configUrl);
  settings = {
    ...settings,
    discovered: {
      auth: found.auth ?? settings.discovered.auth,
      recipes: found.recipes ?? settings.discovered.recipes,
    },
  };
  await persist();
  return found;
};

/** Set the config-service address and immediately resolve from it. */
export const setConfigUrl = async (input: string): Promise<Partial<ServerUrls>> => {
  settings = { ...settings, configUrl: normalizeUrl(input), discovered: {} };
  await persist();
  return refreshFromConfigService();
};

/** Pin a service's address by hand, for one config-service does not list. */
export const setOverride = async (
  service: keyof ServerUrls,
  input: string | null,
): Promise<void> => {
  const overrides = { ...settings.overrides };
  if (input && input.trim()) {
    overrides[service] = normalizeUrl(input);
  } else {
    delete overrides[service];
  }
  settings = { ...settings, overrides };
  await persist();
};

/** Forget everything and go back to the build's defaults. */
export const resetServerUrls = async (): Promise<ServerUrls> => {
  settings = { ...EMPTY };
  await AsyncStorage.removeItem(SERVER_URLS_KEY);
  return getServerUrls();
};
