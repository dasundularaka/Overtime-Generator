import React from 'react';
import { Clock, ShieldCheck, Sparkles } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing Overtime Claim Manager...',
  subMessage = 'Connecting to database & loading profile...',
}) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-6 overflow-hidden">
      {/* Background ambient glowing orbs */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none animate-pulse delay-700" />

      {/* Main card */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center space-y-6">
        {/* Animated Icon Container */}
        <div className="relative">
          <div className="absolute -inset-3 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-3xl blur-md opacity-40 animate-pulse" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 shadow-2xl border border-indigo-400/30">
            <Clock className="w-10 h-10 text-white animate-spin-slow" />
          </div>

          {/* Mini badge */}
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white border-2 border-slate-900 shadow-sm">
            <Sparkles className="w-3 h-3" />
          </div>
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Overtime Claim Manager
          </h2>
          <p className="text-xs font-medium text-indigo-300">
            {message}
          </p>
          <p className="text-[11px] text-slate-400">
            {subMessage}
          </p>
        </div>

        {/* Modern Spinner / Progress Bar */}
        <div className="w-48 space-y-2 pt-2">
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-blue-400 to-indigo-500 rounded-full animate-progress" />
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <ShieldCheck className="w-3 h-3 text-indigo-400" />
            <span>Shift 8:00–4:45 &bull; Form 10756</span>
          </div>
        </div>
      </div>
    </div>
  );
};
