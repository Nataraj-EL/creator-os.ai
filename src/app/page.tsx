import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import SocialProof from "@/components/landing/SocialProof";
import Problem from "@/components/landing/Problem";
import Superpowers from "@/components/landing/Superpowers";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-[#030303] text-foreground selection:bg-brand-purple/35 selection:text-white">
      {/* Navigation Bar */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-grow">
        {/* Hero Section */}
        <Hero />

        {/* Social Proof Stats & Logo Marquee */}
        <SocialProof />

        {/* Problem comparison Section */}
        <Problem />

        {/* Feature Bento Grid (AI Superpowers) */}
        <Superpowers />

        {/* Scalable Pricing Tiers */}
        <Pricing />

        {/* Accordion FAQs */}
        <FAQ />

        {/* Glow CTA Card with email request form */}
        <CTA />
      </main>

      {/* Footer Navigation & Compliance */}
      <Footer />
    </div>
  );
}
