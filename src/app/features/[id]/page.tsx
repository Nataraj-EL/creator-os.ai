'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, ArrowRight } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import BrandLogo from '@/components/ui/BrandLogo';

interface FeatureDetail {
  title: string;
  tag: string;
  summary: string;
  longDescription: string;
  details: string[];
  mockUiTitle: string;
  mockUiItems: string[];
}

const featureDetails: Record<string, FeatureDetail> = {
  scriptwriter: {
    title: "Smart Video Scriptwriter",
    tag: "Scripting",
    summary: "Write engaging video scripts, find trending topic structures, and draft scroll-stopping hooks in seconds.",
    longDescription: "Struggling to outline your videos or keep viewers hooked in the first 3 seconds? The Smart Video Scriptwriter researches current audience interests, maps optimal video structures, and drafts high-impact intros tailored to your platform. It takes the heavy lifting out of content creation so you can focus on presenting.",
    details: [
      "Finds what topics and angles your audience is currently active on.",
      "Drafts multiple video hooks matching your selected style tone (educational, hype, engaging).",
      "Creates visual scene-by-scene script cards with outlines, pacing advice, and camera directions."
    ],
    mockUiTitle: "Drafting script hooks...",
    mockUiItems: [
      "Hook 1: 'This is why your topic is trending right now...'",
      "Hook 2: '99% of creators get this wrong within the first 3 seconds...'",
      "Pacing: Keep background movement fast. Zoom camera on key phrase."
    ]
  },
  growth: {
    title: "AI Growth Advisor",
    tag: "Growth",
    summary: "Critique and optimize your channel positioning, content gaps, and goals.",
    longDescription: "Ready to scale your YouTube or Instagram brand? The AI Growth Advisor performs deep public profile audits on niche positioning, formatting strategies, and target audience alignment. Get a structured roadmap detailing how to optimize CTR and subscriber traction.",
    details: [
      "Performs real-time profile audits based on public branding signals.",
      "Identifies content gaps and format opportunities within your niche.",
      "Generates custom 30-day week-by-week growth roadmap blueprints."
    ],
    mockUiTitle: "Growth Strategy Plan",
    mockUiItems: [
      "Niche Positioning: Technical educational tutorials with sleek aesthetics.",
      "Primary Opportunity: Introduce weekly challenge reels to capture high viral lift.",
      "Action: Shorten visual intros to less than 1.5 seconds."
    ]
  },
  analyzer: {
    title: "Reel Analyzer",
    tag: "Optimization",
    summary: "Verify hook engagement and retention patterns before posting video content.",
    longDescription: "Upload your short-form videos to run predictive intelligence on viral momentum. The Reel Analyzer evaluates visual momentum, speech pacing, caption phrasing, and CTA alignment against proven audience retention frameworks so you publish high-performing posts.",
    details: [
      "Scores hook engagement potential out of 100 based on initial visual/audio signals.",
      "Predicts average viewer retention and identifies potential drop-off zones.",
      "Critiques caption phrasing and call-to-actions to maximize subscriber conversions."
    ],
    mockUiTitle: "Reel Retention Forecast",
    mockUiItems: [
      "Hook Score: 92/100 (Strong visual momentum in first 3s)",
      "CTA Recommendation: Place caption CTA on screen for at least 4s.",
      "Viral Potential: High (Fast transition rate matches current algorithm trends)"
    ]
  },
  knowledge: {
    title: "Creator Brain Twin",
    tag: "Intelligence",
    summary: "Train a structured profile on your voice, style, and brand preferences.",
    longDescription: "Build a structured digital double of your creative voice. The Creator Brain Twin reads your uploaded knowledge documents, style guides, and brand transcripts to construct a persistent intelligence profile. Every content generation draft automatically adopts your exact expertise.",
    details: [
      "Extracts creator DNA markers, personality traits, and signature writing examples.",
      "Tracks document counts and total words analyzed to calculate profile confidence.",
      "Injects personal writing style context into Content Studio, Growth Advisor, and Reel Analyzer."
    ],
    mockUiTitle: "Brain Profile Matrix",
    mockUiItems: [
      "Voice: Authoritative yet accessible, HSL-focused design vocabulary.",
      "Writing Pattern: Open with rhetorical question, follow with three bullet items.",
      "Confidence: 94% (Learned from 15 upload document logs)"
    ]
  }
};

