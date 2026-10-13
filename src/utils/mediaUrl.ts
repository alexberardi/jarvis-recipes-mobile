import { getServerUrls } from '../config/serverConfig';

/**
 * Turn a recipe's stored `image_url` into something an <Image> can load.
 *
 * Photos uploaded in the editor come back from jarvis-recipes-server as a
 * RELATIVE path (`/media/<name>.jpg`), and that relative value is what is
 * stored and sent back on save. It is resolved here, at render time, against
 * whatever recipes base URL the app is using right now -- so a server that moves
 * to a new IP, or a phone that switches between the LAN and a public address,
 * keeps showing its photos. Never persist the resolved value.
 *
 * Anything that already carries a scheme (http/https from a web import, or a
 * local file:/content:/data: URI) or is protocol-relative is returned as-is.
 */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export const resolveMediaUrl = (
  url: string | null | undefined,
  baseUrl: string | null | undefined,
): string | null => {
  const value = (url ?? '').trim();
  if (!value) return null;
  if (HAS_SCHEME.test(value) || value.startsWith('//')) return value;

  const base = (baseUrl ?? '').trim().replace(/\/+$/, '');
  // With no base there is nothing to resolve against; a relative URI would
  // not load anyway, so report "no image" and let the placeholder show.
  if (!base) return null;

  return `${base}/${value.replace(/^\/+/, '')}`;
};

/** resolveMediaUrl against the recipes server the app is talking to now. */
export const resolveRecipeImageUrl = (url: string | null | undefined): string | null =>
  resolveMediaUrl(url, getServerUrls().recipes);
