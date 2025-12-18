const AUTH_API_BASE_URL =
  process.env.EXPO_PUBLIC_AUTH_API_BASE_URL ?? 'http://localhost:8000';

const RECIPES_API_BASE_URL =
  process.env.EXPO_PUBLIC_RECIPES_API_BASE_URL ?? 'http://localhost:8001';

export { AUTH_API_BASE_URL, RECIPES_API_BASE_URL };