export default function FeatureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const feature = featureDetails[id];

  if (!feature) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex flex-col items-center justify-center gap-4">
        <BrandLogo size={48} showBg={true} textSize="text-2xl" />
        <h1 className="text-xl font-bold">Feature not found</h1>
        <Link href="/" className="text-cyan-400 hover:underline flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Homepage</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-white overflow-hidden grid-bg-dark relative flex flex-col justify-between">
      
      {/* Decorative radial glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />

      {/* TOP PERSUASIVE CTA BAR */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#030303]/80 backdrop-blur-md py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <Link href="/" className="cursor-pointer">
            <BrandLogo size={32} showBg={true} textSize="text-lg" />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-all hidden sm:inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Link>
            <Link
              href="/register"
              className="glow-btn px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-purple hover:bg-brand-purple/95 transition-all"
            >
              Start Building Free
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 flex-grow w-full">
        
        {/* Breadcrumb / Back button */}
        <button
          onClick={() => router.push('/')}
          className="mb-8 flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-white transition-all cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all features</span>
        </button>

        <div className="grid lg:grid-cols-2 gap-12 items-start mt-4">
          
          {/* Content side */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-[10px] font-bold text-brand-purple uppercase tracking-wider">
              {feature.tag} Feature Details
            </div>
            
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              {feature.title}
            </h1>
            
            <p className="text-lg text-zinc-300 font-medium leading-relaxed">
              {feature.summary}
            </p>

            <div className="h-px bg-white/5 my-6" />

            <p className="text-sm text-zinc-400 leading-relaxed">
              {feature.longDescription}
            </p>

            {/* List of details */}
            <div className="space-y-4 pt-4">
              {feature.details.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="mt-0.5 text-cyan-400 flex-shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <span className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual card preview side */}
          <div className="glass-card border border-white/10 rounded-3xl p-6 relative overflow-hidden shadow-2xl bg-zinc-950/40">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-500/0 via-cyan-500/30 to-indigo-500/0" />
            
            {/* Window header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/40" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/40" />
              </div>
              <span className="text-[10px] font-semibold text-zinc-500 tracking-wider uppercase">Workspace Preview</span>
            </div>

            {/* UI content mockup */}
            <div className="space-y-4">
              <span className="text-[10px] text-zinc-500 font-mono block uppercase tracking-wider">{feature.mockUiTitle}</span>
              <div className="space-y-3 bg-[#030303] border border-white/5 p-4 rounded-2xl">
                {feature.mockUiItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-zinc-400 leading-relaxed font-mono">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Active tag */}
            <div className="mt-8 flex items-center gap-1.5 text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Simulated module fully optimized</span>
            </div>
          </div>

        </div>

      </main>

      {/* BOTTOM PERSUASIVE CTA SECTION */}
      <footer className="w-full border-t border-white/5 bg-[#030303] py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-brand-purple/5 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6 relative z-10 flex flex-col items-center">
          <BrandLogo size={40} showBg={true} textSize="text-2xl" />
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Accelerate your channel growth today
          </h2>
          <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
            Stop losing hours to scripting templates, analytics lookups, and comment moderation. Let CreatorOS handle the details while you create.
          </p>
          <div className="pt-2">
            <Link
              href="/register"
              className="glow-btn px-8 py-4 rounded-xl text-sm font-bold text-white bg-brand-purple hover:bg-brand-purple/95 flex items-center justify-center gap-2 shadow-xl shadow-brand-purple/20 transition-all"
            >
              <span>Get Started Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
