"use client";

import React, { useEffect, useState } from "react";

interface ClickEffect {
  id: number;
  x: number;
  y: number;
  color: "black" | "white";
}

export default function ClickBurstProvider({ children }: { children: React.ReactNode }) {
  const [effects, setEffects] = useState<ClickEffect[]>([]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Filter out typing inputs/controls to keep form typing clear
      const tag = target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
        return;
      }

      // Walk up the DOM tree to detect if the target is sitting inside a dark background
      let el: HTMLElement | null = target;
      let isDarkBackground = false;

      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const bgColor = style.backgroundColor;
        
        if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)") {
          const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (match) {
            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);
            
            const alphaMatch = bgColor.match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
            const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
            
            if (alpha > 0.1) {
              const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              if (luminance < 100) {
                isDarkBackground = true;
              }
              break;
            }
          }
        }
        el = el.parentElement;
      }

      const newEffect = {
        id: Date.now() + Math.random(),
        x: e.clientX,
        y: e.clientY,
        color: (isDarkBackground ? "white" : "black") as "black" | "white",
      };

      setEffects((prev) => [...prev, newEffect]);

      // Remove component after animation finishes (500ms)
      setTimeout(() => {
        setEffects((prev) => prev.filter((eff) => eff.id !== newEffect.id));
      }, 500);
    };

    window.addEventListener("click", handleClick, { capture: true });
    return () => {
      window.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  return (
    <>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[99999] overflow-hidden">
        {effects.map((eff) => (
          <div
            key={eff.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center"
            style={{ left: eff.x, top: eff.y }}
          >
            <span className={`absolute w-[2.5px] h-[10.5px] rounded-full animate-burst-1 ${eff.color === "white" ? "bg-white" : "bg-black"}`} />
            <span className={`absolute w-[2.5px] h-[10.5px] rounded-full animate-burst-2 ${eff.color === "white" ? "bg-white" : "bg-black"}`} />
            <span className={`absolute w-[2.5px] h-[10.5px] rounded-full animate-burst-3 ${eff.color === "white" ? "bg-white" : "bg-black"}`} />
            <span className={`absolute w-[2.5px] h-[10.5px] rounded-full animate-burst-4 ${eff.color === "white" ? "bg-white" : "bg-black"}`} />
            <span className={`absolute w-[2.5px] h-[10.5px] rounded-full animate-burst-5 ${eff.color === "white" ? "bg-white" : "bg-black"}`} />
          </div>
        ))}
      </div>
    </>
  );
}
