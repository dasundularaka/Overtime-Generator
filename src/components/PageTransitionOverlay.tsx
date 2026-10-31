import React, { useEffect, useState } from 'react';
import { AnimatedClockIcon } from './AnimatedClockIcon';

interface PageTransitionOverlayProps {
  isVisible: boolean;
  message?: string;
  subMessage?: string;
}

export const PageTransitionOverlay: React.FC<PageTransitionOverlayProps> = ({
  isVisible,
  message = 'Loading Page...',
  subMessage,
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
      }, 300); // 300ms fade-out transition duration
    }

    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(fadeOutTimer);
    };
  }, [isVisible]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center select-none overflow-hidden transition-opacity duration-300 ease-in-out ${
        isFadedIn ? 'opacity-100' : 'opacity-0'
      }`}
      aria-live="polite"
      aria-busy={isVisible}
    >
      {/* 50% transparent base backdrop blur */}
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-md" />

      {/* Animated pure white background spreading outward from center across whole screen */}
      <div className="absolute inset-0 bg-white animate-white-spread pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center justify-center space-y-4 p-6 text-center animate-scale-in max-w-sm w-full">
        {/* Logo container starting at the center */}
        <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-3xl bg-white border border-slate-200/80 shadow-2xl shadow-slate-300/60 p-4 ring-2 ring-slate-100 overflow-hidden">
          <div className="absolute inset-0 bg-radial from-slate-50 via-transparent to-transparent pointer-events-none" />
          <AnimatedClockIcon className="relative z-10 w-16 h-16 sm:w-20 sm:h-20" color="#000000" />
        </div>

        {/* Branded Loading Typography */}
        <div className="space-y-1.5 animate-fade-in">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight drop-shadow-2xs">
            Overtime Claim Manager
          </h2>
          {message && (
            <p className="text-xs font-bold text-indigo-600">
              {message}
            </p>
          )}
          {subMessage && (
            <p className="text-[11px] text-slate-500 font-medium">
              {subMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
