"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Menu, X, ArrowRight } from "lucide-react";
import Logo from "@/components/ui/Logo";

const navLinks = [
  { name: "Home", href: "#" },
  { name: "Features", href: "#features" },
  { name: "Pricing", href: "#pricing" },
  { name: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "border-b border-border bg-[#030303]/80 backdrop-blur-md py-4"
            : "bg-transparent py-6"
        }`}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <a href="#" className="flex items-center space-x-2.5 group">
              <Logo size={36} showBg={true} className="shadow-lg shadow-brand-purple/20 group-hover:scale-105 transition-transform duration-200" />
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent group-hover:to-white transition-all duration-200">
                CreatorOS<span className="text-brand-purple">.AI</span>
              </span>
            </a>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              {navLinks.map((link, index) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="relative px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <span className="relative z-10">{link.name}</span>
                  {hoveredIndex === index && (
                    <motion.span
                      className="absolute inset-0 rounded-lg bg-white/5 border border-white/[0.03]"
                      layoutId="navHover"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </a>
              ))}
            </nav>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center space-x-4">
              <a
                href="/login"
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200"
              >
                Sign In
              </a>
              <a
                href="/register"
                className="glow-btn px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple/95 flex items-center space-x-2"
              >
                <span>Start Building</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {/* Mobile Menu Toggle */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-zinc-400 hover:text-white rounded-lg focus:outline-none"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-[#030303]/98 backdrop-blur-lg pt-24 px-6 md:hidden flex flex-col justify-between pb-10"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex flex-col space-y-6">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-semibold text-zinc-300 hover:text-white transition-colors py-2 border-b border-white/5"
                >
                  {link.name}
                </a>
              ))}
            </div>

            <div className="flex flex-col space-y-4">
              <a
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-3 text-lg font-medium text-zinc-400 hover:text-white border border-white/10 rounded-xl"
              >
                Sign In
              </a>
              <a
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-3 text-lg font-semibold text-white bg-brand-purple rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-brand-purple/35"
              >
                <span>Start Building</span>
                <ArrowRight className="h-5 w-5" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
