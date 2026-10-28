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
  const [fadeState, setFadeState] = useState<'enter' | 'exit'>('enter');

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setFadeState('enter');
    } else {
      setFadeState('exit');
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-md transition-opacity duration-300 ease-in-out ${
        fadeState === 'enter' ? 'opacity-100' : 'opacity-0'
      }`}
      aria-live="polite"
      aria-busy={isVisible}
    >
      <div className="flex flex-col items-center justify-center space-y-4 p-6 text-center select-none animate-scale-in">
        {/* System GIF Logo */}
        <div className="relative flex items-center justify-center">
          <img
            src="/infinite-clock.gif"
            alt="Overtime Claim Manager"
            className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
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
