'use client';

import React, { useState } from 'react';
import Link from 'next/navigation';
import { apiClient } from '../../lib/api-client';
import { Mail, ArrowLeft, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import Logo from '../../components/ui/Logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post('/api/v1/auth/forgot-password', {
        email,
      });

      setSuccess(response.data.message || 'If that email exists, we have sent a reset link.');
    } catch (err: any) {
      console.error(err);
      if (!err.response) {
        setError('Network Error: Cannot connect to the workspace. Please check your network connection or try again later.');
      } else {
        setError(
          err.response.data?.error || 
          err.response.data?.message || 
          'An error occurred. Please verify your email and try again.'
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
              Creator<span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">OS</span>
            </span>
          </div>
          <p className="text-sm text-zinc-400">Intelligent Operating System for Creator Growth</p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Border beam effect */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-500/0 via-indigo-500 to-purple-500/0 animate-shine" />

          <h2 className="text-xl font-semibold text-white mb-1">Reset password</h2>
          <p className="text-xs text-zinc-400 mb-6">Enter your email and we'll send you instructions to reset your password.</p>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
              <span className="mt-0.5 font-bold">⚠️</span>
              <div>{error}</div>
            </div>
          )}

          {success ? (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>{success}</div>
              </div>
              <a
                href="/login"
                className="w-full bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-white font-medium rounded-xl py-3 text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">EMAIL ADDRESS</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="glow-btn w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium rounded-xl py-3 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending Reset Link...
                  </>
                ) : (
                  <>
                    Send Recovery Email
                  </>
                )}
              </button>

              <div className="pt-4 text-center">
                <a
                  href="/login"
                  className="inline-flex items-center gap-2 text-xs text-cyan-400 font-medium hover:text-cyan-300 hover:underline transition-all"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to login
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
