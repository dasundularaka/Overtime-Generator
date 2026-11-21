import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import {
  applyOtaUpdate,
  getOtaState,
  OtaState,
  subscribeOtaState,
} from '../services/otaUpdateService';

export const OTAUpdateBanner: React.FC = () => {
  const [otaState, setOtaState] = useState<OtaState>(getOtaState());
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    return subscribeOtaState(setOtaState);
  }, []);

  if (otaState.status === 'applying') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 md:bottom-5 right-4 z-[70] max-w-xs w-[calc(100vw-2rem)] sm:w-auto rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-2xl border border-slate-700/80 flex items-center gap-3 animate-fade-in"
      >
        <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center shrink-0">
          <RefreshCw className="w-4 h-4 text-indigo-300 animate-spin" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-white leading-tight">Updating Application...</p>
          <p className="text-[11px] text-slate-300 truncate mt-0.5">
            Applying latest release seamlessly
          </p>
        </div>
      </div>
    );
  }

  if (
    otaState.status === 'ready_with_unsaved' &&
    otaState.availableVersion &&
    dismissedVersion !== otaState.availableVersion
  ) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 md:bottom-5 right-4 z-[70] max-w-sm w-[calc(100vw-2rem)] rounded-2xl bg-white text-slate-900 p-4 shadow-2xl border border-indigo-200 flex flex-col gap-3 animate-fade-in"
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">New Update Ready</p>
              <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                {otaState.releaseNotes ||
                  'A new version was released. It will apply automatically once your draft is saved.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissedVersion(otaState.availableVersion)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer shrink-0"
            aria-label="Dismiss update notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDismissedVersion(otaState.availableVersion)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            Finish Editing First
          </button>
          <button
            type="button"
            onClick={() => applyOtaUpdate()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Apply Now</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};
