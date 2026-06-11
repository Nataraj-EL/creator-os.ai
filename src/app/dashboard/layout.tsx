'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../lib/store';
import { apiClient } from '../../lib/api-client';
import { 
  LayoutDashboard, FolderKanban, TrendingUp, Video, 
  Database, Users, BarChart3, Settings, Bell, 
  Menu, X, ChevronDown, LogOut, User as UserIcon, 
  Sparkles, Plus, Check 
} from 'lucide-react';
import Logo from '../../components/ui/Logo';

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
}

const sidebarItems: SidebarItem[] = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Workspaces', href: '/dashboard/workspaces', icon: FolderKanban },
  { name: 'Growth Advisor', href: '/dashboard/growth', icon: TrendingUp },
  { name: 'Content Studio', href: '/dashboard/content', icon: Video },
  { name: 'Knowledge Hub', href: '/dashboard/knowledge', icon: Database },
  { name: 'Reel Analyzer', href: '/dashboard/audience', icon: Users },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Zustand State
  const user = useAuthStore((state) => state.user);
  const workspaces = useAuthStore((state) => state.workspaces);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const updateWorkspaces = useAuthStore((state) => state.updateWorkspaces);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  // Local UI State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Force dark mode on mount
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    localStorage.removeItem('creatoros-theme');
  }, []);

  // Sync workspace list from API on load
  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const response = await apiClient.get('/api/v1/workspaces');
        if (response.data) {
          updateWorkspaces(response.data);
        }
      } catch (err) {
        console.error("Failed to load workspace list:", err);
      }
    };
    if (user) {
      fetchWorkspaces();
    }
  }, [user?.id, updateWorkspaces]);

  // Validate authentication status with backend on init
  useEffect(() => {
    const validateAuth = async () => {
      try {
        await apiClient.get('/api/v1/users/me');
      } catch (err) {
        console.error("Startup Auth Validation failed. Token is invalid or expired:", err);
        clearAuth();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('creatoros-auth-storage');
          window.location.href = '/login';
        }
      }
    };
    if (user) {
      validateAuth();
    }
  }, [user?.id, clearAuth]);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  const handleSwitchWorkspace = async (w: any) => {
    try {
      await apiClient.post(`/api/v1/workspaces/${w.id}/activate`);
      setActiveWorkspace(w);
      setWorkspaceDropdownOpen(false);
      router.refresh();
    } catch (err) {
      console.error("Failed to switch workspace context:", err);
      setActiveWorkspace(w);
      setWorkspaceDropdownOpen(false);
    }
  };

  const notifications = [
    { id: 1, title: 'Script Hook Generated', desc: 'Hook suggestion generated with high projected audience interest.', time: '2m ago', unread: true },
    { id: 2, title: 'Comment Moderation Alert', desc: '4 comments filtered from YouTube Shorts.', time: '23m ago', unread: true },
    { id: 3, title: 'Trending Topic Alert', desc: 'Trending alert: "Next.js 16" is gaining popular attention.', time: '2h ago', unread: false }
  ];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground transition-colors duration-300 overflow-hidden">
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full glass-card border-b border-border px-4 h-16 flex items-center justify-between">
        
        {/* Logo and Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          
          <div className="flex items-center gap-2">
            <Logo size={32} showBg={true} />
            <span className="text-xl font-bold tracking-tight text-foreground hidden sm:inline-block">
              CreatorOS<span className="text-brand-purple">.AI</span>
            </span>
          </div>

          <div className="h-4 w-[1px] bg-border mx-2 hidden md:block" />

          {/* Workspace Switcher */}
          <div className="relative">
            <button
              onClick={() => {
                setWorkspaceDropdownOpen(!workspaceDropdownOpen);
                setProfileDropdownOpen(false);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/30 border border-border hover:bg-muted/50 text-sm text-foreground transition-all focus:outline-none"
            >
              <span className="max-w-[120px] truncate font-medium">
                {activeWorkspace?.name || 'Select Workspace'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            </button>

            {workspaceDropdownOpen && (
              <div className="absolute left-0 mt-2 w-56 rounded-xl bg-card border border-border p-1 shadow-2xl z-50">
                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Brands & Channels
                </div>
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleSwitchWorkspace(w)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/50 transition-all text-left"
                  >
                    <span>{w.name}</span>
                    {activeWorkspace?.id === w.id && <Check className="h-4 w-4 text-cyan-400" />}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => {
                    router.push('/dashboard/workspaces?create=true');
                    setWorkspaceDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 rounded-lg hover:bg-cyan-400/5 transition-all text-left"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Workspace</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-3">
          

          {/* Notifications Center */}
          <div className="relative">
            <button
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileDropdownOpen(false);
                setWorkspaceDropdownOpen(false);
              }}
              className="p-2 text-zinc-400 hover:text-foreground rounded-xl bg-muted/30 border border-border hover:bg-muted/50 transition-all focus:outline-none relative"
            >
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-card border border-border p-2 shadow-2xl z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border mb-1">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Alert Center</span>
                  <span className="text-[10px] text-cyan-400 hover:underline cursor-pointer">Mark all read</span>
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={`p-2.5 rounded-xl transition-all cursor-pointer ${n.unread ? 'bg-muted/40 hover:bg-muted/60' : 'hover:bg-muted/20'}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className={`text-xs ${n.unread ? 'text-foreground font-semibold' : 'text-zinc-400'}`}>{n.title}</span>
                        <span className="text-[9px] text-zinc-500 flex-shrink-0">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{n.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-border mx-1" />

          {/* User Profile Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setProfileDropdownOpen(!profileDropdownOpen);
                setWorkspaceDropdownOpen(false);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-muted/30 border border-transparent hover:border-border transition-all focus:outline-none"
            >
              <div className="h-7 w-7 rounded-lg bg-muted text-cyan-400 border border-border flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {user?.email ? user.email.charAt(0) : <UserIcon className="h-4 w-4" />}
              </div>
              <ChevronDown className="h-3 w-3 text-zinc-500 hidden sm:block" />
            </button>

            {profileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-card border border-border p-1 shadow-2xl z-50">
                <div className="px-3 py-2">
                  <p className="text-xs text-zinc-500">SIGNED IN AS</p>
                  <p className="text-sm font-semibold text-foreground truncate mt-0.5">{user?.email}</p>
                </div>
                <div className="border-t border-border my-1" />
                <Link
                  href="/dashboard/settings"
                  onClick={() => setProfileDropdownOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted transition-all text-left"
                >
                  <Settings className="h-4 w-4 text-zinc-500" />
                  <span>Profile Settings</span>
                </Link>
                <div className="border-t border-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 rounded-lg hover:bg-red-400/5 transition-all text-left"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Main Core Layout Body */}
      <div className="flex flex-1 h-[calc(100vh-4rem)] overflow-hidden relative">
        
        {/* Desktop Sidebar (permanently visible on md+) */}
        <aside className="hidden md:block w-64 border-r border-border bg-card/30 flex-shrink-0 p-4 space-y-6 overflow-y-auto">
          <div className="px-3">
            <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">CREATOR STUDIO</span>
          </div>
          <nav className="space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 text-cyan-400 border border-cyan-500/20' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Slide-out Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm">
            <div className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border p-4 space-y-6 z-40">
              <div className="flex items-center justify-between px-3 border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <Logo size={28} showBg={true} />
                  <span className="text-md font-bold tracking-tight text-foreground">CreatorOS.AI</span>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-foreground hover:bg-muted rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="space-y-1">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive 
                          ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 text-cyan-400 border border-cyan-500/20' 
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent'
                      }`}
                    >
                      <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Content Panel */}
        <main className="flex-1 min-w-0 bg-background overflow-y-auto relative grid-bg-fine p-6 md:p-8">
          {children}
        </main>
      </div>

    </div>
  );
}
