import axios from 'axios';
import { useAuthStore } from './store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Safe Base64url Decode
const base64UrlDecode = (str: string): string => {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    if (typeof window !== 'undefined') {
      return atob(base64);
    }
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (e) {
    throw new Error("Invalid base64url string");
  }
};

const isTokenExpired = (token: string | null) => {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return true;
    }
    return false;
  } catch (e) {
    // Keep server validation authoritative - do not proactively expire on decode/parse error
    return false;
  }
};

// Global queuing controls to prevent duplicate token refresh requests
let isRefreshing = false;
let failedQueue: any[] = [];
let activeRefreshPromise: Promise<string> | null = null;

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const executeTokenRefresh = async (refreshToken: string): Promise<string> => {
  if (isRefreshing && activeRefreshPromise) {
    const result = await activeRefreshPromise;
    if (result) return result;
    throw new Error("Refresh token execution failed.");
  }

  isRefreshing = true;
  activeRefreshPromise = (async () => {
    try {
      const refreshResponse = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
        refreshToken,
      });
      const { accessToken, refreshToken: newRefreshToken, user, workspaces } = refreshResponse.data;
      useAuthStore.getState().setAuth(accessToken, newRefreshToken, user, workspaces);
      isRefreshing = false;
      processQueue(null, accessToken);
      return accessToken as string;
    } catch (refreshError) {
      isRefreshing = false;
      processQueue(refreshError, null);
      
      // Clear session ONLY when backend definitively rejects the refresh token (401/403/400)
      const isDefinitiveFailure = 
        axios.isAxiosError(refreshError) && 
        refreshError.response && 
        (refreshError.response.status === 401 || refreshError.response.status === 403 || refreshError.response.status === 400);

      if (isDefinitiveFailure) {
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('creatoros-auth-storage');
          const pathname = window.location.pathname || '';
          const search = window.location.search || '';
          const hash = window.location.hash || '';
          const path = pathname + search + hash;
          const redirectSuffix = path ? `?redirect=${encodeURIComponent(path)}` : '';
          window.location.href = `/login${redirectSuffix}`;
        }
      }
      throw refreshError;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
};

// Interceptor to inject tokens and trace IDs
apiClient.interceptors.request.use(
  async (config) => {
    // Inject custom trace identifier for system logs
    const traceId = typeof window !== 'undefined' 
      ? ((window as any).__traceId || ((window as any).__traceId = crypto.randomUUID())) 
      : crypto.randomUUID();
    config.headers['X-Trace-Id'] = traceId;

    let accessToken = useAuthStore.getState().accessToken;
    const refreshToken = useAuthStore.getState().refreshToken;

    // Proactively refresh the access token if it's expired and we are not calling auth endpoints
    if (accessToken && isTokenExpired(accessToken) && !config.url?.includes('/auth/')) {
      if (refreshToken) {
        try {
          accessToken = await executeTokenRefresh(refreshToken);
        } catch (err) {
          return Promise.reject(err);
        }
      } else {
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('creatoros-auth-storage');
          const pathname = window.location.pathname || '';
          const search = window.location.search || '';
          const hash = window.location.hash || '';
          const path = pathname + search + hash;
          const redirectSuffix = path ? `?redirect=${encodeURIComponent(path)}` : '';
          window.location.href = `/login${redirectSuffix}`;
        }
        return Promise.reject(new Error("Refresh token expired or missing. Please login again."));
      }
    }

    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token refresh on 401, making sure not to loop on auth endpoints themselves
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/')) {
      originalRequest._retry = true;

      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('creatoros-auth-storage');
          const pathname = window.location.pathname || '';
          const search = window.location.search || '';
          const hash = window.location.hash || '';
          const path = pathname + search + hash;
          const redirectSuffix = path ? `?redirect=${encodeURIComponent(path)}` : '';
          window.location.href = `/login${redirectSuffix}`;
        }
        return Promise.reject(error);
      }

      try {
        const newAccessToken = await executeTokenRefresh(refreshToken);
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
