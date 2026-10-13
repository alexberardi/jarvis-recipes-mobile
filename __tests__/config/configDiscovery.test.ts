/**
 * Asking jarvis-config-service where everything lives.
 *
 * The rewrite below is not defensive coding for its own sake. The live prod
 * registry really does contain `http://host.docker.internal:7722` and bare
 * container names — services get registered with whatever host the operator
 * typed, and from a phone those resolve to nothing at all.
 */
import { discoverServices } from '../../src/config/configDiscovery';

const CONFIG = 'http://10.0.0.107:7700';

const respond = (services: { name: string; url?: string }[], ok = true) =>
  jest.fn().mockResolvedValue({ ok, json: async () => ({ services }) });

afterEach(() => {
  // @ts-expect-error -- restoring the global between cases
  delete global.fetch;
});

test('it asks for the external URL style', async () => {
  // Without it config-service returns container coordinates a phone cannot
  // reach: jarvis-auth:8000 rather than the published host and port.
  global.fetch = respond([]) as any;

  await discoverServices(CONFIG);

  expect(global.fetch).toHaveBeenCalledWith(
    `${CONFIG}/services?style=external`,
    expect.anything(),
  );
});

test('it falls back when the style is not understood', async () => {
  // Older config-service builds 422 on the unknown enum.
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ services: [{ name: 'jarvis-auth', url: 'http://10.0.0.107:7701' }] }),
    });
  global.fetch = fetchMock as any;

  const found = await discoverServices(CONFIG);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(found.auth).toBe('http://10.0.0.107:7701');
});

test('it finds the services this app needs', async () => {
  global.fetch = respond([
    { name: 'jarvis-tts', url: 'http://10.0.0.107:7707' },
    { name: 'jarvis-auth', url: 'https://auth.example.com:443' },
    { name: 'jarvis-recipes-server', url: 'http://10.0.0.107:7030' },
  ]) as any;

  expect(await discoverServices(CONFIG)).toEqual({
    auth: 'https://auth.example.com:443',
    recipes: 'http://10.0.0.107:7030',
  });
});

describe('addresses that only mean something inside docker', () => {
  test.each([
    ['localhost', 'http://localhost:7030'],
    ['127.0.0.1', 'http://127.0.0.1:7030'],
    ['host.docker.internal', 'http://host.docker.internal:7030'],
    ['0.0.0.0', 'http://0.0.0.0:7030'],
  ])('%s is re-pointed at the host we reached config-service on', async (_label, url) => {
    global.fetch = respond([{ name: 'jarvis-recipes-server', url }]) as any;

    const found = await discoverServices(CONFIG);

    expect(found.recipes).toBe('http://10.0.0.107:7030');
  });

  test('a real hostname is left alone', async () => {
    global.fetch = respond([
      { name: 'jarvis-recipes-server', url: 'https://recipes.example.com:443' },
    ]) as any;

    expect((await discoverServices(CONFIG)).recipes).toBe('https://recipes.example.com:443');
  });

  test('a hostname that merely CONTAINS localhost is left alone', async () => {
    // "localhost.example.com" is a real, routable name.
    global.fetch = respond([
      { name: 'jarvis-recipes-server', url: 'http://localhost.example.com:7030' },
    ]) as any;

    expect((await discoverServices(CONFIG)).recipes).toBe('http://localhost.example.com:7030');
  });
});

describe('when it cannot answer', () => {
  test('an unreachable config service resolves nothing rather than throwing', async () => {
    // The caller falls back to what it resolved last time; an exception here
    // would take the whole boot down.
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed')) as any;

    await expect(discoverServices(CONFIG)).resolves.toEqual({});
  });

  test('something that is not config-service resolves nothing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nope: true }),
    }) as any;

    await expect(discoverServices(CONFIG)).resolves.toEqual({});
  });

  test('a service listed without a URL is skipped', async () => {
    global.fetch = respond([{ name: 'jarvis-recipes-server' }]) as any;

    await expect(discoverServices(CONFIG)).resolves.toEqual({});
  });

  test('recipes absent from the registry is a partial answer, not a failure', async () => {
    // The normal state until someone adds the row on the admin Services page.
    global.fetch = respond([{ name: 'jarvis-auth', url: 'http://10.0.0.107:7701' }]) as any;

    expect(await discoverServices(CONFIG)).toEqual({ auth: 'http://10.0.0.107:7701' });
  });
});
