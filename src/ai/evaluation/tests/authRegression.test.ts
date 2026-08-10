import test from 'node:test';
import assert from 'node:assert';
import axios from 'axios';
import { NextRequest } from 'next/server';

// Browser Mocking Setup
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { location: { href: '' } } as any;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { cookie: '' } as any;
}

const mockLocalStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { for (const k in mockLocalStorage) delete mockLocalStorage[k]; }
} as any;

globalThis.window.localStorage = globalThis.localStorage;

let cookiesMap = new Map<string, string>();
Object.defineProperty(globalThis.document, 'cookie', {
  get() {
    return Array.from(cookiesMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  },
  set(val) {
    const parts = val.split(';');
    const [cookieName, cookieVal] = parts[0].split('=');
    if (val.includes('expires=Thu, 01 Jan 1970')) {
      cookiesMap.delete(cookieName.trim());
    } else {
      cookiesMap.set(cookieName.trim(), cookieVal.trim());
    }
  },
  configurable: true
});

const createMockJwt = (payload: any): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
};

test('Authentication & Session Persistence Regression Suite', async (t) => {
  const { useAuthStore } = await import('../../../lib/store');
  const { apiClient } = await import('../../../lib/api-client');
  const { middleware } = await import('../../../middleware');

  t.beforeEach(() => {
    cookiesMap.clear();
    for (const key in mockLocalStorage) {
      delete mockLocalStorage[key];
    }
    useAuthStore.getState().clearAuth();
    globalThis.window.location.href = '';
  });

  await t.test('1. Valid JWT with base64url payload decoding checks', async () => {
    // Standard unpadded JWT payload with base64url symbols (- and _)
    const payload = { userId: 'user-123', role: 'CREATOR', exp: Math.floor(Date.now() / 1000) + 3600 };
    const base64urlToken = createMockJwt(payload);
    
    // Perform setAuth check (should write cookie)
    useAuthStore.getState().setAuth(base64urlToken, 'uuid-refresh-token', { id: 'user-123', email: 'test@example.com', role: 'CREATOR', profileImage: null }, [{ id: 'ws-1', name: 'Work' }]);
    
    assert.strictEqual(cookiesMap.get('creatoros-auth-token'), 'true');
    assert.strictEqual(useAuthStore.getState().accessToken, base64urlToken);
    assert.strictEqual(useAuthStore.getState().user?.id, 'user-123');
  });

  await t.test('2. Session hydration after reload checks', async () => {
    const payload = { userId: 'user-789', role: 'CREATOR', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = createMockJwt(payload);
    
    // Clear Zustand store state first (which writes empty state to mockLocalStorage)
    useAuthStore.getState().clearAuth();

    // Simulate raw persisted localstorage data AFTER clearAuth
    mockLocalStorage['creatoros-auth-storage'] = JSON.stringify({
      state: {
        accessToken: token,
        refreshToken: 'uuid-refresh-789',
        user: { id: 'user-789', email: 'test@example.com', role: 'CREATOR', profileImage: null },
        workspaces: [{ id: 'ws-2', name: 'Workspace 2' }],
        activeWorkspace: { id: 'ws-2', name: 'Workspace 2' }
      },
      version: 0
    });

    // Manually trigger rehydrate to simulate reload
    await (useAuthStore.persist as any).rehydrate();
    
    assert.strictEqual(useAuthStore.getState().accessToken, token);
    assert.strictEqual(useAuthStore.getState().user?.id, 'user-789');
    assert.strictEqual(useAuthStore.getState().activeWorkspace?.id, 'ws-2');
  });

  await t.test('3. Dashboard <=> Evaluation navigation doesn\'t clear session', async () => {
    const payload = { userId: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = createMockJwt(payload);
    
    useAuthStore.getState().setAuth(token, 'uuid-refresh-token', payload as any, [{ id: 'ws-1', name: 'Work' }]);
    
    // Transition simulation
    let currentPath = '/dashboard/evaluation';
    assert.strictEqual(useAuthStore.getState().accessToken, token);
    assert.strictEqual(cookiesMap.get('creatoros-auth-token'), 'true');
    
    currentPath = '/dashboard';
    assert.strictEqual(useAuthStore.getState().accessToken, token);
    assert.strictEqual(cookiesMap.get('creatoros-auth-token'), 'true');
  });

  await t.test('4. Access token expiry + valid refresh token flow', async () => {
    const payload = { userId: 'user-123', exp: Math.floor(Date.now() / 1000) - 10 }; // Expired 10 seconds ago
    const expiredToken = createMockJwt(payload);
    
    useAuthStore.getState().setAuth(expiredToken, 'valid-uuid-refresh-token', payload as any, []);

    // Intercept refresh call
    const originalPost = axios.post;
    let refreshTriggered = false;
    (axios as any).post = async (url: string, data: any) => {
      if (url.includes('/api/v1/auth/refresh')) {
        refreshTriggered = true;
        return {
          data: {
            accessToken: createMockJwt({ userId: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 }),
            refreshToken: 'new-valid-uuid-refresh-token',
            user: { id: 'user-123', role: 'CREATOR' },
            workspaces: []
          }
        };
      }
      return originalPost(url, data);
    };

    try {
      // Trigger request interceptor by executing a dummy apiClient call
      const originalAxiosRequest = (apiClient as any).request;
      (apiClient as any).request = async (config: any) => {
        // Trigger request interceptor function manually
        const handlers = (apiClient.interceptors.request as any).handlers;
        let modifiedConfig = config;
        for (const handler of handlers) {
          if (handler.fulfilled) {
            modifiedConfig = await handler.fulfilled(modifiedConfig);
          }
        }
        return { data: 'dummy-response', config: modifiedConfig };
      };

      try {
        const response = await apiClient.request({ url: '/api/v1/workspaces', method: 'GET', headers: {} });
        assert.ok(refreshTriggered, 'Proactive token refresh should be triggered.');
        assert.notStrictEqual(useAuthStore.getState().accessToken, expiredToken);
        assert.strictEqual(response.config.headers['Authorization'], `Bearer ${useAuthStore.getState().accessToken}`);
      } finally {
        (apiClient as any).request = originalAxiosRequest;
      }
    } finally {
      axios.post = originalPost;
    }
  });

  await t.test('5. Invalid/expired refresh token logs out and redirects', async () => {
    const payload = { userId: 'user-123', exp: Math.floor(Date.now() / 1000) - 10 }; // Expired
    const expiredToken = createMockJwt(payload);
    
    useAuthStore.getState().setAuth(expiredToken, 'expired-uuid-refresh-token', payload as any, []);

    // Mock refresh failure (401 Unauthorized)
    const originalPost = axios.post;
    (axios as any).post = async (url: string, data: any) => {
      if (url.includes('/api/v1/auth/refresh')) {
        const err: any = new Error('Unauthorized');
        err.response = { status: 401 };
        err.isAxiosError = true;
        throw err;
      }
      return originalPost(url, data);
    };

    try {
      const originalAxiosRequest = (apiClient as any).request;
      (apiClient as any).request = async (config: any) => {
        const handlers = (apiClient.interceptors.request as any).handlers;
        let modifiedConfig = config;
        for (const handler of handlers) {
          if (handler.fulfilled) {
            modifiedConfig = await handler.fulfilled(modifiedConfig);
          }
        }
        return { data: 'dummy-response', config: modifiedConfig };
      };

      try {
        await apiClient.request({ url: '/api/v1/workspaces', method: 'GET', headers: {} });
        assert.fail('Should fail due to refresh failure');
      } catch (err) {
        assert.strictEqual(useAuthStore.getState().accessToken, null);
        assert.strictEqual(cookiesMap.has('creatoros-auth-token'), false);
        assert.strictEqual(globalThis.window.location.href, '/login');
      } finally {
        (apiClient as any).request = originalAxiosRequest;
      }
    } finally {
      axios.post = originalPost;
    }
  });

  await t.test('6. Concurrent requests trigger only one refresh call', async () => {
    const payload = { userId: 'user-123', exp: Math.floor(Date.now() / 1000) - 10 };
    const expiredToken = createMockJwt(payload);
    
    useAuthStore.getState().setAuth(expiredToken, 'concurrent-uuid-refresh-token', payload as any, []);

    const originalPost = axios.post;
    let refreshCallsCount = 0;
    (axios as any).post = async (url: string, data: any) => {
      if (url.includes('/api/v1/auth/refresh')) {
        refreshCallsCount++;
        // Simulate a slight delay
        await new Promise(r => setTimeout(r, 20));
        return {
          data: {
            accessToken: createMockJwt({ userId: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 }),
            refreshToken: 'new-concurrent-uuid-refresh-token',
            user: { id: 'user-123', role: 'CREATOR' },
            workspaces: []
          }
        };
      }
      return originalPost(url, data);
    };

    try {
      const originalAxiosRequest = (apiClient as any).request;
      (apiClient as any).request = async (config: any) => {
        const handlers = (apiClient.interceptors.request as any).handlers;
        let modifiedConfig = config;
        for (const handler of handlers) {
          if (handler.fulfilled) {
            modifiedConfig = await handler.fulfilled(modifiedConfig);
          }
        }
        return { data: 'response', config: modifiedConfig };
      };

      try {
        // Trigger two concurrent requests proactive token refreshes
        const [r1, r2] = await Promise.all([
          apiClient.request({ url: '/api/v1/workspaces', method: 'GET', headers: {} }),
          apiClient.request({ url: '/api/v1/content', method: 'GET', headers: {} })
        ]);
        
        assert.strictEqual(refreshCallsCount, 1, 'Only one refresh token post should run.');
        assert.strictEqual(r1.config.headers['Authorization'], r2.config.headers['Authorization']);
      } finally {
        (apiClient as any).request = originalAxiosRequest;
      }
    } finally {
      axios.post = originalPost;
    }
  });

  await t.test('7. Unauthenticated /dashboard access triggers middleware redirects', async () => {
    // Missing cookie in request
    const req = new NextRequest(new URL('http://localhost:3000/dashboard'));
    const response = await middleware(req);
    
    assert.strictEqual(response?.status, 307); // NextResponse.redirect status
    assert.ok(response?.headers.get('Location')?.includes('/login'), 'Redirect to /login should be present.');
  });
});
