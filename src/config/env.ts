// Fallbacks are the documented local dev ports: jarvis-auth 7701,
// jarvis-recipes-server 7030. Override per-environment via .env
// (see env.template) or the EAS build profile's `env` block.
const AUTH_API_BASE_URL: string =
  process.env.EXPO_PUBLIC_AUTH_API_BASE_URL ?? 'http://localhost:7701';

const RECIPES_API_BASE_URL: string =
  process.env.EXPO_PUBLIC_RECIPES_API_BASE_URL ?? 'http://localhost:7030';

export { AUTH_API_BASE_URL, RECIPES_API_BASE_URL };
