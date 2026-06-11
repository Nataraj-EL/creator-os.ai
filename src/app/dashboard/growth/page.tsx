'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../../lib/store';
import { apiClient } from '../../../lib/api-client';
import { 
  TrendingUp, Sparkles, Target, Award, AlertTriangle, 
  Check, Percent, Clock, Users, Calendar, Loader2, 
  Play, CheckCircle2, Circle, ArrowUpRight, ChevronDown, Activity, RefreshCw,
  Globe, Search, AlertCircle, ArrowRight, BookOpen
} from 'lucide-react';
import { YoutubeIcon, InstagramIcon } from '../../../components/ui/BrandIcons';
import { motion, AnimatePresence } from 'framer-motion';

const stripMarkdownText = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');
};

const parseWeeklyRoadmap = (roadmapText: string) => {
  if (!roadmapText) return [];
  const cleaned = roadmapText.replace(/\*\*/g, '').replace(/### /g, '').replace(/## /g, '').replace(/# /g, '');
  const weeks = [];
  const regex = /(Week\s+\d+[:\-]?)/gi;
  const parts = cleaned.split(regex);
  let currentWeekHeader = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    if (part.toLowerCase().startsWith("week") && part.match(/\d+/)) {
      currentWeekHeader = part;
    } else if (currentWeekHeader) {
      weeks.push({
        week: currentWeekHeader,
        content: part.replace(/^[:\-]/, '').trim()
      });
    } else {
      if (weeks.length === 0) {
        weeks.push({
          week: "Overview",
          content: part
        });
      }
    }
  }
  if (weeks.length === 0) {
    return [{ week: "Roadmap Plan", content: cleaned }];
  }
  return weeks;
};

interface GrowthRecommendation {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
  status: string; // PENDING, IN_PROGRESS, COMPLETED
}

interface GrowthAudit {
  id: string;
  growthScore: number;
  contentScore: number;
  engagementScore: number;
  consistencyScore: number;
  audienceScore: number;
  summary: string;
  views: number;
  subscribers: number;
  ctr: number;
  avdSeconds: number;
  weeklyUploads: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: GrowthRecommendation[];
  createdAt: string;
}

interface GrowthAdvisorResult {
  profileSummary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  contentGaps: string[];
  recommendations: string[];
  growthRoadmap: string;
}

interface GrowthAdvisorReport {
  id: string;
  workspaceId: string;
  platform: string;
  profileUrl: string;
  niche: string;
  report: GrowthAdvisorResult;
  createdAt: string;
}

