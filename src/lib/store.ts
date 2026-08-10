import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

// Startup Auth Validation & Stale Token Auto-Cleanup Migration
if (typeof window !== 'undefined') {
  // 4. One-Time Migration: Automatically remove raw mock keys if they exist
  if (localStorage.getItem('mock-google-access-token') !== null) {
    localStorage.removeItem('mock-google-access-token');
  }
  if (localStorage.getItem('mock-google-refresh-token') !== null) {
    localStorage.removeItem('mock-google-refresh-token');
  }

  try {
    const raw = localStorage.getItem('creatoros-auth-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed.state?.accessToken;
      const refreshToken = parsed.state?.refreshToken;
      
      // 1. Invalid or Expired JWT Auto-Cleanup
      if (token) {
        const resemblesJwt = token.includes('.') && token.split('.').length === 3;
        const startsWithMock = token.startsWith('mock-google-access-token');
        
        let isExpired = false;
        if (resemblesJwt) {
          try {
            const parts = token.split('.');
            const payload = JSON.parse(base64UrlDecode(parts[1]));
            if (payload.exp && Date.now() >= payload.exp * 1000) {
              isExpired = true;
            }
          } catch (e) {
            // Keep server/backend validation authoritative - do not assume expired on parse error
            console.warn("Client JWT parsing failed, deferring to server validation:", e);
          }
        }
        
        if (startsWithMock || (isExpired && !refreshToken)) {
          console.warn("Stale, invalid, or expired token detected during startup. Cleaning up auth storage...");
          localStorage.removeItem('creatoros-auth-storage');
          
          // Delete auth cookie
          document.cookie = `creatoros-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          
          // Redirect to /login preserving path
          const pathname = window.location.pathname || '';
          const search = window.location.search || '';
          const hash = window.location.hash || '';
          const path = pathname + search + hash;
          const redirectSuffix = path ? `?redirect=${encodeURIComponent(path)}` : '';
          window.location.href = `/login${redirectSuffix}`;
        }
      }
    }
  } catch (e) {
    console.error("Startup auth validation failed:", e);
  }
}

export interface User {
  id: string;
  email: string;
  role: string;
  profileImage: string | null;
  activeWorkspaceId?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setAuth: (accessToken: string, refreshToken: string, user: User, workspaces: Workspace[]) => void;
  clearAuth: () => void;
  setActiveWorkspace: (workspace: Workspace) => void;
  setAccessToken: (accessToken: string) => void;
  updateWorkspaces: (workspaces: Workspace[]) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      workspaces: [],
      activeWorkspace: null,
      setAuth: (accessToken, refreshToken, user, workspaces) => {
        if (typeof window !== 'undefined') {
          // Set a lightweight cookie for Next.js Middleware route protection
          document.cookie = `creatoros-auth-token=true; path=/; max-age=604800; SameSite=Lax`;
        }
        let active = workspaces.length > 0 ? workspaces[0] : null;
        if (user.activeWorkspaceId) {
          const matched = workspaces.find(w => w.id === user.activeWorkspaceId);
          if (matched) {
            active = matched;
          }
        }
        set({
          accessToken,
          refreshToken,
          user,
          workspaces,
          activeWorkspace: active
        });
      },
      clearAuth: () => {
        if (typeof window !== 'undefined') {
          // Delete cookie
          document.cookie = `creatoros-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          workspaces: [],
          activeWorkspace: null
        });
      },
      setActiveWorkspace: (activeWorkspace) => set((state) => {
        const updatedUser = state.user ? { ...state.user, activeWorkspaceId: activeWorkspace.id } : null;
        return { activeWorkspace, user: updatedUser };
      }),
      setAccessToken: (accessToken) => set({ accessToken }),
      updateWorkspaces: (workspaces) => set((state) => {
        let active = state.activeWorkspace;
        const currentActiveId = active?.id;
        if (active && currentActiveId && !workspaces.some(w => w.id === currentActiveId)) {
          active = workspaces.length > 0 ? workspaces[0] : null;
        } else if (!active && workspaces.length > 0) {
          active = workspaces[0];
        }
        const updatedUser = state.user ? { ...state.user, activeWorkspaceId: active?.id || null } : null;
        return { workspaces, activeWorkspace: active, user: updatedUser };
      }),
    }),
    {
      name: 'creatoros-auth-storage',
    }
  )
);
