/**
 * The server address.
 *
 * Jarvis is self-hosted, so the endpoint cannot be a build constant — the
 * compiled-in values are the documented local-dev ports and are only ever right
 * on a developer's own machine. Everything here is about the ways a typed
 * address quietly fails to be one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AUTH_DEFAULT_PORT,
  DEFAULT_URLS,
  deriveCompanionUrl,
  getServerUrls,
  isValidUrl,
  loadServerUrls,
  normalizeUrl,
  resetServerUrls,
  saveServerUrls,
} from '../../src/config/serverConfig';
import { SERVER_URLS_KEY } from '../../src/config/storageKeys';

beforeEach(async () => {
  await AsyncStorage.clear();
  await resetServerUrls();
});

describe('normalising what someone typed', () => {
  test('a bare host gets a scheme', () => {
    // axios treats a schemeless baseURL as a RELATIVE path, so the request goes
    // nowhere and reports a network error rather than a bad address.
    expect(normalizeUrl('10.0.0.122:7030')).toBe('http://10.0.0.122:7030');
  });

  test('an address that already has one is left alone', () => {
    expect(normalizeUrl('https://jarvis.example.com')).toBe('https://jarvis.example.com');
    expect(normalizeUrl('http://10.0.0.122:7030')).toBe('http://10.0.0.122:7030');
  });

  test('a trailing slash is dropped', () => {
    // `${base}/recipes` against a base ending in / gives a double slash, which
    // some servers 404 and others redirect, losing the Authorization header.
    expect(normalizeUrl('http://10.0.0.122:7030/')).toBe('http://10.0.0.122:7030');
    expect(normalizeUrl('http://10.0.0.122:7030///')).toBe('http://10.0.0.122:7030');
  });

  test('surrounding whitespace is dropped', () => {
    // Phone keyboards add a trailing space readily, and it is invisible.
    expect(normalizeUrl('  10.0.0.122:7030  ')).toBe('http://10.0.0.122:7030');
  });

  test('empty stays empty rather than becoming http://', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('recognising an address', () => {
  test.each(['10.0.0.122:7030', 'http://10.0.0.122:7030', 'https://jarvis.example.com', 'jarvis.local'])(
    'accepts %s',
    (input) => expect(isValidUrl(input)).toBe(true),
  );

  test.each(['', '   ', 'http://'])('rejects %p', (input) => expect(isValidUrl(input)).toBe(false));
});

describe('guessing the companion service', () => {
  test('a bare host gives the sibling at its documented port', () => {
    expect(deriveCompanionUrl('http://10.0.0.122:7030', AUTH_DEFAULT_PORT)).toBe(
      'http://10.0.0.122:7701',
    );
  });

  test('the scheme is carried over', () => {
    expect(deriveCompanionUrl('https://jarvis.example.com', AUTH_DEFAULT_PORT)).toBe(
      'https://jarvis.example.com:7701',
    );
  });

  test('an address with a path guesses nothing', () => {
    // A path means a reverse proxy, where the sibling service is somewhere this
    // cannot work out. Guessing there would put a plausible wrong value in the
    // field, which is worse than an empty one.
    expect(deriveCompanionUrl('https://example.com/jarvis/recipes', AUTH_DEFAULT_PORT)).toBe('');
  });

  test('nonsense guesses nothing', () => {
    expect(deriveCompanionUrl('', AUTH_DEFAULT_PORT)).toBe('');
  });
});

describe('persistence', () => {
  test('what was saved is what comes back', async () => {
    await saveServerUrls({ auth: '10.0.0.122:7701', recipes: '10.0.0.122:7030' });

    expect(getServerUrls()).toEqual({
      auth: 'http://10.0.0.122:7701',
      recipes: 'http://10.0.0.122:7030',
    });
  });

  test('a saved address survives a restart', async () => {
    await saveServerUrls({ auth: 'http://10.0.0.122:7701', recipes: 'http://10.0.0.122:7030' });
    // resetServerUrls wipes the in-memory copy the way a fresh process would;
    // the point is that loadServerUrls brings it back from storage.
    await AsyncStorage.setItem(
      SERVER_URLS_KEY,
      JSON.stringify({ auth: 'http://10.0.0.122:7701', recipes: 'http://10.0.0.122:7030' }),
    );

    expect(await loadServerUrls()).toEqual({
      auth: 'http://10.0.0.122:7701',
      recipes: 'http://10.0.0.122:7030',
    });
  });

  test('nothing saved falls back to the build defaults', async () => {
    expect(await loadServerUrls()).toEqual(DEFAULT_URLS);
  });

  test('a corrupt value does not stop the app booting', async () => {
    // Whatever went wrong, refusing to start is the one unacceptable outcome:
    // the dialog that would let someone fix it is behind the app.
    await AsyncStorage.setItem(SERVER_URLS_KEY, 'not json at all');

    expect(await loadServerUrls()).toEqual(DEFAULT_URLS);
  });

  test('a half-written value keeps the default for the missing half', async () => {
    await AsyncStorage.setItem(SERVER_URLS_KEY, JSON.stringify({ recipes: 'http://10.0.0.122:7030' }));

    const loaded = await loadServerUrls();
    expect(loaded.recipes).toBe('http://10.0.0.122:7030');
    expect(loaded.auth).toBe(DEFAULT_URLS.auth);
  });

  test('resetting forgets the address', async () => {
    await saveServerUrls({ auth: 'http://a:1', recipes: 'http://b:2' });

    expect(await resetServerUrls()).toEqual(DEFAULT_URLS);
    expect(await AsyncStorage.getItem(SERVER_URLS_KEY)).toBeNull();
  });
});
