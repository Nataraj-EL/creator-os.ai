import React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  showBg?: boolean;
}

export default function Logo({ size = 36, showBg = true, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a1461c" /> {/* Rust / Burnt Sienna */}
          <stop offset="100%" stopColor="#dd6b20" /> {/* Terracotta Orange */}
        </linearGradient>
      </defs>

      {/* Outer Background Circle - warm sand theme matched */}
      {showBg && (
        <circle cx="50" cy="50" r="50" fill="#faf8f4" stroke="#dbd3c5" strokeWidth="3" />
      )}

      {/* 'C' Shaped Outer Arc */}
      <path
        d="M 73.33 26.67 A 33 33 0 1 0 73.33 73.33"
        stroke="url(#logoGradient)"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />

      {/* Dot on the Right */}
      <circle cx="85" cy="50" r="6.5" fill="url(#logoGradient)" />

      {/* Center Arrow - dark soil color */}
      <path
        d="M 40 60 L 58 42"
        stroke="#261e1a"
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 48 42 H 58 V 52"
        stroke="#261e1a"
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
