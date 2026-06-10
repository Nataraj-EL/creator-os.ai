'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../lib/store';
import { Mail, Lock, UserPlus, ArrowRight, Loader2, Sparkles, Building2, X } from 'lucide-react';
import Logo from '../../components/ui/Logo';

const GoogleIcon = () => (
  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
);

const checkEmailTypo = (emailStr: string): string | null => {
  const commonTypos: { [key: string]: string } = {
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gamil.co': 'gmail.com',
    'gmail.co': 'gmail.com',
    'yahooo.com': 'yahoo.com',
    'yaho.com': 'yahoo.com',
    'hotnail.com': 'hotmail.com',
    'hotmial.com': 'hotmail.com',
  };

  const parts = emailStr.split('@');
  if (parts.length !== 2) return null;
  const local = parts[0];
  const domain = parts[1].toLowerCase();

  if (commonTypos[domain]) {
    return `${local}@${commonTypos[domain]}`;
  }
  return null;
};

const registerSchema = z.object({
  workspaceName: z.string()
    .min(2, 'Workspace name must be at least 2 characters.')
    .max(100, 'Workspace name must be under 100 characters.'),
  email: z.string()
    .email('Please enter a valid email address.')
    .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email address.'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/\d/, 'Password must contain at least one number.')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':",./<>?~`|\\\\]/, 'Password must contain at least one special character.'),
});

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleAccounts, setGoogleAccounts] = useState<{ name: string; email: string; avatar: string }[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const passwordRequirements = {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':",./<>?~`|\\\\]/.test(password)
  };

  const handleEmailBlur = () => {
    const typo = checkEmailTypo(email);
    setEmailSuggestion(typo);
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (emailSuggestion) {
      setEmailSuggestion(null);
    }
  };

  const handleGoogleRegister = async () => {
    setGoogleModalOpen(true);
    setLoadingAccounts(true);
    try {
      const res = await fetch('/api/device-accounts');
      const data = await res.json();
      if (data.success && data.accounts) {
        setGoogleAccounts(data.accounts);
      } else {
        setGoogleAccounts([
          { name: 'Nataraj EL', email: 'natarajel.dev@gmail.com', avatar: 'N' },
          { name: 'Nataraj Bio', email: 'natarajbio004@gmail.com', avatar: 'N' }
        ]);
      }
    } catch (e) {
      setGoogleAccounts([
        { name: 'Nataraj EL', email: 'natarajel.dev@gmail.com', avatar: 'N' },
        { name: 'Nataraj Bio', email: 'natarajbio004@gmail.com', avatar: 'N' }
      ]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSelectGoogleAccount = async (selectedEmail: string, name: string) => {
    setGoogleModalOpen(false);
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.post('/api/v1/auth/google-mock', {
        email: selectedEmail,
        name: name,
      });

      const { accessToken, refreshToken, user, workspaces } = response.data;
      setAuth(accessToken, refreshToken, user, workspaces);
      
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.error || 
        err.response?.data?.message || 
        'Failed to authenticate via Google.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = registerSchema.safeParse({ email, password, workspaceName });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post('/api/v1/auth/register', {
        email,
        password,
        workspaceName,
      });

      const { accessToken, refreshToken, user, workspaces } = response.data;
      
      // Update global auth store (sets cookie & storage)
      setAuth(accessToken, refreshToken, user, workspaces);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      if (!err.response) {
        setError('Network Error: Cannot connect to the workspace. Please check your network connection or try again later.');
      } else {
        setError(
          err.response.data?.error || 
          err.response.data?.email || 
          err.response.data?.password || 
          err.response.data?.message || 
          'Registration failed. Email may already be in use.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#030303] overflow-hidden grid-bg-dark">
      {/* Decorative glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[150px] pointer-events-none" />

      <div className="w-full max-w-md px-6 z-10">
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Logo size={40} showBg={true} />
            <span className="text-2xl font-bold tracking-tight text-white">
              CreatorOS<span className="text-brand-purple">.AI</span>
            </span>
          </div>
          <p className="text-sm text-zinc-400">Intelligent Operating System for Creator Growth</p>
        </div>

        {/* Register Card */}
        <div className="glass-card rounded-2xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Border beam effect */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-500/0 via-indigo-500 to-purple-500/0 animate-shine" />

          <h2 className="text-xl font-semibold text-white mb-1">Create your account</h2>
          <p className="text-xs text-zinc-400 mb-6">Start managing your channels, scripts, and vector memory.</p>

          <button
            type="button"
            onClick={handleGoogleRegister}
            disabled={loading}
            className="w-full flex items-center justify-center bg-white/[0.03] border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06] text-white font-medium rounded-xl py-3 text-sm cursor-pointer transition-all mb-4 disabled:opacity-50 disabled:pointer-events-none"
          >
            <GoogleIcon />
            Sign up with Google
          </button>

          <div className="relative flex items-center justify-center my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]"></div>
            </div>
            <span className="relative px-3 bg-[#0a0f19] text-[10px] text-zinc-500 uppercase tracking-wider">Or register with email</span>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
              <span className="mt-0.5 font-bold">⚠️</span>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">CREATOR BRAND / WORKSPACE NAME</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Building2 className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g. TechTech Media, My Brand"
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">EMAIL ADDRESS</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={handleEmailBlur}
                  placeholder="name@example.com"
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  required
                />
              </div>
              {emailSuggestion && (
                <div className="mt-1 text-[10px] text-zinc-400">
                  Did you mean{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(emailSuggestion);
                      setEmailSuggestion(null);
                    }}
                    className="text-cyan-400 font-medium hover:underline hover:text-cyan-300 transition-all focus:outline-none"
                  >
                    {emailSuggestion}
                  </button>
                  ?
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">PASSWORD</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  required
                />
              </div>
              {password.length > 0 && (
                <div className="mt-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Password Strength</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-zinc-500">
                    <div className={`flex items-center gap-1.5 transition-colors ${passwordRequirements.hasMinLength ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
                      <span className="text-[11px] font-bold">{passwordRequirements.hasMinLength ? '✓' : '•'}</span> 8+ Characters
                    </div>
                    <div className={`flex items-center gap-1.5 transition-colors ${passwordRequirements.hasUppercase ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
                      <span className="text-[11px] font-bold">{passwordRequirements.hasUppercase ? '✓' : '•'}</span> 1 Uppercase
                    </div>
                    <div className={`flex items-center gap-1.5 transition-colors ${passwordRequirements.hasLowercase ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
                      <span className="text-[11px] font-bold">{passwordRequirements.hasLowercase ? '✓' : '•'}</span> 1 Lowercase
                    </div>
                    <div className={`flex items-center gap-1.5 transition-colors ${passwordRequirements.hasNumber ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
                      <span className="text-[11px] font-bold">{passwordRequirements.hasNumber ? '✓' : '•'}</span> 1 Number
                    </div>
                    <div className={`flex items-center gap-1.5 transition-colors ${passwordRequirements.hasSpecialChar ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
                      <span className="text-[11px] font-bold">{passwordRequirements.hasSpecialChar ? '✓' : '•'}</span> 1 Special Char
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glow-btn w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium rounded-xl py-3 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Workspace...
                </>
              ) : (
                <>
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center text-xs text-zinc-400">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-cyan-400 font-medium hover:text-cyan-300 transition-all hover:underline"
            >
              Log in instead
            </Link>
          </div>
        </div>
      </div>

      {googleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center mb-6">
              <GoogleIcon />
              <h3 className="text-lg font-bold text-white mt-3">Choose an account</h3>
              <p className="text-xs text-zinc-400 mt-1">to continue to CreatorOS</p>
            </div>

            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto pr-1">
              {loadingAccounts ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
                  <span className="text-[10px] text-zinc-500">Retrieving device accounts...</span>
                </div>
              ) : (
                googleAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handleSelectGoogleAccount(acc.email, acc.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left cursor-pointer"
                  >
                    <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">
                      {acc.avatar}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-white truncate">{acc.name}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{acc.email}</p>
                    </div>
                  </button>
                ))
              )}

              <button
                type="button"
                onClick={() => {
                  const customEmail = prompt("Enter your Google email address:");
                  if (customEmail && customEmail.includes('@')) {
                    handleSelectGoogleAccount(customEmail, customEmail.split('@')[0]);
                  }
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left cursor-pointer"
              >
                <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs border border-white/5">
                  +
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Use another account</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Sign in to a different account</p>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
              To continue, Google will share your name, email address, language preference, and profile picture with CreatorOS.
            </p>

            <button
              type="button"
              onClick={() => setGoogleModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
