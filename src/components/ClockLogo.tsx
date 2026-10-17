import React from 'react';

interface ClockLogoProps {
  className?: string;
  size?: number | string;
  showTicks?: boolean;
}

export const ClockLogo: React.FC<ClockLogoProps> = ({
  className = 'w-10 h-10',
  size,
  showTicks = true,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={size ? { width: size, height: size } : undefined}
      fill="none"
      aria-label="Overtime Clock Logo"
    >
      <defs>
        <linearGradient id="logoHourGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="logoMinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="logoMajorTick" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <style>{`
        @keyframes clockLogoHourSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes clockLogoMinSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .anim-hour-hand {
          transform-origin: 256px 256px;
          animation: clockLogoHourSpin 48s linear infinite;
        }
        .anim-min-hand {
          transform-origin: 256px 256px;
          animation: clockLogoMinSpin 12s linear infinite;
        }
      `}</style>

      {/* NO OUTLINE CIRCLE, NO BACKGROUND: Clean floating clock dial */}
      {showTicks && (
        <g opacity="0.95">
          {/* 12, 3, 6, 9 Cardinal Ticks */}
          {/* 12 o'clock */}
          <rect x="250" y="24" width="12" height="36" rx="6" fill="url(#logoMajorTick)" filter="url(#logoGlow)" />
          {/* 3 o'clock */}
          <rect x="452" y="250" width="36" height="12" rx="6" fill="url(#logoMajorTick)" filter="url(#logoGlow)" />
          {/* 6 o'clock */}
          <rect x="250" y="452" width="12" height="36" rx="6" fill="url(#logoMajorTick)" filter="url(#logoGlow)" />
          {/* 9 o'clock */}
          <rect x="24" y="250" width="36" height="12" rx="6" fill="url(#logoMajorTick)" filter="url(#logoGlow)" />

          {/* Secondary Hour Markers (1, 2, 4, 5, 7, 8, 10, 11) */}
          <circle cx="370" cy="62" r="7" fill="#94a3b8" />
          <circle cx="450" cy="142" r="7" fill="#94a3b8" />
          <circle cx="450" cy="370" r="7" fill="#94a3b8" />
          <circle cx="370" cy="450" r="7" fill="#94a3b8" />
          <circle cx="142" cy="450" r="7" fill="#94a3b8" />
          <circle cx="62" cy="370" r="7" fill="#94a3b8" />
          <circle cx="62" cy="142" r="7" fill="#94a3b8" />
          <circle cx="142" cy="62" r="7" fill="#94a3b8" />
        </g>
      )}

      {/* Hour Hand: Slower than minute hand, rotates 360 degrees continuously */}
      <g className="anim-hour-hand">
        {/* Counterbalance tail */}
        <rect x="250" y="256" width="12" height="40" rx="6" fill="#4338ca" />
        {/* Main Hour Arm */}
        <path d="M249 256 L251 132 L256 116 L261 132 L263 256 Z" fill="url(#logoHourGrad)" filter="url(#logoGlow)" />
        <circle cx="256" cy="150" r="4.5" fill="#ffffff" opacity="0.85" />
      </g>

      {/* Minute Hand: Rotates 360 degrees continuously, smooth & slow */}
      <g className="anim-min-hand">
        {/* Counterbalance tail */}
        <rect x="252" y="256" width="8" height="50" rx="4" fill="#1d4ed8" />
        {/* Main Minute Arm */}
        <path d="M252 256 L253 68 L256 48 L259 68 L260 256 Z" fill="url(#logoMinGrad)" filter="url(#logoGlow)" />
        <circle cx="256" cy="84" r="3.5" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Precision Multi-layered Center Hub */}
      <circle cx="256" cy="256" r="22" fill="#0f172a" stroke="#6366f1" strokeWidth="3" />
      <circle cx="256" cy="256" r="13" fill="#38bdf8" />
      <circle cx="256" cy="256" r="5" fill="#ffffff" />
    </svg>
  );
};
