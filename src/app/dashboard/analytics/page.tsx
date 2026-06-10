'use client';

import { BarChart3, TrendingUp } from 'lucide-react';
import { YoutubeIcon, InstagramIcon, LinkedinIcon } from '../../../components/ui/BrandIcons';
import { motion } from 'framer-motion';

export default function AnalyticsSnapsPage() {
  const channelMetrics = [
    { platform: 'YouTube Channel', views: '842,000', rpm: '$8.40', growth: '+15.2%', icon: YoutubeIcon, color: 'text-red-500', hoverColor: 'rgba(239, 68, 68, 0.25)' },
    { platform: 'Instagram Reels', views: '380,000', rpm: 'N/A', growth: '+22.4%', icon: InstagramIcon, color: 'text-pink-500', hoverColor: 'rgba(236, 72, 153, 0.25)' },
    { platform: 'LinkedIn Posts', views: '48,000', rpm: 'N/A', growth: '+42.1%', icon: LinkedinIcon, color: 'text-blue-500', hoverColor: 'rgba(59, 130, 246, 0.25)' }
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-cyan-400" />
          <span>Analytics Snapshots</span>
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Aggregated platform analytics metrics pulled from connected workspace channels.</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {channelMetrics.map((channel, i) => {
          const Icon = channel.icon;
          return (
            <motion.div 
              key={i} 
              whileHover={{ 
                y: -6, 
                scale: 1.02, 
                borderColor: channel.hoverColor.replace('0.25', '0.4'), 
                boxShadow: `0 20px 40px -10px ${channel.hoverColor.replace('0.25', '0.2')}`,
                transition: { type: "spring", stiffness: 400, damping: 25 }
              }}
              className="glass-card rounded-2xl p-6 border border-white/5 space-y-4 cursor-pointer"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white">{channel.platform}</span>
                <Icon className={`h-5 w-5 ${channel.color}`} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">VIEWS (30D)</span>
                  <span className="text-white font-medium">{channel.views}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">EST. RPM</span>
                  <span className="text-white font-medium">{channel.rpm}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">GROWTH VELOCITY</span>
                  <span className="text-emerald-400 font-semibold">{channel.growth}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Analytics Graph mockup */}
      <motion.div 
        whileHover={{ 
          y: -6, 
          scale: 1.01, 
          borderColor: 'rgba(56, 189, 248, 0.4)', 
          boxShadow: '0 20px 40px -10px rgba(56, 189, 248, 0.15)',
          transition: { type: "spring", stiffness: 400, damping: 25 }
        }}
        className="glass-card rounded-2xl p-6 border border-white/5 space-y-4"
      >
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-cyan-400" />
          <span>Subscriber Growth Curve Forecast</span>
        </h2>
        <div className="h-48 bg-zinc-950 rounded-xl border border-white/[0.03] flex items-end justify-between p-6 gap-2">
          {[20, 30, 25, 45, 60, 55, 80, 95].map((val, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2">
              <div 
                className="w-full bg-gradient-to-t from-indigo-600 to-cyan-400 rounded-t-md hover:opacity-80 transition-all cursor-pointer relative group" 
                style={{ height: `${val}%` }}
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900 border border-white/10 px-2 py-0.5 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap">
                  {val * 100} views
                </div>
              </div>
              <span className="text-[10px] text-zinc-600">M{idx + 1}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
