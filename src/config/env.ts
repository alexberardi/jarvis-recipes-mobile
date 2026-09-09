// Fallbacks are the documented local dev ports: jarvis-auth 7701,
// jarvis-recipes-server 7030. Override per-environment via .env
// (see env.template) or EAS environment variables.

/**
 * EAS does NOT interpolate `${VAR}` inside eas.json's `env` block -- those are
 * literal strings. A profile written as
 *
 *   "env": { "EXPO_PUBLIC_RECIPES_API_BASE_URL": "${EXPO_PUBLIC_RECIPES_API_BASE_URL}" }
 *
 * ships a build where the variable's VALUE is the six-word placeholder, and it
 * flows straight through DEFAULT_URLS to the landing screen, which showed
 * "${EXPO_PUBLIC_RECIPES_API_BASE_URL}" where the server address belongs.
 *
 * eas.json is fixed, but treat an unexpanded placeholder as absent regardless:
 * a mis-templated build should fall back to a usable default rather than print
 * shell syntax at the user.
 */
const isUnexpandedPlaceholder = (value: string): boolean =>
  /^\$\{[^}]*\}$/.test(value.trim());

const fromEnv = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed || isUnexpandedPlaceholder(trimmed)) return fallback;
  return trimmed;
};

const AUTH_API_BASE_URL: string = fromEnv(
  process.env.EXPO_PUBLIC_AUTH_API_BASE_URL,
  'http://localhost:7701',
);

const RECIPES_API_BASE_URL: string = fromEnv(
  process.env.EXPO_PUBLIC_RECIPES_API_BASE_URL,
  'http://localhost:7030',
);

export { AUTH_API_BASE_URL, RECIPES_API_BASE_URL, fromEnv };
