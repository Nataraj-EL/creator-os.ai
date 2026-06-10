"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

const pricingTiers = [
  {
    name: "Starter",
    priceMonthly: 2499,
    priceYearly: 1999,
    description: "Perfect for independent solo creators starting to automate their brand growth.",
    features: [
      "2 Active Brand Projects",
      "500 AI-Assisted Script & Post Drafts / mo",
      "1 Connected Social Channel",
      "Sync Video Outlines & Transcripts",
      "24/7 Standard Email Support",
    ],
    cta: "Start Free Trial",
    popular: false,
    color: "border-white/5",
  },
  {
    name: "Creator Pro",
    priceMonthly: 6499,
    priceYearly: 4999,
    description: "Designed for scaling digital channels running weekly publishing cycles.",
    features: [
      "10 Active Brand Projects",
      "2,500 AI-Assisted Script & Post Drafts / mo",
      "5 Connected Social Channels",
      "Deep Competitor & Topic Trend Analysis",
      "Automatic Title & Headline A/B Testing",
      "AI Trained on Your Unique Voice & Style",
      "Priority Instant Generation Speed",
    ],
    cta: "Launch Creator Pro",
    popular: true,
    color: "border-brand-purple/40 bg-gradient-to-t from-brand-purple/5 to-transparent",
  },
  {
    name: "Enterprise Network",
    priceMonthly: 19999,
    priceYearly: 15999,
    description: "Tailored for digital media companies managing multiple talent channels.",
    features: [
      "Unlimited Active Brand Projects",
      "Unlimited AI Content Generation",
      "Unlimited Connected Social Channels",
      "Private Dedicated Cloud Storage",
      "Team Collaborator Role Access Gates",
      "Dedicated 1-on-1 Growth Manager Support",
      "Enterprise-Grade Security & Performance",
    ],
    cta: "Contact Growth Sales",
    popular: false,
    color: "border-white/5",
  },
];

export default function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");

  return (
    <section className="relative py-28 bg-[#030303] overflow-hidden" id="pricing">
      {/* Background blur */}
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-pink/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-pink mb-3">
            Subscription Options
          </h2>
          <p className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-none">
            Scale-Based Pricing Plans
          </p>
          <p className="mt-4 text-zinc-400 text-lg">
            Start free and upgrade as your audience scaling requirements expand. Save 20% on yearly billing.
          </p>

          {/* Billing Switcher */}
          <div className="mt-10 flex items-center justify-center">
            <div className="relative flex p-1 rounded-xl bg-white/5 border border-white/5 backdrop-blur-md">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 relative ${
                  billingPeriod === "monthly" ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Monthly
                {billingPeriod === "monthly" && (
                  <motion.span
                    layoutId="pricingPeriod"
                    className="absolute inset-0 bg-white/5 border border-white/5 rounded-lg -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
              <button
                onClick={() => setBillingPeriod("yearly")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 relative ${
                  billingPeriod === "yearly" ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Yearly (Save 20%)
                {billingPeriod === "yearly" && (
                  <motion.span
                    layoutId="pricingPeriod"
                    className="absolute inset-0 bg-white/5 border border-white/5 rounded-lg -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 items-stretch pt-6">
          {pricingTiers.map((tier, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              whileHover={{
                y: -8,
                scale: 1.03,
                borderColor: tier.popular ? "rgba(139, 92, 246, 0.5)" : "rgba(255, 255, 255, 0.2)",
                boxShadow: tier.popular 
                  ? "0 25px 50px -12px rgba(139, 92, 246, 0.3)" 
                  : "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
                transition: { type: "spring", stiffness: 400, damping: 25 }
              }}
              className={`glass-card rounded-3xl border p-8 flex flex-col justify-between relative group ${tier.color}`}
            >
              {tier.popular && (
                <>
                  <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-purple to-transparent" />
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-purple text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full flex items-center space-x-1 shadow-md shadow-brand-purple/20">
                    <Sparkles className="h-3 w-3" />
                    <span>Highly Recommended</span>
                  </div>
                </>
              )}

              <div>
                <span className="text-sm font-bold tracking-wider text-zinc-400 uppercase">
                  {tier.name}
                </span>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold tracking-tight text-white">
                    ₹{(billingPeriod === "monthly" ? tier.priceMonthly : tier.priceYearly).toLocaleString("en-IN")}
                  </span>
                  <span className="ml-2 text-xs font-medium text-zinc-500">/ mo</span>
                </div>
                <p className="mt-4 text-xs text-zinc-400 leading-relaxed min-h-[48px]">
                  {tier.description}
                </p>

                <div className="h-px bg-white/5 my-6" />

                <ul className="space-y-4">
                  {tier.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start space-x-3 text-xs text-zinc-300">
                      <div className="mt-0.5 flex-shrink-0 text-brand-purple">
                        <Check className="h-4 w-4" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <button
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all duration-300 flex items-center justify-center space-x-2 cursor-pointer ${
                    tier.popular
                      ? "bg-brand-purple text-white hover:bg-brand-purple/95 shadow-xl shadow-brand-purple/15 glow-btn"
                      : "bg-white/5 text-zinc-300 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <span>{tier.cta}</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
