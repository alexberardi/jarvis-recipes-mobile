/**
 * The one seam the flow tests fake: HTTP.
 *
 * Every service in src/services reaches the server through
 * `recipesRequest({ method, url, ... })`, and auth goes through the `authApi`
 * axios instance. Stubbing exactly those two leaves everything above them —
 * services, hooks, screens, navigators — running for real, which is where the
 * bugs actually were. Mocking a service module instead would have hidden the
 * 422 this session spent an hour on: the request body was wrong, and only a
 * test that inspects the body as sent can see that.
 *
 * Routes are registered per test and matched most-recent-first, so a test can
 * override a route the harness set up without unregistering it.
 */

export type Req = { method: string; url: string; data?: any; params?: any };
type Responder = (req: Req & { match: RegExpMatchArray }) => unknown;

type Route = { method: string; pattern: RegExp; responder: Responder };

const routes: Route[] = [];

/** Every request the app made, in order, with the body it actually sent. */
export const calls: Req[] = [];

export const resetApi = () => {
  routes.length = 0;
  calls.length = 0;
};

/**
 * Register a route. `pattern` is matched against the URL, so '/recipes' matches
 * '/recipes?x=1' too; anchor it (/^\/recipes$/) when that matters.
 *
 * Overloaded rather than taking `Responder | unknown`: a union with `unknown`
 * swallows the whole type, and the responder's `{ data }` argument silently
 * becomes implicitly-any.
 */
export function route(method: string, pattern: RegExp | string, responder: Responder): void;
export function route(method: string, pattern: RegExp | string, value: unknown): void;
export function route(
  method: string,
  pattern: RegExp | string,
  responder: Responder | unknown,
): void {
  routes.push({
    method: method.toUpperCase(),
    pattern: typeof pattern === 'string' ? new RegExp(escapeRe(pattern)) : pattern,
    responder: typeof responder === 'function' ? (responder as Responder) : () => responder,
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An axios-shaped rejection, so screens' `err.response.data.detail` reading works. */
export const httpError = (status: number, detail?: string) => {
  const err: any = new Error(detail ?? `HTTP ${status}`);
  err.isAxiosError = true;
  err.response = { status, data: detail === undefined ? {} : { detail } };
  return err;
};

/** The calls made to one endpoint, newest last. */
export const callsTo = (method: string, urlFragment: string): Req[] =>
  calls.filter((c) => c.method === method.toUpperCase() && c.url.includes(urlFragment));

export const lastCallTo = (method: string, urlFragment: string): Req | undefined => {
  const matching = callsTo(method, urlFragment);
  return matching[matching.length - 1];
};

/**
 * What axios would actually put on the wire.
 *
 * A request body is JSON-serialized before it leaves, and that step is not
 * lossless: `undefined` inside an array becomes `null`, which is exactly how a
 * dropped id turned into the 422 that broke re-roll. Recording the raw object
 * would let a test assert a body the server would never receive.
 */
const wireBody = (data: unknown): unknown =>
  data === undefined ? undefined : JSON.parse(JSON.stringify(data));

const dispatch = async (req: Req): Promise<unknown> => {
  const method = (req.method || 'GET').toUpperCase();
  const url = req.url ?? '';
  calls.push({ ...req, method, url, data: wireBody(req.data) });

  for (let i = routes.length - 1; i >= 0; i -= 1) {
    const candidate = routes[i];
    if (candidate.method !== method) continue;
    const match = url.match(candidate.pattern);
    if (!match) continue;
    const result = candidate.responder({ ...req, method, url, match });
    if (result instanceof Error) throw result;
    return result;
  }

  // Loud, because a silent undefined shows up much later as an unrelated render
  // failure and costs far more to trace than an unhandled-route message.
  throw new Error(
    `fakeApi: no route for ${method} ${url}. Registered: ${
      routes.map((r) => `${r.method} ${r.pattern}`).join(', ') || '(none)'
    }`,
  );
};

/** Factory for `jest.mock('../../src/api/recipesApi', ...)`. */
export const recipesApiMock = () => ({
  __esModule: true,
  recipesRequest: (config: Req) => dispatch(config),
  refreshAuthToken: jest.fn().mockResolvedValue('refreshed-access-token'),
  setAuthHandlers: jest.fn(),
  default: { request: async (config: Req) => ({ data: await dispatch(config) }) },
});

/** Factory for `jest.mock('../../src/api/authApi', ...)`. */
export const authApiMock = () => {
  const verb =
    (method: string) =>
    async (url: string, data?: any, config?: any) => ({
      data: await dispatch({ method, url, data, params: config?.params }),
    });
  return {
    __esModule: true,
    default: {
      get: async (url: string, config?: any) => ({
        data: await dispatch({ method: 'GET', url, params: config?.params }),
      }),
      post: verb('POST'),
      put: verb('PUT'),
      patch: verb('PATCH'),
      delete: async (url: string, config?: any) => ({
        data: await dispatch({ method: 'DELETE', url, params: config?.params }),
      }),
    },
  };
};
