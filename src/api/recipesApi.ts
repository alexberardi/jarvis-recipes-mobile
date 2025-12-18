import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

import { RECIPES_API_BASE_URL } from '../config/env';

type RefreshFn = () => Promise<string | null>;
type LogoutFn = () => Promise<void>;
type AccessTokenFn = () => string | null;

let getAccessToken: AccessTokenFn = () => null;
let refreshAccessToken: RefreshFn = async () => null;
let logout: LogoutFn = async () => {};

export const setAuthHandlers = (handlers: {
  getAccessTokenHandler: AccessTokenFn;
  refreshAccessTokenHandler: RefreshFn;
  logoutHandler: LogoutFn;
}) => {
  getAccessToken = handlers.getAccessTokenHandler;
  refreshAccessToken = handlers.refreshAccessTokenHandler;
  logout = handlers.logoutHandler;
};

const recipesApi: AxiosInstance = axios.create({
  baseURL: RECIPES_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

recipesApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const isInvalidTokenError = (error: AxiosError) => {
    const status = error.response?.status;
  const detail = (error.response?.data as any)?.detail;
  const message = (detail || error.message || '').toString().toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    status === 498 ||
    message.includes('invalid token') ||
    message.includes('expired token') ||
    message.includes('token expired') ||
    message.includes('token has expired')
  );
};

export const recipesRequest = async <T = any>(
  config: AxiosRequestConfig,
  retryCount = 0,
): Promise<T> => {
  try {
    const res = await recipesApi.request<T>(config);
    return (res as any)?.data ?? (res as any);
  } catch (err: any) {
    const error = err as AxiosError;
    if (isInvalidTokenError(error)) {
      if (retryCount === 0) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
          return recipesRequest(
            {
              ...config,
              headers: {
                ...(config.headers || {}),
          Authorization: `Bearer ${newAccessToken}`,
              },
            },
            retryCount + 1,
          );
        }
      }
      await logout();
    }
    throw error;
  }
};

export default recipesApi;

