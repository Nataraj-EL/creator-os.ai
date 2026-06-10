"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Heart } from "lucide-react";

export default function CTA() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  };

  return (
    <section className="relative py-28 bg-[#030303] overflow-hidden">
      {/* Background visual components */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-r from-brand-purple/10 to-brand-pink/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 grid-bg-dark opacity-30 pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          whileHover={{ 
            y: -6, 
            scale: 1.01, 
            borderColor: "rgba(139, 92, 246, 0.45)", 
            boxShadow: "0 25px 50px -12px rgba(139, 92, 246, 0.2)",
            transition: { type: "spring", stiffness: 400, damping: 25 }
          }}
          className="glass-card rounded-3xl border border-brand-purple/20 bg-gradient-to-br from-brand-purple/[0.03] via-transparent to-transparent p-8 sm:p-12 lg:p-16 text-center relative overflow-hidden shadow-2xl"
        >
          {/* Border Pulse Glow */}
          <div className="absolute inset-px rounded-3xl border border-brand-purple/30 pointer-events-none opacity-30 animate-pulse" />

          <div className="relative z-10 flex flex-col items-center">
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-none">
              Supercharge Your Content Growth Today
            </h2>
            <p className="mt-6 text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed">
              Connect your channels, plan engaging video scripts, auto-reply to comments, and grow your audience in minutes.
            </p>

            {/* Email form */}
            {!submitted ? (
              <form
                onSubmit={handleSubmit}
                className="mt-10 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address..."
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-brand-purple transition-all duration-200"
                />
                <button
                  type="submit"
                  className="glow-btn w-full sm:w-auto px-6 py-4 rounded-xl font-bold text-white bg-brand-purple hover:bg-brand-purple/95 flex items-center justify-center space-x-2 text-sm transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mt-10 p-4 rounded-xl bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-semibold max-w-md text-center animate-in fade-in zoom-in-95"
              >
                🎉 Invitation sent! Check your inbox to access your creator workspace shortly.
              </motion.div>
            )}

            {/* Micro details */}
            <div className="mt-8 flex flex-wrap justify-center items-center gap-6 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
              <div className="flex items-center space-x-1.5">
                <Heart className="h-3.5 w-3.5 text-brand-pink" />
                <span>No Credit Card Required</span>
              </div>
              <div className="h-3 w-px bg-white/10 hidden sm:block" />
              <div className="flex items-center space-x-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-blue" />
                <span>100% Private & Secure</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
