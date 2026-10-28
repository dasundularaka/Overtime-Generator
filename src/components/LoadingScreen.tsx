import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing Overtime Claim Manager...',
  subMessage = 'Connecting to database & loading profile...',
}) => {
  const [isFadedIn, setIsFadedIn] = useState(false);

  useEffect(() => {
    const animFrame = requestAnimationFrame(() => {
      setIsFadedIn(true);
    });
    return () => cancelAnimationFrame(animFrame);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-md text-white p-6 overflow-hidden transition-opacity duration-400 ease-in-out ${
        isFadedIn ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Main card */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center space-y-4 animate-scale-in">
        {/* Suitable background container for icon only */}
        <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-3xl bg-gradient-to-b from-slate-900 via-[#18163f] to-slate-900 border border-indigo-500/30 shadow-2xl shadow-indigo-950/60 p-4 ring-1 ring-white/15 overflow-hidden">
          <div className="absolute inset-0 bg-radial from-indigo-500/15 via-transparent to-transparent pointer-events-none" />
          <img
            src="/infinite-clock.gif"
            alt="Overtime Claim Manager"
            className="relative z-10 w-full h-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.5)]"
          />
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
