import axios, { InternalAxiosRequestConfig } from 'axios';

import { getServerUrls } from '../config/serverConfig';

const authApi = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
  // Bounded so an unreachable auth service can't hang login forever, or park
  // the single-flight refresh promise in recipesApi indefinitely.
  timeout: 10000,
});

/**
 * The address is resolved per REQUEST, not at module load.
 *
 * This app is self-hosted, so the endpoint is a setting rather than a build
 * constant. Baking it into `axios.create` meant the value read at import time --
 * before AsyncStorage has been read, and long before anyone has had a chance to
 * type an address -- was the one every call used for the life of the process.
 */
authApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = getServerUrls().auth;
  return config;
});

export default authApi;

