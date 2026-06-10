"use client";

import { motion } from "framer-motion";
import { Flame, Award, Users, TrendingUp } from "lucide-react";

const stats = [
  { value: "1.2B+", label: "Monthly Views Automated", icon: TrendingUp, color: "text-brand-purple" },
  { value: "450M+", label: "Aggregate Subscriber Reach", icon: Users, color: "text-brand-pink" },
  { value: "82%", label: "Average Efficiency Increase", icon: Flame, color: "text-brand-blue" },
  { value: "180+", label: "Enterprise Channels Scaled", icon: Award, color: "text-brand-emerald" },
];

export default function SocialProof() {
  return (
    <section className="relative py-20 bg-[#030303] border-y border-white/5 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-brand-purple/5 to-brand-blue/5 blur-[80px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Key Metrics / Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="glass-card rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-colors duration-300 flex flex-col items-center text-center group"
            >
              <div className={`p-3 rounded-xl bg-white/5 border border-white/5 group-hover:border-white/10 mb-4 transition-all duration-300 group-hover:scale-105`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <span className="text-4xl font-extrabold tracking-tight text-white mb-2">
                {stat.value}
              </span>
              <span className="text-sm text-zinc-400 font-medium">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
