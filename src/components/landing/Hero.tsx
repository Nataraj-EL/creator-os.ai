"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative min-h-screen pt-32 pb-20 flex flex-col justify-center items-center overflow-hidden grid-bg-dark">
      {/* Background radial glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] radial-glow pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[350px] h-[350px] bg-brand-indigo/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[350px] h-[350px] bg-brand-pink/10 blur-[120px] rounded-full pointer-events-none" />
      


      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10 flex flex-col items-center">
        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-5xl leading-[1.1]"
        >
          The AI Growth Companion for{" "}
          <span className="bg-gradient-to-r from-brand-purple via-brand-pink to-brand-blue bg-clip-text text-transparent animate-shine bg-[length:200%_auto]">
            Digital Creators
          </span>
        </motion.h1>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-3xl leading-relaxed"
        >
          Write scroll-stopping video scripts, repurpose your content for other platforms, audit your brand, and optimize audience retention—all in one place.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex items-center justify-center w-full max-w-xs"
        >
          <a
            href="/register"
            className="glow-btn w-full px-8 py-4 rounded-xl font-bold text-white bg-brand-purple hover:bg-brand-purple/95 flex items-center justify-center text-base transition-all shadow-xl shadow-brand-purple/20"
          >
            <span>Start Building Free</span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
