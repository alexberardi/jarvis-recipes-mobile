import axios from 'axios';

import { AUTH_API_BASE_URL } from '../config/env';

const authApi = axios.create({
  baseURL: AUTH_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Bounded so an unreachable auth service can't hang login forever, or park
  // the single-flight refresh promise in recipesApi indefinitely.
  timeout: 10000,
});

export default authApi;