export default function GrowthAdvisorPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);

  // URL Advisor State
  const [reports, setReports] = useState<GrowthAdvisorReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<GrowthAdvisorReport | null>(null);
  const [profileUrl, setProfileUrl] = useState('');
  const [niche, setNiche] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<'YOUTUBE' | 'INSTAGRAM' | null>(null);
  const [analyzingUrl, setAnalyzingUrl] = useState(false);
  const [advisorStep, setAdvisorStep] = useState(0);

  const advisorSteps = [
    "Fetching profile...",
    "Analyzing content...",
    "Generating recommendations...",
    "Preparing growth roadmap...",
    "Ready"
  ];

  // Fetch all URL advisor reports
  const fetchReports = async (workspaceId: string) => {
    try {
      const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/growth-advisor`);
      if (response.data) {
        setReports(response.data);
        if (response.data.length > 0) {
          setSelectedReport(response.data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load growth advisor reports:", err);
    }
  };

  // Load initial data
  useEffect(() => {
    if (activeWorkspace) {
      fetchReports(activeWorkspace.id);
    }
  }, [activeWorkspace]);

  // Platform URL detection logic
  useEffect(() => {
    const url = profileUrl.trim().toLowerCase();
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.startsWith('@') || url.includes('youtube')) {
      setDetectedPlatform('YOUTUBE');
    } else if (url.includes('instagram.com') || url.includes('instagram')) {
      setDetectedPlatform('INSTAGRAM');
    } else {
      setDetectedPlatform(null);
    }
  }, [profileUrl]);

  // Execute URL Analysis (Growth Advisor)
  const handleAnalyzeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !profileUrl.trim()) return;

    setAnalyzingUrl(true);
    setAdvisorStep(0);

    const stepInterval = setInterval(() => {
      setAdvisorStep((prev) => {
        if (prev < advisorSteps.length - 2) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 1200);

    try {
      const response = await apiClient.post(`/api/v1/workspaces/${activeWorkspace.id}/growth-advisor/analyze`, {
        profileUrl: profileUrl.trim(),
        niche: niche.trim() || null
      });

      clearInterval(stepInterval);
      setAdvisorStep(4); // Ready
      await new Promise(resolve => setTimeout(resolve, 400));

      if (response.data) {
        setProfileUrl('');
        setNiche('');
        await fetchReports(activeWorkspace.id);
        setSelectedReport(response.data);
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error(err);
      alert(err.response?.data?.error || err.response?.data?.message || "Failed to analyze channel URL.");
    } finally {
      setAnalyzingUrl(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatHandle = (url: string) => {
    try {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const match = url.match(/youtube\.com\/(@[a-zA-Z0-9_.-]+)/);
        return match ? match[1] : "@youtube_creator";
      } else if (url.includes('instagram.com')) {
        const match = url.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/);
        return match ? `@${match[1]}` : "@instagram_creator";
      }
    } catch(e) {}
    return "@creator";
  };

  const isProfileOnlyMode = (summary: string | undefined) => {
    if (!summary) return false;
    return summary.includes("detailed analytics are unavailable") || summary.includes("PROFILE_ONLY");
  };

  return (
    <div className="space-y-8 max-w-6xl relative">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-cyan-400" />
            <span>Growth Advisor</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Get instant, AI-driven positioning critiques and roadmap blueprints from profile URLs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Main Work Area (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="space-y-6">
            
            {/* Form Input Card */}
            <div className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden space-y-4">
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-500/0 via-cyan-400 to-indigo-500/0" />
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Globe className="h-4 w-4 text-cyan-400" />
                <span>Analyze Public Profiles</span>
              </div>
              
              <form onSubmit={handleAnalyzeUrl} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* URL Input */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Profile or Channel URL</label>
                    <div className="relative">
                      <input
                        type="url"
                        required
                        value={profileUrl}
                        onChange={(e) => setProfileUrl(e.target.value)}
                        placeholder="e.g. https://youtube.com/@mrbeast or https://instagram.com/creator"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.02] border border-white/5 focus:border-cyan-500/50 focus:outline-none text-sm text-white transition-all"
                      />
                      <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
                    </div>
                  </div>
                  {/* Niche Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Optional Niche</label>
                    <input
                      type="text"
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      placeholder="e.g. Tech, Fitness, Comedy"
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5 focus:border-cyan-500/50 focus:outline-none text-sm text-white transition-all"
                    />
                  </div>
                </div>

                {/* Detected Platform Indicators */}
                {detectedPlatform && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                    <span>Detected Platform:</span>
                    {detectedPlatform === 'YOUTUBE' ? (
                      <span className="flex items-center gap-1 text-red-400 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/10">
                        <YoutubeIcon className="h-3.5 w-3.5" />
                        YouTube
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-pink-400 px-2 py-0.5 rounded-full bg-pink-500/10 border border-pink-500/10">
                        <InstagramIcon className="h-3.5 w-3.5" />
                        Instagram
                      </span>
                    )}
                  </div>
                )}

                {/* Submission Button */}
                <button
                  type="submit"
                  disabled={analyzingUrl || !profileUrl}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10 transition-all border border-transparent"
                >
                  {analyzingUrl ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Analyzing Profile...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      <span>Analyze Channel</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* URL Analysis Detail Report View */}
            {selectedReport ? (
              <div className="space-y-6">
                
                {/* Channel Header Banner */}
                <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-500/0 via-indigo-500 to-purple-500/0" />
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
                        {selectedReport.platform === 'YOUTUBE' ? (
                          <YoutubeIcon className="h-6 w-6 text-red-400" />
                        ) : (
                          <InstagramIcon className="h-6 w-6 text-pink-400" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-white">{formatHandle(selectedReport.profileUrl)}</h2>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                          Analyzed {formatDate(selectedReport.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Niche Badge */}
                    {selectedReport.niche && (
                      <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold">
                        Niche: {selectedReport.niche}
                      </span>
                    )}
                  </div>
                </div>

                {/* Profile Only Warning alert banner */}
                {isProfileOnlyMode(selectedReport.report?.profileSummary) && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 bg-amber-500/[0.04] border border-amber-500/20 flex gap-3 items-start text-xs text-amber-400"
                  >
                    <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />
                    <div className="space-y-0.5">
                      <span className="font-bold block text-white">Profile-Only Analysis Mode Active</span>
                      <p className="text-zinc-400">Detailed metric analytics could not be scraped from public sources. Recommendations are based on channel branding, positioning, and niche best practices.</p>
                    </div>
                  </motion.div>
                )}

                {/* Summary & Critique */}
                <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="h-4.5 w-4.5 text-cyan-400" />
                    <span>Channel Positioning Critique</span>
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed font-normal">
                    {stripMarkdownText(selectedReport.report?.profileSummary)}
                  </p>
                </div>

                {/* Strengths & Weaknesses Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-card rounded-2xl p-5 border border-emerald-500/10 bg-emerald-500/[0.01] space-y-4">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Check className="h-4.5 w-4.5 p-0.5 rounded-full bg-emerald-500/10" />
                      <span>Core Strengths</span>
                    </h3>
                    <ul className="space-y-3 text-xs text-zinc-400">
                      {selectedReport.report?.strengths?.map((str, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>{stripMarkdownText(str)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="glass-card rounded-2xl p-5 border border-red-500/10 bg-red-500/[0.01] space-y-4">
                    <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-4.5 w-4.5 text-red-400" />
                      <span>Growth Bottlenecks</span>
                    </h3>
                    <ul className="space-y-3 text-xs text-zinc-400">
                      {selectedReport.report?.weaknesses?.map((wk, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-red-400 font-bold">•</span>
                          <span>{stripMarkdownText(wk)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Audience Opportunities & Content Gaps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-card rounded-2xl p-5 border border-indigo-500/10 bg-indigo-500/[0.01] space-y-4">
                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="h-4.5 w-4.5 text-indigo-400" />
                      <span>Audience Opportunities</span>
                    </h3>
                    <ul className="space-y-3 text-xs text-zinc-400">
                      {selectedReport.report?.opportunities?.map((opp, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-indigo-400 font-bold">▶</span>
                          <span>{stripMarkdownText(opp)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="glass-card rounded-2xl p-5 border border-purple-500/10 bg-purple-500/[0.01] space-y-4">
                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-4.5 w-4.5 text-purple-400" />
                      <span>Content Strategy Gaps</span>
                    </h3>
                    <ul className="space-y-3 text-xs text-zinc-400">
                      {selectedReport.report?.contentGaps?.map((gap, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-purple-400 font-bold">✦</span>
                          <span>{stripMarkdownText(gap)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Actionable Recommendations List */}
                <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quick Wins & Adjustments</h3>
                  <div className="space-y-3">
                    {selectedReport.report?.recommendations?.map((rec, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/[0.01] border border-white/5 flex gap-3 items-start">
                        <div className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">{stripMarkdownText(rec)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 30-Day week-by-week Growth Roadmap */}
                <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="h-4.5 w-4.5 text-cyan-400" />
                    <span>30-Day Growth Roadmap</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parseWeeklyRoadmap(selectedReport.report?.growthRoadmap || '').map((item, idx) => (
                      <div key={idx} className="p-5 rounded-xl bg-white/[0.01] border border-white/5 space-y-2 relative overflow-hidden group hover:border-cyan-500/20 transition-all duration-300">
                        <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-cyan-500 to-indigo-500" />
                        <h4 className="text-xs font-black text-cyan-400 tracking-wider uppercase flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400" />
                          <span>{item.week}</span>
                        </h4>
                        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line font-normal">
                          {stripMarkdownText(item.content)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="glass-card rounded-2xl p-12 border border-white/5 text-center max-w-md mx-auto space-y-4">
                <div className="mx-auto w-12 h-12 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-cyan-400">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-white">No Profile Analysis Report</h3>
                <p className="text-xs text-zinc-500">Paste a YouTube channel or Instagram URL above to generate your custom creator advisor critique report.</p>
              </div>
            )}

          </div>

        </div>

        {/* Audit Timeline / History Panel (Right Column) */}
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-4.5 w-4.5 text-indigo-400" />
              <span>Advisor History</span>
            </h3>
            
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {reports.length === 0 ? (
                <span className="text-xs text-zinc-500 block py-6 text-center italic">No URLs analyzed yet.</span>
              ) : (
                reports.map((r) => {
                  const isSelected = selectedReport?.id === r.id;
                  const handle = formatHandle(r.profileUrl);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedReport(r)}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all hover:bg-white/[0.02] flex items-center justify-between ${
                        isSelected 
                          ? 'border-cyan-500/30 bg-cyan-950/5 text-white' 
                          : 'border-white/5 text-zinc-400'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          {r.platform === 'YOUTUBE' ? (
                            <YoutubeIcon className="h-3 w-3 text-red-400" />
                          ) : (
                            <InstagramIcon className="h-3 w-3 text-pink-400" />
                          )}
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            {r.platform} • {formatDate(r.createdAt)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold tracking-tight block truncate max-w-[150px]">{handle}</span>
                      </div>
                      <ChevronDown className="h-3 w-3 text-zinc-600 -rotate-90 flex-shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Advisory tips card */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">How to Grow Further</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Detailed URL analysis evaluates your channel positioning and content gaps. Implement strengths recommendations and fix bottlenecks weekly to build compound distribution velocity across platforms.
            </p>
          </div>
        </div>

      </div>

      {/* FULL SCREEN GLASSMORPHIC URL ADVISOR LOADER */}
      <AnimatePresence>
        {analyzingUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
          >
            <div className="w-full max-w-sm px-6 text-center space-y-6">
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-cyan-400 animate-spin absolute" />
                <Globe className="h-5 w-5 text-indigo-400 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-md font-bold text-white">Advisor Channel Critique...</h3>
                <p className="text-xs text-zinc-500">Retrieving profile contents and synthesizing insights.</p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-left text-[10px] space-y-1.5 font-mono">
                {advisorSteps.map((step, idx) => {
                  const isCompleted = advisorStep > idx;
                  const isCurrent = advisorStep === idx;
                  return (
                    <div 
                      key={idx} 
                      className={`flex gap-2 items-center transition-opacity ${
                        isCompleted ? 'text-emerald-400' : isCurrent ? 'text-cyan-400 animate-pulse' : 'text-zinc-600 opacity-40'
                      }`}
                    >
                      <span>{isCompleted ? '✓' : isCurrent ? '▶' : '○'}</span>
                      <span className={isCurrent ? 'font-bold' : ''}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
