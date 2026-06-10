'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Shield, Key, EyeOff, User, Target, Volume2, Calendar, Award, Loader2, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../../lib/store';
import { apiClient } from '../../../lib/api-client';

export default function SettingsPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);

  const [featureFlags, setFeatureFlags] = useState({
    videoRendering: true,
    linkedinAutomation: false,
    strictToxicityShield: true
  });

  // Creator Profile State
  const [profile, setProfile] = useState({
    creatorName: '',
    niche: '',
    primaryPlatform: '',
    targetAudience: '',
    contentStyle: '',
    brandVoice: '',
    growthGoal: '',
    postingFrequency: ''
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    const fetchProfile = async () => {
      setProfileLoading(true);
      setProfileMessage(null);
      try {
        const response = await apiClient.get(`/api/v1/workspaces/${activeWorkspace.id}/profile`);
        if (response.data) {
          setProfile({
            creatorName: response.data.creatorName || '',
            niche: response.data.niche || '',
            primaryPlatform: response.data.primaryPlatform || '',
            targetAudience: response.data.targetAudience || '',
            contentStyle: response.data.contentStyle || '',
            brandVoice: response.data.brandVoice || '',
            growthGoal: response.data.growthGoal || '',
            postingFrequency: response.data.postingFrequency || ''
          });
        }
      } catch (err) {
        console.error("Failed to load creator profile:", err);
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, [activeWorkspace]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      await apiClient.put(`/api/v1/workspaces/${activeWorkspace.id}/profile`, profile);
      setProfileMessage({ text: "Creator Profile saved successfully!", error: false });
      setTimeout(() => setProfileMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save creator profile:", err);
      setProfileMessage({ text: "Failed to save profile. Please try again.", error: true });
    } finally {
      setProfileSaving(false);
    }
  };

  const toggleFlag = (key: keyof typeof featureFlags) => {
    setFeatureFlags(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Settings className="h-7 w-7 text-cyan-400" />
          <span>Platform Settings</span>
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Configure application settings, connected features, and credentials.</p>
      </div>

      {/* Creator Profile Engine */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass-card rounded-2xl p-6 md:p-8 border border-white/5 space-y-6 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500/0 via-cyan-400 to-indigo-500/0" />
        
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <User className="h-5 w-5 text-cyan-400" />
              <span>Creator Profile Engine</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Configure your workspace brand voice, niche, and content properties for the AI Growth Engine.
            </p>
          </div>
          {activeWorkspace && (
            <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
              Workspace: {activeWorkspace.name}
            </span>
          )}
        </div>

        {profileLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
            <span className="text-xs text-zinc-400">Loading brand profile...</span>
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {profileMessage && (
              <div className={`p-4 rounded-xl border text-sm ${profileMessage.error ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                {profileMessage.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Demographics */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Creator / Brand Name</label>
                  <input
                    type="text"
                    value={profile.creatorName}
                    onChange={(e) => setProfile({ ...profile, creatorName: e.target.value })}
                    placeholder="e.g. Nataraj EL"
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Creator Niche</label>
                  <input
                    type="text"
                    value={profile.niche}
                    onChange={(e) => setProfile({ ...profile, niche: e.target.value })}
                    placeholder="e.g. AI & Tech Tutorials, Personal Finance"
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Primary Platform</label>
                  <select
                    value={profile.primaryPlatform}
                    onChange={(e) => setProfile({ ...profile, primaryPlatform: e.target.value })}
                    className="w-full bg-[#0a0f19] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  >
                    <option value="">Select Platform</option>
                    <option value="YouTube">YouTube</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Instagram">Instagram</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Twitter/X">Twitter/X</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Posting Frequency</label>
                  <input
                    type="text"
                    value={profile.postingFrequency}
                    onChange={(e) => setProfile({ ...profile, postingFrequency: e.target.value })}
                    placeholder="e.g. 3 times a week, Daily Shorts"
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  />
                </div>
              </div>

              {/* Right Column: Descriptions */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Target Audience Profile</label>
                  <textarea
                    value={profile.targetAudience}
                    onChange={(e) => setProfile({ ...profile, targetAudience: e.target.value })}
                    placeholder="Describe your typical viewer, age group, interests, and pain points..."
                    rows={2}
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Brand Voice & Tone</label>
                  <textarea
                    value={profile.brandVoice}
                    onChange={(e) => setProfile({ ...profile, brandVoice: e.target.value })}
                    placeholder="e.g. Informative, energetic, witty, technical yet accessible..."
                    rows={2}
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Content Style Description</label>
                  <textarea
                    value={profile.contentStyle}
                    onChange={(e) => setProfile({ ...profile, contentStyle: e.target.value })}
                    placeholder="e.g. Fast-paced visual storytelling, code walkthroughs, whiteboard drawings..."
                    rows={2}
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Core Growth Goal</label>
                  <textarea
                    value={profile.growthGoal}
                    onChange={(e) => setProfile({ ...profile, growthGoal: e.target.value })}
                    placeholder="e.g. Reach 100k subscribers, double email newsletter signups..."
                    rows={2}
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={profileSaving || !activeWorkspace}
                className="glow-btn px-6 py-3 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium rounded-xl text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {profileSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Brand Profile
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Feature flags card */}
        <motion.div 
          whileHover={{ 
            y: -6, 
            scale: 1.02, 
            borderColor: "rgba(99, 102, 241, 0.45)", 
            boxShadow: "0 20px 40px -10px rgba(99, 102, 241, 0.15)",
            transition: { type: "spring", stiffness: 400, damping: 25 }
          }}
          className="glass-card rounded-2xl p-6 border border-white/5 space-y-4"
        >
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-400" />
            <span>Workspace Features</span>
          </h2>
          <p className="text-xs text-zinc-500">Enable or disable additional creator modules in your workspace.</p>
          <div className="space-y-3 pt-2">
            {Object.entries(featureFlags).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">
                <div>
                  <span className="text-xs font-semibold text-white capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Toggle this feature in your workspace.</p>
                </div>
                <button
                  onClick={() => toggleFlag(key as any)}
                  className={`w-11 h-6 rounded-full transition-all relative cursor-pointer ${val ? 'bg-cyan-500' : 'bg-zinc-800'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${val ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>

        {/* API credentials & Vault */}
        <motion.div 
          whileHover={{ 
            y: -6, 
            scale: 1.02, 
            borderColor: "rgba(168, 85, 247, 0.45)", 
            boxShadow: "0 20px 40px -10px rgba(168, 85, 247, 0.15)",
            transition: { type: "spring", stiffness: 400, damping: 25 }
          }}
          className="glass-card rounded-2xl p-6 border border-white/5 space-y-4"
        >
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Key className="h-5 w-5 text-purple-400" />
            <span>Secure Connection Keys</span>
          </h2>
          <p className="text-xs text-zinc-400">All integration keys are safely encrypted and managed within your workspace storage.</p>
          
          <div className="space-y-3 pt-2">
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/[0.04] transition-all">
              <div>
                <span className="text-xs font-semibold text-white block">Instagram Account Token</span>
                <span className="text-[9px] text-zinc-500">Expires in 42 days</span>
              </div>
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <EyeOff className="h-3.5 w-3.5" />
                <span>Masked</span>
              </span>
            </div>
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/[0.04] transition-all">
              <div>
                <span className="text-xs font-semibold text-white block">YouTube Account ID</span>
                <span className="text-[9px] text-zinc-500">Persistent credentials</span>
              </div>
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <EyeOff className="h-3.5 w-3.5" />
                <span>Masked</span>
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
