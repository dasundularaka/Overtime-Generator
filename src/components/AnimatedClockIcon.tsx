import React from 'react';

interface AnimatedClockIconProps {
  className?: string;
  size?: number | string;
  color?: string;
  showGifFallback?: boolean;
}

/**
 * AnimatedClockIcon
 * Faithful vector animation of the minimalist clock icon provided by the user.
 * Features a circular outer rim and smoothly sweeping clock hands (2-second cycle matching transition duration).
 */
export const AnimatedClockIcon: React.FC<AnimatedClockIconProps> = ({
  className = 'w-16 h-16 sm:w-20 sm:h-20',
  color = '#000000',
}) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full overflow-visible select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Circular Ring (Exact thickness and proportions matching user icon) */}
        <circle
          cx="100"
          cy="100"
          r="76"
          stroke={color}
          strokeWidth="22"
          fill="none"
        />

        {/* Center Pivot Junction */}
        <circle cx="100" cy="100" r="11" fill={color} />

        {/* Hour Hand (Starts at 135 deg / 4:30 position, progresses smoothly) */}
        <g
          style={{
            transformOrigin: '100px 100px',
            animation: 'clockHourSweep 24s linear infinite',
          }}
        >
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="54"
            stroke={color}
            strokeWidth="22"
            strokeLinecap="round"
            transform="rotate(135 100 100)"
          />
        </g>

        {/* Minute Hand (Sweeping smoothly 360 deg every 2 seconds matching the exact 2s transition cycle) */}
        <g
          style={{
            transformOrigin: '100px 100px',
            animation: 'clockMinuteSweep 2s linear infinite',
          }}
        >
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="38"
            stroke={color}
            strokeWidth="22"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
};
