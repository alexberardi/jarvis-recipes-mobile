/**
 * Where this install's Jarvis lives.
 *
 * One address — jarvis-config-service — and everything else is looked up from
 * it. The failure mode if this is wrong is the worst kind: login fails against
 * an address the person never chose, with a network error that looks like their
 * server being down.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as discovery from '../../src/config/configDiscovery';
import {
  DEFAULT_URLS,
  getServerSettings,
  getServerUrls,
  isValidUrl,
  loadServerUrls,
  normalizeUrl,
  refreshFromConfigService,
  resetServerUrls,
  setConfigUrl,
  setOverride,
} from '../../src/config/serverConfig';
import { SERVER_URLS_KEY } from '../../src/config/storageKeys';

const CONFIG = 'http://10.0.0.107:7700';
const FOUND = { auth: 'https://auth.example.com', recipes: 'http://10.0.0.107:7030' };

let discover: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  await resetServerUrls();
  discover = jest.spyOn(discovery, 'discoverServices').mockResolvedValue({ ...FOUND });
});

afterEach(() => discover.mockRestore());

describe('normalising what someone typed', () => {
  test('a bare host gets a scheme', () => {
    // axios treats a schemeless baseURL as a RELATIVE path, so the request goes
    // nowhere and reports a network error rather than a bad address.
    expect(normalizeUrl('10.0.0.107:7700')).toBe('http://10.0.0.107:7700');
  });

  test('a trailing slash is dropped, but not the scheme own slashes', () => {
    // Stripping the whole string turned "http://" into "http:", which then
    // failed the scheme test and was re-prefixed into "http://http:".
    expect(normalizeUrl('http://10.0.0.107:7700/')).toBe('http://10.0.0.107:7700');
    expect(normalizeUrl('http://')).toBe('');
  });

  test('surrounding whitespace is dropped', () => {
    expect(normalizeUrl('  10.0.0.107:7700  ')).toBe('http://10.0.0.107:7700');
  });

  test.each(['', '   ', 'http://'])('rejects %p', (input) =>
    expect(isValidUrl(input)).toBe(false),
  );
});

describe('discovery', () => {
  test('one address resolves the services behind it', () => {
    // The whole point: config-service already holds each service's externally
    // reachable coordinates, so nobody types them twice.
    return setConfigUrl(CONFIG).then(() => {
      expect(discover).toHaveBeenCalledWith(CONFIG);
      expect(getServerUrls()).toEqual({ auth: FOUND.auth, recipes: FOUND.recipes });
    });
  });

  test('a bare host is normalised before being asked', async () => {
    await setConfigUrl('10.0.0.107:7700');
    expect(discover).toHaveBeenCalledWith(CONFIG);
  });

  test('what it resolved survives a restart', async () => {
    await setConfigUrl(CONFIG);
    await resetServerUrls(); // clears memory, as a fresh process would

    // Nothing to discover this time; the cached values must still apply.
    discover.mockResolvedValue({});
    await AsyncStorage.setItem(
      SERVER_URLS_KEY,
      JSON.stringify({ configUrl: CONFIG, overrides: {}, discovered: FOUND }),
    );

    expect(await loadServerUrls()).toEqual({ auth: FOUND.auth, recipes: FOUND.recipes });
  });

  test('an outage keeps the last known addresses', async () => {
    // A config service that is briefly down must not sign anyone out.
    await setConfigUrl(CONFIG);
    discover.mockResolvedValue({});

    await refreshFromConfigService();

    expect(getServerUrls().recipes).toBe(FOUND.recipes);
  });

  test('a service it does not list keeps its previous value', async () => {
    // An operator who has not yet added the recipes row on the admin Services
    // page should not have a working install broken by asking.
    await setConfigUrl(CONFIG);
    discover.mockResolvedValue({ auth: 'https://auth.new.example.com' });

    await refreshFromConfigService();

    expect(getServerUrls().auth).toBe('https://auth.new.example.com');
    expect(getServerUrls().recipes).toBe(FOUND.recipes);
  });

  test('no address configured asks nothing', async () => {
    await loadServerUrls();
    expect(discover).not.toHaveBeenCalled();
    expect(getServerUrls()).toEqual(DEFAULT_URLS);
  });
});

describe('overrides', () => {
  test('a pinned address beats what discovery says', async () => {
    await setConfigUrl(CONFIG);
    await setOverride('recipes', '10.0.0.50:7030');

    expect(getServerUrls().recipes).toBe('http://10.0.0.50:7030');
    // The other service still comes from discovery.
    expect(getServerUrls().auth).toBe(FOUND.auth);
  });

  test('clearing one hands the service back to discovery', async () => {
    await setConfigUrl(CONFIG);
    await setOverride('recipes', '10.0.0.50:7030');

    await setOverride('recipes', null);

    expect(getServerUrls().recipes).toBe(FOUND.recipes);
  });

  test('an override survives a restart', async () => {
    await setConfigUrl(CONFIG);
    await setOverride('recipes', 'http://10.0.0.50:7030');
    await resetServerUrls();
    discover.mockResolvedValue({});

    await AsyncStorage.setItem(
      SERVER_URLS_KEY,
      JSON.stringify({
        configUrl: CONFIG,
        overrides: { recipes: 'http://10.0.0.50:7030' },
        discovered: {},
      }),
    );

    expect((await loadServerUrls()).recipes).toBe('http://10.0.0.50:7030');
  });
});

describe('storage', () => {
  test('nothing stored falls back to the build defaults', async () => {
    expect(await loadServerUrls()).toEqual(DEFAULT_URLS);
  });

  test('a corrupt value does not stop the app booting', async () => {
    // The screen that would let someone fix it is behind the app.
    await AsyncStorage.setItem(SERVER_URLS_KEY, 'not json at all');

    expect(await loadServerUrls()).toEqual(DEFAULT_URLS);
  });

  test('resetting forgets everything', async () => {
    await setConfigUrl(CONFIG);
    await setOverride('auth', 'http://a:1');

    expect(await resetServerUrls()).toEqual(DEFAULT_URLS);
    expect(getServerSettings().configUrl).toBe('');
    expect(await AsyncStorage.getItem(SERVER_URLS_KEY)).toBeNull();
  });
});
