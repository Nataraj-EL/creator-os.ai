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
    let lastTriggerTime = 0;
    let lastX = 0;
    let lastY = 0;

    const handlePointerOrClick = (e: MouseEvent | PointerEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;
      let target: HTMLElement | null = null;

      if ("touches" in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        target = e.touches[0].target as HTMLElement | null;
      } else if ("clientX" in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
        target = (e as MouseEvent).target as HTMLElement | null;
      }

      if (!target || (clientX === 0 && clientY === 0)) return;

      // Ignore rapid duplicate events (e.g. touchstart followed by pointerdown/click at same spot)
      const now = Date.now();
      if (now - lastTriggerTime < 100 && Math.hypot(clientX - lastX, clientY - lastY) < 20) {
        return;
      }
      lastTriggerTime = now;
      lastX = clientX;
      lastY = clientY;

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

      const newEffect: ClickEffect = {
        id: Date.now() + Math.random(),
        x: clientX,
        y: clientY,
        color: isDarkBackground ? "white" : "black",
      };

      setEffects((prev) => [...prev, newEffect]);

      // Remove component after animation finishes (500ms)
      setTimeout(() => {
        setEffects((prev) => prev.filter((eff) => eff.id !== newEffect.id));
      }, 500);
    };

    window.addEventListener("pointerdown", handlePointerOrClick as EventListener, { capture: true });
    window.addEventListener("click", handlePointerOrClick as EventListener, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerOrClick as EventListener, { capture: true });
      window.removeEventListener("click", handlePointerOrClick as EventListener, { capture: true });
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
