/**
 * That the API clients actually USE the configured address.
 *
 * The flow tests replace these modules wholesale, so they prove the setting is
 * stored and displayed but never that a request goes anywhere near it. This is
 * the join between the two, and it is the piece whose failure is silent: the app
 * would look configured and still talk to localhost.
 */
import authApi from '../../src/api/authApi';
import recipesApi from '../../src/api/recipesApi';
import { DEFAULT_URLS, resetServerUrls, saveServerUrls } from '../../src/config/serverConfig';

/** Run the instance's request interceptors over a bare config, as axios would. */
const resolve = async (instance: any, config: any = { headers: {} }) => {
  let result = { ...config };
  for (const handler of instance.interceptors.request.handlers) {
    if (handler?.fulfilled) result = await handler.fulfilled(result);
  }
  return result;
};

beforeEach(async () => {
  await resetServerUrls();
});

test('a client created before any address is known still uses the saved one', async () => {
  // The reason the address is resolved per request. These modules are imported
  // at startup, long before AsyncStorage has been read; `axios.create({baseURL})`
  // would have frozen the build default for the life of the process.
  expect((recipesApi as any).defaults.baseURL).toBeUndefined();

  await saveServerUrls({ auth: 'http://10.0.0.122:7701', recipes: 'http://10.0.0.122:7030' });

  expect((await resolve(recipesApi)).baseURL).toBe('http://10.0.0.122:7030');
});

test('each client uses its own service address', async () => {
  // Auth and recipes are separate deployments; sending login to the recipes host
  // gets a 404 that reads like a broken build.
  await saveServerUrls({ auth: 'http://10.0.0.122:7701', recipes: 'http://10.0.0.122:7030' });

  expect((await resolve(authApi)).baseURL).toBe('http://10.0.0.122:7701');
  expect((await resolve(recipesApi)).baseURL).toBe('http://10.0.0.122:7030');
});

test('changing the address takes effect on the next request', async () => {
  // No restart: someone correcting a typo at the login screen must not have to
  // kill the app for it to take.
  await saveServerUrls({ auth: 'http://first:7701', recipes: 'http://first:7030' });
  expect((await resolve(recipesApi)).baseURL).toBe('http://first:7030');

  await saveServerUrls({ auth: 'http://second:7701', recipes: 'http://second:7030' });

  expect((await resolve(recipesApi)).baseURL).toBe('http://second:7030');
});

test('with nothing configured it falls back to the build defaults', async () => {
  expect((await resolve(recipesApi)).baseURL).toBe(DEFAULT_URLS.recipes);
  expect((await resolve(authApi)).baseURL).toBe(DEFAULT_URLS.auth);
});
