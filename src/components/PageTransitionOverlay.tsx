import React, { useEffect, useState } from 'react';

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
        <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-3xl bg-gradient-to-b from-slate-900 via-[#18163f] to-slate-900 border border-indigo-500/30 shadow-2xl shadow-indigo-950/60 p-4 ring-1 ring-white/15 overflow-hidden">
          {/* Subtle inner soft ambient light */}
          <div className="absolute inset-0 bg-radial from-indigo-500/15 via-transparent to-transparent pointer-events-none" />
          <img
            src="/infinite-clock.gif"
            alt="Overtime Claim Manager"
            className="relative z-10 w-full h-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.5)]"
          />
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
