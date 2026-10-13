/**
 * Ask jarvis-config-service where everything lives.
 *
 * One address instead of two. config-service already holds each service's
 * externally-reachable coordinates — its `external_host`/`external_port` columns
 * exist for exactly this ("clients OFF the docker network (the mobile app on a
 * phone)") — so a phone that knows the config URL can resolve the rest, and
 * moving a service to a new host stops being an app problem.
 *
 * This is NOT network discovery. Nothing is scanned; the address is still typed
 * once. Scanning is what triggers an iOS local-network prompt before the person
 * has decided to trust the app, and it fails silently on any network that
 * isolates clients.
 */
import { AUTH_SERVICE_NAME, RECIPES_SERVICE_NAME } from './serviceNames';

const TIMEOUT_MS = 8000;

export type DiscoveredUrls = {
  auth?: string;
  recipes?: string;
};

type ServiceRow = { name: string; url?: string };

/**
 * Rewrite an address that only means something inside docker.
 *
 * Services get registered with whatever host their operator typed, and the live
 * registry really does contain `host.docker.internal:7722` and container names.
 * From a phone those resolve to nothing at all, so anything obviously
 * host-local is re-pointed at the host we reached config-service on — which is,
 * by definition, reachable.
 */
const reachableFrom = (configUrl: string, serviceUrl: string): string => {
  const host = new URL(configUrl).hostname;
  return serviceUrl.replace(
    /\/\/(localhost|127\.0\.0\.1|host\.docker\.internal|0\.0\.0\.0)(?=[:/]|$)/i,
    `//${host}`,
  );
};

/**
 * Resolve the services this app needs. Returns what it found, which may be
 * neither — a partial answer is still worth having, since the caller keeps a
 * manual override for anything unregistered.
 */
export const discoverServices = async (configUrl: string): Promise<DiscoveredUrls> => {
  const base = configUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // `style=external` asks for published coordinates rather than the container
    // ones a phone cannot reach. Older builds 422 on the unknown enum, so fall
    // back to the plain endpoint and let the rewrite above do what it can.
    let response = await fetch(`${base}/services?style=external`, { signal: controller.signal });
    if (!response.ok) {
      response = await fetch(`${base}/services`, { signal: controller.signal });
    }
    if (!response.ok) return {};

    const body = (await response.json()) as { services?: ServiceRow[] };
    const found: DiscoveredUrls = {};

    for (const service of body.services ?? []) {
      if (!service.url) continue;
      const url = reachableFrom(base, service.url).replace(/\/+$/, '');
      if (service.name === AUTH_SERVICE_NAME) found.auth = url;
      if (service.name === RECIPES_SERVICE_NAME) found.recipes = url;
    }

    return found;
  } catch {
    // Unreachable, timed out, or not a config-service. The caller falls back to
    // what it resolved last time, so a brief outage does not sign anyone out.
    return {};
  } finally {
    clearTimeout(timer);
  }
};
