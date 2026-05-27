import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
const browserWindow = typeof globalThis === 'object' && 'window' in globalThis
  ? (globalThis as typeof globalThis & { window?: Window & { dispatchEvent?: (event: Event) => boolean } }).window
  : undefined;
const browserStorage = typeof globalThis === 'object' && 'localStorage' in globalThis
  ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
  : undefined;

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth token
api.interceptors.request.use(config => {
  const token = browserStorage?.getItem('token') ?? null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to auto-logout when the backend rejects a request due to auth expiration
api.interceptors.response.use(
  response => response,
  error => {
    if (browserWindow && error?.response?.status === 401) {
      browserWindow.dispatchEvent?.(new Event('auth:logout'));
    }
    return Promise.reject(error);
  },
);

export default api;

