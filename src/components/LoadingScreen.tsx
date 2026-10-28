import React from 'react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing Overtime Claim Manager...',
  subMessage = 'Connecting to database & loading profile...',
}) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-md text-white p-6 overflow-hidden">
      {/* Main card */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center space-y-4 animate-scale-in">
        {/* System GIF Logo */}
        <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center">
          <img
            src="/infinite-clock.gif"
            alt="Overtime Claim Manager"
            className="w-full h-full object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
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

