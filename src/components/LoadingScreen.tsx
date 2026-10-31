import React from 'react';
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
  return (
    <div
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center select-none overflow-hidden transition-opacity duration-300 ease-in-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
    >
      {/* 50% transparent base backdrop blur */}
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-md" />

      {/* Animated pure white background spreading outward from center across whole screen */}
      <div className="absolute inset-0 bg-white animate-white-spread pointer-events-none" />

      {/* Center content on top of spreading white background */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center space-y-4 px-6 animate-scale-in">
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
          <p className="text-xs font-bold text-indigo-600">
            {message}
          </p>
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
