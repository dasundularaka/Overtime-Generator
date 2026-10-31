import React, { useEffect, useState } from 'react';
import { AnimatedClockIcon } from './AnimatedClockIcon';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
  isFadingOut?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing Overtime Claim Manager...',
  subMessage = 'Connecting to database & loading profile...',
  isFadingOut = false,
}) => {
  const [isFadedIn, setIsFadedIn] = useState(false);

  useEffect(() => {
    const animFrame = requestAnimationFrame(() => {
      setIsFadedIn(true);
    });
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const opacityClass = !isFadedIn || isFadingOut ? 'opacity-0' : 'opacity-100';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-md text-white p-6 overflow-hidden transition-opacity duration-400 ease-in-out ${opacityClass}`}
    >
      {/* Main card */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center space-y-4 animate-scale-in">
        {/* Suitable background container for icon only */}
        <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-3xl bg-white/95 border border-white/60 shadow-[0_16px_40px_rgba(0,0,0,0.5)] p-4 ring-2 ring-white/25 overflow-hidden backdrop-blur-md">
          <div className="absolute inset-0 bg-radial from-slate-100/60 via-transparent to-transparent pointer-events-none" />
          <AnimatedClockIcon className="relative z-10 w-16 h-16 sm:w-20 sm:h-20" color="#000000" />
        </div>

        {/* Text */}
        <div className="space-y-1.5">
          <h2 className="text-xl font-extrabold text-white tracking-tight drop-shadow">
            Overtime Claim Manager
          </h2>
          <p className="text-xs font-semibold text-indigo-200">
            {message}
          </p>
          {subMessage && (
            <p className="text-[11px] text-slate-300">
              {subMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
