'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../../lib/store';
import { apiClient } from '../../../lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, Upload, Loader2, Sparkles, CheckCircle2, AlertCircle, 
  Trash2, ChevronRight, Play, Film, Calendar, Clock, BarChart3,
  Flame, Award, ShieldAlert, ArrowUpRight, Plus, HelpCircle, FileText
} from 'lucide-react';

interface ReelAnalysis {
  analysisId: string;
  workspaceId: string;
  title: string;
  originalFilename: string;
  durationSeconds: number;
  hookScore: number;
  retentionScore: number;
  ctaScore: number;
  contentScore: number;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  reelUrl?: string;
  hookAnalysis?: string;
  captionAnalysis?: string;
  ctaAnalysis?: string;
  retentionPrediction?: string;
  viralPotential?: string;
  createdAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function ReelAnalyzerPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);

  // States
  const [analyses, setAnalyses] = useState<ReelAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ReelAnalysis | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [reelUrl, setReelUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const instReelRegex = /^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[a-zA-Z0-9_-]+\/?.*$/;

  // Loading Steps
  const analysisSteps = [
    "Reading video metadata...",
    "Analyzing hook strength...",
    "Calculating retention indicators...",
    "Evaluating CTA effectiveness...",
    "Building recommendations..."
  ];

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // Fetch analysis history
  const fetchHistory = async (workspaceId: string, selectIdAfterFetch?: string) => {
    setLoadingHistory(true);
    try {
      const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/reels`);
      if (response.data) {
        const fetchedHistory: ReelAnalysis[] = response.data;
        setAnalyses(fetchedHistory);
        
        if (fetchedHistory.length > 0) {
          if (selectIdAfterFetch) {
            const match = fetchedHistory.find(r => r.analysisId === selectIdAfterFetch);
            if (match) {
              setSelectedAnalysis(match);
            } else {
              setSelectedAnalysis(fetchedHistory[0]);
            }
          } else if (!selectedAnalysis) {
            setSelectedAnalysis(fetchedHistory[0]);
          } else {
            // Keep active analysis synced
            const match = fetchedHistory.find(r => r.analysisId === selectedAnalysis.analysisId);
            if (match) {
              setSelectedAnalysis(match);
            } else {
              setSelectedAnalysis(fetchedHistory[0]);
            }
          }
        } else {
          setSelectedAnalysis(null);
        }
      }
    } catch (err) {
      console.error("Failed to load reel analysis history:", err);
      addToast("Failed to load analysis history", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeWorkspace) {
      fetchHistory(activeWorkspace.id);
    }
  }, [activeWorkspace]);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await uploadAndAnalyze(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await uploadAndAnalyze(file, null);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Upload and analyze logic
  const uploadAndAnalyze = async (file: File | null, url?: string | null) => {
    if (!activeWorkspace) return;
    
    if (file) {
      // Validate file type
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (fileExtension !== '.mp4' && fileExtension !== '.mov') {
        addToast("Invalid file type. Please upload .mp4 or .mov", "error");
        return;
      }
    } else if (url) {
      if (!instReelRegex.test(url)) {
        addToast("Invalid Instagram Reel URL format", "error");
        return;
      }
    } else {
      return;
    }

    setAnalyzing(true);
    setAnalysisStep(0);

    // Simulated animation steps
    const stepInterval = setInterval(() => {
      setAnalysisStep((prev) => {
        if (prev < analysisSteps.length - 1) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 1200);

    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    if (url) {
      formData.append('reelUrl', url);
    }

    try {
      const response = await apiClient.post(
        `/api/v1/workspaces/${activeWorkspace.id}/reels/analyze`,
        formData
      );

      clearInterval(stepInterval);
      setAnalysisStep(4);
      await new Promise(r => setTimeout(r, 400));

      if (response.data) {
        addToast("Reel analyzed successfully!", "success");
        setReelUrl('');
        await fetchHistory(activeWorkspace.id, response.data.analysisId);
      }
    } catch (err: any) {
      console.error(err);
      addToast(err.response?.data?.error || err.response?.data?.message || "Failed to analyze reel.", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  // Delete analysis
  const handleDeleteAnalysis = async (e: React.MouseEvent, analysisId: string) => {
    e.stopPropagation();
    if (!activeWorkspace) return;
    if (!confirm("Are you sure you want to delete this analysis?")) return;

    try {
      await apiClient.delete(`/api/v1/workspaces/${activeWorkspace.id}/reels/${analysisId}`);
      addToast("Analysis deleted", "info");
      
      const remaining = analyses.filter(r => r.analysisId !== analysisId);
      setAnalyses(remaining);
      if (remaining.length > 0) {
        if (selectedAnalysis?.analysisId === analysisId) {
          setSelectedAnalysis(remaining[0]);
        }
      } else {
        setSelectedAnalysis(null);
      }
    } catch (err) {
      console.error("Failed to delete analysis:", err);
      addToast("Failed to delete analysis", "error");
    }
  };

  // Get color variables based on score
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    if (score >= 60) return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
  };

  const getGaugeStroke = (score: number) => {
    if (score >= 80) return 'stroke-emerald-400';
    if (score >= 60) return 'stroke-amber-400';
    return 'stroke-rose-400';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-7xl mx-auto space-y-6">
      
      {/* Toast Notification Popups */}
      <div className="fixed top-20 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium backdrop-blur-md ${
                toast.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : toast.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'
              }`}
            >
              {toast.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {toast.type === 'error' && <AlertCircle className="h-4 w-4" />}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Title Header */}
      <div className="flex flex-shrink-0 justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Film className="h-7 w-7 text-cyan-400" />
            <span>Reel Analyzer</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Upload short-form videos to evaluate hook pacing, retention dropoffs, and CTA strength.</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs text-emerald-400 font-semibold uppercase">
          <Flame className="h-4 w-4 animate-pulse" />
          <span>Offline Analyzer Active</span>
        </div>
      </div>

      {/* Main Container Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch overflow-hidden">
        
        {/* LEFT COLUMN: Upload Zone + Previous Analyses History (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-hidden">
          
          {/* Input Mode Selector */}
          <div className="flex bg-[#0a0a0c]/60 p-1 rounded-xl border border-white/5 flex-shrink-0">
            <button
              onClick={() => setInputMode('upload')}
              className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                inputMode === 'upload'
                  ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20 text-cyan-400'
                  : 'text-zinc-400 hover:text-white font-medium'
              }`}
            >
              Upload Video
            </button>
            <button
              onClick={() => setInputMode('url')}
              className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                inputMode === 'url'
                  ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20 text-cyan-400'
                  : 'text-zinc-400 hover:text-white font-medium'
              }`}
            >
              Instagram URL
            </button>
          </div>

          {inputMode === 'upload' ? (
            /* Upload Drop Zone */
            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={onButtonClick}
              className={`glass-card rounded-2xl border border-dashed flex flex-col justify-center items-center p-6 text-center cursor-pointer transition-all flex-shrink-0 relative overflow-hidden group ${
                dragActive 
                  ? 'border-cyan-400 bg-cyan-400/5 shadow-lg shadow-cyan-500/5' 
                  : 'border-white/10 hover:border-white/20 hover:bg-white/[0.01]'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                accept=".mp4,.mov" 
                onChange={handleFileChange}
              />
              
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/10 transition-all" />

              <div className="h-10 w-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-cyan-400 shadow-md group-hover:scale-105 transition-all">
                <Upload className="h-5 w-5" />
              </div>

              <h3 className="text-xs font-bold text-white mt-3.5">Analyze New Reel</h3>
              <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px] leading-relaxed">
                Drag and drop your video file here, or click to browse (.mp4, .mov)
              </p>
            </div>
          ) : (
            /* URL Form Link */
            <div className="glass-card rounded-2xl border border-white/5 p-5 bg-card/10 flex flex-col gap-3 flex-shrink-0">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Instagram Reel Link</span>
              <input
                type="text"
                placeholder="https://www.instagram.com/reel/..."
                value={reelUrl}
                onChange={(e) => setReelUrl(e.target.value)}
                className="w-full bg-[#0a0a0c]/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all"
              />
              <button
                onClick={() => uploadAndAnalyze(null, reelUrl)}
                className="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-bold rounded-xl py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <Sparkles className="h-4 w-4" />
                <span>Analyze URL</span>
              </button>
            </div>
          )}

          {/* Chronological History List */}
          <div className="glass-card rounded-2xl border border-white/5 flex flex-col flex-1 overflow-hidden bg-card/10">
            <div className="p-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Analysis Library</span>
              <span className="text-[10px] font-bold text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">
                {analyses.length} Reels
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
                  <span className="text-[10px] text-zinc-500">Loading library...</span>
                </div>
              ) : analyses.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Film className="h-8 w-8 text-zinc-600 mx-auto opacity-50" />
                  <p className="text-xs text-zinc-500">No analyzed videos found</p>
                </div>
              ) : (
                analyses.map((item) => (
                  <div
                    key={item.analysisId}
                    onClick={() => setSelectedAnalysis(item)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group cursor-pointer ${
                      selectedAnalysis?.analysisId === item.analysisId
                        ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-cyan-500/20 text-cyan-400'
                        : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.03] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-bold truncate text-white">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-zinc-500 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{item.durationSeconds}s</span>
                        </span>
                        <span className="text-zinc-700">•</span>
                        <span className="text-[9px] text-zinc-500">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <span className={`text-[10px] font-black h-6 w-6 rounded-lg flex items-center justify-center border ${
                        item.overallScore >= 80 
                          ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' 
                          : item.overallScore >= 60
                          ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
                          : 'text-rose-400 border-rose-500/20 bg-rose-500/10'
                      }`}>
                        {item.overallScore}
                      </span>
                      <button
                        onClick={(e) => handleDeleteAnalysis(e, item.analysisId)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all"
                        title="Delete analysis"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Active Analysis Dashboard / Onboarding Upload Block (8 cols) */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden relative">
          
          <AnimatePresence mode="wait">
            
            {/* 1. SIMULATING AI ANALYSIS OVERLAY */}
            {analyzing && (
              <motion.div
                key="analyzing-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-md z-40 flex flex-col items-center justify-center gap-6"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
                  <Loader2 className="h-10 w-10 text-cyan-400 animate-spin relative" />
                </div>
                
                <div className="space-y-2 text-center max-w-sm">
                  <h3 className="text-sm font-bold text-white font-mono">Analyzing Video Content</h3>
                  <p className="text-[11px] text-zinc-400 font-mono animate-pulse">
                    {analysisSteps[analysisStep]}
                  </p>
                  
                  {/* Fake Progress Bar */}
                  <div className="h-1.5 w-48 bg-white/[0.04] rounded-full overflow-hidden mt-3 mx-auto">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500"
                      initial={{ width: "0%" }}
                      animate={{ width: `${(analysisStep + 1) * 20}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* 2. ONBOARDING EMPTY STATE */}
            {!selectedAnalysis && !analyzing ? (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="glass-card rounded-2xl border border-white/5 p-8 flex flex-col justify-center items-center h-full text-center space-y-5 bg-card/5 relative overflow-hidden"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
                
                <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 mx-auto shadow-lg shadow-cyan-500/5">
                  <Film className="h-6 w-6" />
                </div>
                
                <div className="space-y-1.5 max-w-md">
                  <h2 className="text-lg font-bold text-white">No active reel analysis selected</h2>
                  <p className="text-xs text-zinc-400">
                    Upload a video file (.mp4 or .mov) on the left sidebar, or select a previous analysis from your library to examine detailed retention scores.
                  </p>
                </div>
              </motion.div>
            ) : (
              
              /* 3. DYNAMIC METRICS ANALYSIS VIEW */
              selectedAnalysis && !analyzing && (
                <motion.div
                  key="results-dashboard"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="flex flex-col h-full overflow-y-auto space-y-6 pr-2 custom-scrollbar"
                >
                  
                  {/* Top Stats Overview (Radial Gauge + Score Breakdown Grid) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-shrink-0">
                    
                    {/* Overall Score Gauge */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 flex flex-col items-center justify-center bg-card/5 text-center">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Overall Rating</span>
                      
                      <div className="relative mt-4 h-28 w-28 flex items-center justify-center">
                        <svg className="h-full w-full -rotate-90">
                          {/* Track */}
                          <circle 
                            cx="56" cy="56" r="48" 
                            className="stroke-white/[0.04]" 
                            strokeWidth="8" fill="none" 
                          />
                          {/* Animated Fill Circle */}
                          <motion.circle 
                            cx="56" cy="56" r="48" 
                            className={getGaugeStroke(selectedAnalysis.overallScore)}
                            strokeWidth="8" fill="none" 
                            strokeDasharray={2 * Math.PI * 48}
                            initial={{ strokeDashoffset: 2 * Math.PI * 48 }}
                            animate={{ strokeDashoffset: 2 * Math.PI * 48 * (1 - selectedAnalysis.overallScore / 100) }}
                            transition={{ duration: 1.2, ease: "easeOut" }}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-black text-white font-mono leading-none">
                            {selectedAnalysis.overallScore}
                          </span>
                          <span className="text-[9px] text-zinc-500 font-bold uppercase mt-1">Score</span>
                        </div>
                      </div>

                      <div className="mt-3 text-[10px] text-zinc-400 font-medium">
                        File: <span className="text-zinc-300 font-bold font-mono">{selectedAnalysis.originalFilename}</span> ({selectedAnalysis.durationSeconds}s)
                      </div>
                    </div>

                    {/* Breakdown Scores Grid (2 cols mapped to md:col-span-2) */}
                    <div className="md:col-span-2 glass-card rounded-2xl border border-white/5 p-5 bg-card/5 flex flex-col justify-between">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sub-Score Breakdowns</span>
                        <span className="text-[9px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full font-mono">Dialect-Safe Indicators</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        
                        {/* Hook Score */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-zinc-400 font-bold">Hook (First 3s)</span>
                            <span className="text-white font-bold font-mono">{selectedAnalysis.hookScore}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-cyan-400"
                              initial={{ width: "0%" }}
                              animate={{ width: `${selectedAnalysis.hookScore}%` }}
                              transition={{ duration: 0.8 }}
                            />
                          </div>
                        </div>

                        {/* Retention Score */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-zinc-400 font-bold">Retention / Pacing</span>
                            <span className="text-white font-bold font-mono">{selectedAnalysis.retentionScore}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-indigo-500"
                              initial={{ width: "0%" }}
                              animate={{ width: `${selectedAnalysis.retentionScore}%` }}
                              transition={{ duration: 0.8 }}
                            />
                          </div>
                        </div>

                        {/* CTA Score */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-zinc-400 font-bold">Call-To-Action</span>
                            <span className="text-white font-bold font-mono">{selectedAnalysis.ctaScore}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-emerald-400"
                              initial={{ width: "0%" }}
                              animate={{ width: `${selectedAnalysis.ctaScore}%` }}
                              transition={{ duration: 0.8 }}
                            />
                          </div>
                        </div>

                        {/* Content Score */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-zinc-400 font-bold">Content Structure</span>
                            <span className="text-white font-bold font-mono">{selectedAnalysis.contentScore}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-purple-500"
                              initial={{ width: "0%" }}
                              animate={{ width: `${selectedAnalysis.contentScore}%` }}
                              transition={{ duration: 0.8 }}
                            />
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>

                  {/* Diagnostic Breakdown Detail Lists */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-shrink-0">
                    
                    {/* Strengths Card */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-4 bg-card/5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Identified Strengths</span>
                      </div>
                      
                      <ul className="space-y-3">
                        {selectedAnalysis.strengths.map((str, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 text-xs text-zinc-300 leading-relaxed bg-white/[0.01] border border-white/[0.02] p-2.5 rounded-xl hover:bg-white/[0.02] transition-all">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                            <span>{str}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses Card */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-4 bg-card/5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <AlertCircle className="h-4.5 w-4.5 text-rose-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Critical Weaknesses</span>
                      </div>
                      
                      <ul className="space-y-3">
                        {selectedAnalysis.weaknesses.map((weak, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 text-xs text-zinc-300 leading-relaxed bg-white/[0.01] border border-white/[0.02] p-2.5 rounded-xl hover:bg-white/[0.02] transition-all">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                            <span>{weak}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </div>

                  {/* Detailed Analysis Breakdown Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-shrink-0">
                    
                    {/* Hook Analysis Card */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3 bg-card/5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <Sparkles className="h-4.5 w-4.5 text-cyan-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Hook Analysis</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {selectedAnalysis.hookAnalysis || "No hook analysis details available for this video."}
                      </p>
                    </div>

                    {/* Caption Analysis Card */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3 bg-card/5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <FileText className="h-4.5 w-4.5 text-indigo-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Caption Analysis</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {selectedAnalysis.captionAnalysis || "No caption analysis details available for this video."}
                      </p>
                    </div>

                    {/* CTA Analysis Card */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3 bg-card/5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <ArrowUpRight className="h-4.5 w-4.5 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">CTA Strategy Analysis</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {selectedAnalysis.ctaAnalysis || "No CTA strategy analysis details available for this video."}
                      </p>
                    </div>

                    {/* Retention Prediction Card */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3 bg-card/5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <BarChart3 className="h-4.5 w-4.5 text-cyan-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Retention Prediction</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {selectedAnalysis.retentionPrediction || "No retention dropoff prediction available for this video."}
                      </p>
                    </div>

                    {/* Viral Potential Card */}
                    <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3 bg-card/5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <Flame className="h-4.5 w-4.5 text-rose-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Viral Potential</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {selectedAnalysis.viralPotential || "No virality prediction details available for this video."}
                      </p>
                    </div>

                  </div>

                  {/* Prioritized Actions / Recommendations */}
                  <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-4 bg-card/5 flex-shrink-0">
                    <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                      <Sparkles className="h-4.5 w-4.5 text-cyan-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Actionable Recommendations</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {selectedAnalysis.recommendations.map((rec, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3.5 bg-white/[0.01] border border-white/[0.02] hover:border-white/[0.06] rounded-xl hover:bg-white/[0.03] transition-all gap-4">
                          <div className="flex items-start gap-3">
                            <span className="text-xs font-bold text-cyan-400 font-mono bg-cyan-400/10 h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0">
                              0{idx + 1}
                            </span>
                            <p className="text-xs text-zinc-300 leading-relaxed">{rec}</p>
                          </div>
                          <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0">
                            High Impact
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                </motion.div>
              )
            )}

          </AnimatePresence>

        </div>

      </div>

    </div>
  );
}
