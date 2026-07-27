import axios from 'axios';
import { useAuthStore } from './store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

const isTokenExpired = (token: string | null) => {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    // Decode base64 payload safely
    const payload = JSON.parse(
      typeof window !== 'undefined' 
        ? atob(parts[1]) 
        : Buffer.from(parts[1], 'base64').toString('utf-8')
    );
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return true;
    }
    return false;
  } catch (e) {
    return true;
  }
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
      if (refreshToken && !isTokenExpired(refreshToken)) {
        try {
          const refreshResponse = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
            refreshToken,
          });
          const { accessToken: newAccessToken, refreshToken: newRefreshToken, user, workspaces } = refreshResponse.data;
          useAuthStore.getState().setAuth(newAccessToken, newRefreshToken, user, workspaces);
          accessToken = newAccessToken;
        } catch (err) {
          useAuthStore.getState().clearAuth();
          if (typeof window !== 'undefined') {
            localStorage.removeItem('creatoros-auth-storage');
            window.location.href = '/login';
          }
          return Promise.reject(err);
        }
      } else {
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('creatoros-auth-storage');
          window.location.href = '/login';
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

// Interceptor to handle token refresh on 401 errors
let isRefreshing = false;
let failedQueue: any[] = [];

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
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken, user, workspaces } = refreshResponse.data;
        useAuthStore.getState().setAuth(accessToken, newRefreshToken, user, workspaces);

        isRefreshing = false;
        processQueue(null, accessToken);

        originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('creatoros-auth-storage');
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
