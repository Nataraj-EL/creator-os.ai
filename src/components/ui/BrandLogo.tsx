import React from "react";
import Logo from "./Logo";

interface BrandLogoProps {
  size?: number;
  showBg?: boolean;
  className?: string;
  textSize?: string;
  textClassName?: string;
}

export default function BrandLogo({
  size = 36,
  showBg = true,
  className = "",
  textSize = "text-xl",
  textClassName = "",
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 group ${className}`}>
      <Logo
        size={size}
        showBg={showBg}
        className="shadow-lg shadow-brand-purple/20 group-hover:scale-105 transition-transform duration-200"
      />
      <span className={`${textSize} font-bold tracking-tight text-foreground transition-all duration-200 ${textClassName}`}>
        CreatorOS<span className="text-brand-purple">.AI</span>
      </span>
    </div>
  );
}
