import React, { useEffect, useState } from 'react';
import { AnimatedClockIcon } from './AnimatedClockIcon';

interface PageTransitionOverlayProps {
  isVisible: boolean;
  message?: string;
}

export const PageTransitionOverlay: React.FC<PageTransitionOverlayProps> = ({
  isVisible,
  message,
}) => {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isFadedIn, setIsFadedIn] = useState(false);

  useEffect(() => {
    let fadeOutTimer: NodeJS.Timeout;
    let animFrame: number;

    if (isVisible) {
      setShouldRender(true);
      // Ensure the element is mounted with opacity-0 first, then trigger fade-in transition
      animFrame = requestAnimationFrame(() => {
        setIsFadedIn(true);
      });
    } else {
      // Trigger smooth fade-out transition
      setIsFadedIn(false);
      fadeOutTimer = setTimeout(() => {
        setShouldRender(false);
      }, 400); // 400ms fade-out transition duration
    }

    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(fadeOutTimer);
    };
  }, [isVisible]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-md transition-opacity duration-400 ease-in-out select-none ${
        isFadedIn ? 'opacity-100' : 'opacity-0'
      }`}
      aria-live="polite"
      aria-busy={isVisible}
    >
      <div className="flex flex-col items-center justify-center space-y-4 p-6 text-center animate-scale-in">
        {/* Suitable background container for icon only */}
        <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-3xl bg-white/95 border border-white/60 shadow-[0_16px_40px_rgba(0,0,0,0.5)] p-4 ring-2 ring-white/25 overflow-hidden backdrop-blur-md">
          {/* Subtle inner soft ambient light */}
          <div className="absolute inset-0 bg-radial from-slate-100/60 via-transparent to-transparent pointer-events-none" />
          <AnimatedClockIcon className="relative z-10 w-16 h-16 sm:w-20 sm:h-20" color="#000000" />
        </div>

        {/* Optional Label / Message */}
        {message && (
          <p className="text-xs font-bold text-white tracking-wider uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
            {message}
          </p>
        )}
      </div>
    </div>
  );
};
