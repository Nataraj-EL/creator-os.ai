'use client';

import React from 'react';
import { useAuthStore } from '../../lib/store';
import { Sparkles, TrendingUp, Users, Video, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DashboardOverviewPage() {
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);

  const stats = [
    { name: 'Estimated Subscribers', value: '48.2k', change: '+12.4%', icon: Users },
    { name: 'Video views (last 30 days)', value: '1.2M', change: '+8.3%', icon: Video },
    { name: 'Audience Engagement Score', value: '84.2%', change: '+1.5%', icon: TrendingUp },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-1.5">
          <Sparkles className="h-4 w-4" />
          <span>Growth Workspace active</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Workspace Overview
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Welcome back to <span className="text-white font-medium">{activeWorkspace?.name || 'your brand'}</span>. Below are your dynamic growth indicators.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div 
              key={i} 
              whileHover={{ 
                y: -6, 
                scale: 1.02, 
                borderColor: "rgba(56, 189, 248, 0.35)", 
                boxShadow: "0 20px 40px -10px rgba(56, 189, 248, 0.15)",
                transition: { type: "spring", stiffness: 400, damping: 25 }
              }}
              className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">{stat.name}</p>
                  <p className="text-3xl font-bold text-white mt-2 tracking-tight">{stat.value}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-cyan-400">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <span>{stat.change}</span>
                <span className="text-zinc-500 font-normal">vs previous month</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Main Info Card */}
      <motion.div 
        whileHover={{ 
          y: -6, 
          scale: 1.01, 
          borderColor: "rgba(99, 102, 241, 0.4)", 
          boxShadow: "0 20px 40px -10px rgba(99, 102, 241, 0.15)",
          transition: { type: "spring", stiffness: 400, damping: 25 }
        }}
        className="glass-card rounded-2xl p-8 border border-white/5 relative overflow-hidden flex flex-col md:flex-row gap-6 justify-between items-start md:items-center"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <AlertCircle className="h-4 w-4" />
            <span>SETUP PENDING</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Link your social channels</h2>
          <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
            Connect Instagram, YouTube, and TikTok to start drafting content, reviewing comments, and optimizing video headlines dynamically.
          </p>
        </div>
        <button className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium text-sm flex-shrink-0 cursor-pointer shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/25 transition-all">
          Link Accounts
        </button>
      </motion.div>
    </div>
  );
}
