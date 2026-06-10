"use client";

import { motion } from "framer-motion";
import { XCircle, CheckCircle2, Split, Clock, RefreshCw, BarChart2 } from "lucide-react";

const comparisonData = {
  oldWay: [
    { text: "7+ fragmented apps for writing, analytics, video notes, and growth advising.", icon: Split },
    { text: "Hours of manual scripting, profile analysis, and video hook reviews.", icon: Clock },
    { text: "Stale data sync cycles that delay critical real-time content responses.", icon: RefreshCw },
    { text: "Gut-feeling decisions on content positioning leading to flatlining growth.", icon: BarChart2 },
  ],
  newWay: [
    { text: "A single autonomous canvas linking writing templates, storage, and publication.", icon: CheckCircle2 },
    { text: "Instant script formatting, trend research, and scroll-stopping intros.", icon: CheckCircle2 },
    { text: "Instant sync matching engagement analytics directly with your script drafts.", icon: CheckCircle2 },
    { text: "Continuous growth advisor positioning critiques and retention-optimized video reviews.", icon: CheckCircle2 },
  ],
};

export default function Problem() {
  return (
    <section className="relative py-28 bg-[#030303] overflow-hidden" id="features">
      {/* Glows */}
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-brand-pink/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-brand-purple/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-purple mb-3">
            The Creator Bottle Neck
          </h2>
          <p className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.15]">
            Why scaling content operations today feels completely broken.
          </p>
          <p className="mt-4 text-zinc-400 text-lg">
            Creators are bogged down by administrative task loops instead of doing what they do best: creating. CreatorOS AI changes the landscape completely.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-stretch">
          {/* Old Way Panel */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            whileHover={{
              y: -8,
              scale: 1.02,
              borderColor: "rgba(239, 68, 68, 0.35)",
              boxShadow: "0 25px 50px -12px rgba(239, 68, 68, 0.1)",
              transition: { type: "spring", stiffness: 400, damping: 25 }
            }}
            className="glass-card rounded-3xl p-8 lg:p-10 border border-white/5 bg-white/[0.01] flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center space-x-3 mb-8">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-500 border border-red-500/15">
                  <XCircle className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-bold text-white">The Legacy Approach</h3>
              </div>
              <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
                Fragmented workflows require constant context-switching, slowing down velocity and throttling potential.
              </p>

              <div className="space-y-6">
                {comparisonData.oldWay.map((item, idx) => (
                  <div key={idx} className="flex items-start space-x-4">
                    <div className="mt-1 flex-shrink-0 text-red-500/60">
                      <XCircle className="h-5 w-5 stroke-[2]" />
                    </div>
                    <span className="text-zinc-400 font-medium leading-normal">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-white/5 text-zinc-500 text-xs font-semibold tracking-wider uppercase">
              Result: Wasted Hours & Flatline Growth
            </div>
          </motion.div>

          {/* New Way Panel */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            whileHover={{
              y: -8,
              scale: 1.02,
              borderColor: "rgba(99, 102, 241, 0.5)",
              boxShadow: "0 25px 50px -12px rgba(99, 102, 241, 0.25)",
              transition: { type: "spring", stiffness: 400, damping: 25 }
            }}
            className="glass-card rounded-3xl p-8 lg:p-10 border border-brand-purple/20 bg-gradient-to-tr from-brand-purple/5 via-transparent to-transparent flex flex-col justify-between relative"
          >
            {/* Border beam effect */}
            <div className="absolute inset-px rounded-3xl pointer-events-none border border-brand-purple/35 opacity-40 animate-[pulse_3s_infinite]" />

            <div>
              <div className="flex items-center space-x-3 mb-8">
                <div className="p-2 rounded-lg bg-brand-purple/10 text-brand-purple border border-brand-purple/15">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-bold text-white flex items-center space-x-2">
                  <span>CreatorOS Platform</span>
                </h3>
              </div>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                An integrated, AI-first engine that delegates the heavy-lifting of content delivery, analysis, and generation to autonomous agents.
              </p>

              <div className="space-y-6">
                {comparisonData.newWay.map((item, idx) => (
                  <div key={idx} className="flex items-start space-x-4">
                    <div className="mt-1 flex-shrink-0 text-brand-purple">
                      <item.icon className="h-5 w-5 stroke-[2]" />
                    </div>
                    <span className="text-zinc-200 font-medium leading-normal">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-brand-purple/10 text-brand-pink text-xs font-semibold tracking-wider uppercase flex justify-between items-center">
              <span>Result: 10x Velocity & Data-Driven Success</span>
              <span className="h-2 w-2 rounded-full bg-brand-pink animate-pulse" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
