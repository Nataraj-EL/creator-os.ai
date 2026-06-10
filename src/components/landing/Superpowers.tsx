"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, ArrowRight } from "lucide-react";

interface FeatureCard {
  id: string;
  number: string;
  tag: string;
  title: string;
  description: string;
}

const features: FeatureCard[] = [
  {
    id: "scriptwriter",
    number: "01",
    tag: "Scripting",
    title: "Smart Video Scriptwriter",
    description: "Tell the AI your video topic. The system researches trends, outlines your content, and drafts highly engaging script hooks to keep viewers watching.",
  },
  {
    id: "growth",
    number: "02",
    tag: "Growth",
    title: "AI Growth Advisor",
    description: "Paste your YouTube channel or Instagram profile URL to receive actionable audience opportunities, content gaps, and personalized 30-day action plans.",
  },
  {
    id: "analyzer",
    number: "03",
    tag: "Optimization",
    title: "Reel Analyzer",
    description: "Upload your short-form videos to analyze hook engagement, retention probability, caption alignment, and viral potential before you post.",
  },
  {
    id: "knowledge",
    number: "04",
    tag: "Intelligence",
    title: "Creator Brain Twin",
    description: "Build a structured profile representing your unique voice, expertise, and communication style. All AI outputs automatically adapt to your identity.",
  },
];

export default function Superpowers() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScrollLimits = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScrollLimits);
      checkScrollLimits();
    }
    return () => {
      if (el) {
        el.removeEventListener("scroll", checkScrollLimits);
      }
    };
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 360;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="relative py-28 bg-[#030303] overflow-hidden" id="superpowers">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-brand-blue/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16">
          <div className="max-w-2xl">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-purple mb-3">
              Platform Features
            </h2>
            <p className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-none">
              AI Tools Built for Creators
            </p>
            <p className="mt-4 text-zinc-400 text-base">
              CreatorOS handles editing support, research, and community management tasks so you can focus on building your brand.
            </p>
          </div>

          {/* Navigation Arrows for Desktop */}
          <div className="hidden md:flex items-center space-x-3 mt-6 md:mt-0">
            <button
              onClick={() => scroll("left")}
              disabled={!showLeftArrow}
              className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                showLeftArrow
                  ? "border-white/10 text-white hover:bg-white/5 bg-white/[0.02]"
                  : "border-white/5 text-zinc-600 cursor-not-allowed"
              }`}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scroll("right")}
              disabled={!showRightArrow}
              className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                showRightArrow
                  ? "border-white/10 text-white hover:bg-white/5 bg-white/[0.02]"
                  : "border-white/5 text-zinc-600 cursor-not-allowed"
              }`}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Horizontal Slider List */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-8 pt-8 scrollbar-none -mx-4 px-4 md:-mx-8 md:px-8"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.number}
              className="min-w-[280px] sm:min-w-[340px] md:min-w-[360px] max-w-[360px] snap-start glass-card rounded-2xl border border-white/5 p-8 flex flex-col justify-between group relative overflow-hidden"
              whileHover={{
                y: -8,
                scale: 1.03,
                borderColor: "rgba(56, 189, 248, 0.35)",
                boxShadow: "0 20px 40px -10px rgba(56, 189, 248, 0.25)",
              }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              {/* Subtle background glow on hover */}
              <div className="absolute inset-0 bg-gradient-to-b from-brand-purple/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              <div>
                {/* Content */}
                <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-brand-purple transition-colors duration-200">
                  {feature.title}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed mt-3">
                  {feature.description}
                </p>
              </div>

              {/* Minimal footer indicator with expand link */}
              <div className="mt-8 flex justify-end">
                <a
                  href={`/features/${feature.id}`}
                  className="p-2 rounded-lg bg-white/5 border border-white/5 text-zinc-400 group-hover:text-brand-purple group-hover:border-brand-purple/20 group-hover:bg-brand-purple/5 transition-all duration-200 cursor-pointer flex items-center justify-center"
                  title="Expand Feature Details"
                >
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
