"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, HelpCircle } from "lucide-react";

type FAQSection = "general" | "features" | "pricing" | "account";

const faqs: Record<FAQSection, { question: string; answer: string }[]> = {
  general: [
    {
      question: "What is CreatorOS AI?",
      answer: "CreatorOS AI is an all-in-one assistant platform designed to help digital creators grow their channels. It assists you in writing engaging video scripts, auto-replying to community comments, testing video titles, and tracking your subscriber goals.",
    },
    {
      question: "Which platforms does CreatorOS support?",
      answer: "We support YouTube, TikTok, Instagram, X (Twitter), LinkedIn, and Spotify Podcasts. You can connect your channels to manage your content and check analytics all in one place.",
    },
  ],
  features: [
    {
      question: "How does the Script Generator work?",
      answer: "Simply enter your video topic, select a tone (such as educational or high hype), and choose your target platform format. The AI scripting assistant will instantly draft engaging hooks and scene outlines tailored to your audience.",
    },
    {
      question: "What is the Automated Comment Guard?",
      answer: "It is a smart filter that monitors your incoming comments. It helps flag spam, promotional bots, or toxic remarks, allowing you to approve them in a review queue or filter them out automatically.",
    },
    {
      question: "Can I teach the AI to write in my unique voice?",
      answer: "Yes! Under the Growth Advisor tab, you can save your writing styles, preferred keywords, and specific guidelines (e.g., 'never use exclamation points'). The AI script writer automatically adapts to match your personal voice.",
    },
  ],
  pricing: [
    {
      question: "Is there a free trial available?",
      answer: "Yes, you can sign up for CreatorOS and start utilizing your workspace features completely free. You can upgrade to a paid plan as you add more channels and require more monthly drafts.",
    },
    {
      question: "Can I change or cancel my plan at any time?",
      answer: "Absolutely. You can switch between monthly and yearly billing or cancel your subscription directly from your workspace settings page at any point.",
    },
    {
      question: "Do you offer discounts for yearly billing?",
      answer: "Yes, selecting our yearly billing cycle saves you 20% compared to paying month-to-month.",
    },
  ],
  account: [
    {
      question: "How do I link my social media channels?",
      answer: "Once logged in, go to the Workspaces tab or Overview dashboard, click 'Link Accounts', and authorize your social profiles. Our mock platform integration allows you to instantly connect and test features.",
    },
    {
      question: "Is my account data private and secure?",
      answer: "Yes, all your scripts, workspace guidelines, and analytics metrics are fully encrypted and private to your workspace. We never share your data or use it to train public systems.",
    },
  ],
};

export default function FAQ() {
  const [activeSection, setActiveSection] = useState<FAQSection>("general");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const currentFaqs = faqs[activeSection];

  return (
    <section className="relative py-28 bg-[#030303] overflow-hidden" id="faq">
      {/* Background visual element */}
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-brand-blue/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-blue mb-3">
            Frequent Questions
          </h2>
          <p className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-none">
            FAQs
          </p>
          <p className="mt-4 text-zinc-400 text-lg">
            Find answers to common questions about setting up, pricing, and key features.
          </p>
        </div>

        {/* Section Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {(["general", "features", "pricing", "account"] as FAQSection[]).map((section) => (
            <button
              key={section}
              onClick={() => {
                setActiveSection(section);
                setOpenIndex(null); // Reset accordion when switching sections
              }}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer border ${
                activeSection === section
                  ? "bg-brand-purple border-brand-purple text-white shadow-lg shadow-brand-purple/20"
                  : "bg-white/5 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
              }`}
            >
              {section}
            </button>
          ))}
        </div>

        {/* FAQ List */}
        <div className="space-y-4 min-h-[250px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {currentFaqs.map((faq, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <div
                    key={idx}
                    className="glass-card rounded-2xl border border-white/5 overflow-hidden transition-all duration-300 hover:border-white/10"
                  >
                    <button
                      onClick={() => toggleFAQ(idx)}
                      className="w-full flex items-center justify-between p-6 text-left focus:outline-none cursor-pointer"
                    >
                      <span className="flex items-center space-x-4">
                        <HelpCircle className="h-5 w-5 text-brand-purple flex-shrink-0" />
                        <span className="text-sm sm:text-base font-bold text-white tracking-tight">
                          {faq.question}
                        </span>
                      </span>
                      <div className="ml-4 flex-shrink-0 p-1.5 rounded-lg bg-white/5 border border-white/5 text-zinc-400">
                        {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                          <div className="px-6 pb-6 pt-2 pl-14 text-xs sm:text-sm text-zinc-400 leading-relaxed border-t border-white/[0.03]">
                            {faq.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
