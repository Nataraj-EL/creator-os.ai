"use client";

export default function Footer() {
  return (
    <footer className="relative bg-[#030303] border-t border-white/5 py-8 overflow-hidden">
      {/* Background glow overlay */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[100px] bg-brand-purple/5 blur-[80px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex items-center justify-center text-xs text-zinc-500 font-mono tracking-wider uppercase">
          &copy; 2026 NATARAJ EL. ALL RIGHTS RESERVED.
        </div>
      </div>
    </footer>
  );
}
