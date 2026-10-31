import React from 'react';

interface ClockLogoProps {
  className?: string;
  size?: number | string;
  color?: string;
  animated?: boolean;
  withBadge?: boolean;
}

/**
 * ClockLogo
 * Official App Icon for Overtime Claim Manager, faithfully matching the loading icon.
 * Features the signature minimalist black clock on a clean white squircle badge
 * with smooth animated sweeping clock hands.
 */
export const ClockLogo: React.FC<ClockLogoProps> = ({
  className = 'w-10 h-10',
  size,
  color = '#000000',
  animated = true,
  withBadge = true,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={size ? { width: size, height: size } : undefined}
      aria-label="Overtime Claim Manager App Icon"
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="clockLogoShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.12" />
          </filter>
        </defs>

        {withBadge && (
          /* Clean white rounded squircle badge matching loading screen design */
          <rect
            x="4"
            y="4"
            width="192"
            height="192"
            rx="54"
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth="3.5"
            filter="url(#clockLogoShadow)"
          />
        )}

        {/* Outer Circular Ring (Exact thickness and proportions matching user loading icon) */}
        <circle
          cx="100"
          cy="100"
          r="66"
          stroke={color}
          strokeWidth="19"
          fill="none"
        />

        {/* Center Pivot Junction */}
        <circle cx="100" cy="100" r="9.5" fill={color} />

        {/* Hour Hand (Starts at 135 deg / 4:30 position, progresses smoothly) */}
        <g
          style={{
            transformOrigin: '100px 100px',
            animation: animated ? 'clockHourSweep 24s linear infinite' : undefined,
          }}
        >
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="60"
            stroke={color}
            strokeWidth="19"
            strokeLinecap="round"
            transform="rotate(135 100 100)"
          />
        </g>

        {/* Minute Hand (Sweeping smoothly 360 deg every 2 seconds matching transition cycle) */}
        <g
          style={{
            transformOrigin: '100px 100px',
            animation: animated ? 'clockMinuteSweep 2s linear infinite' : undefined,
          }}
        >
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="46"
            stroke={color}
            strokeWidth="19"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
};
