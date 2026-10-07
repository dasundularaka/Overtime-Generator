import React from 'react';
import {
  Upload,
  Move,
  Save,
  FileCheck,
  CheckCircle2,
  X,
  ArrowRight,
  Printer,
  Sparkles,
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onGoToDesigner: () => void;
  onGoToNewClaim: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  isAdmin = false,
  onGoToDesigner,
  onGoToNewClaim,
}) => {
  if (!isOpen) return null;

  const steps = [
    {
      num: 1,
      title: 'Upload Official Blank Form',
      desc: 'In the Template Designer, upload a scanned PNG/JPG or clean PDF copy of your company’s paper overtime claim form. (A high-resolution standard official template is also preloaded ready for immediate testing!)',
      icon: Upload,
      color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    },
    {
      num: 2,
      title: 'Configure & Calibrate Fields',
      desc: 'Drag fields directly over your form’s boxes or adjust precise millimeter (X, Y) coordinates. Set font size, bold style, alignment, and calibrate the 31-day table rows.',
      icon: Move,
      color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
    },
    {
      num: 3,
      title: 'Save & Test Print',
      desc: 'Click "Save Template" and use the "Test Print" button to verify your paper alignment. If your office printer shifts margins, enter millimeter offsets in Printer Calibration.',
      icon: Save,
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    },
    {
      num: 4,
      title: 'Create Your Overtime Claims',
      desc: 'Select an employee, pick the month, and type your daily overtime. The app calculates hours automatically and generates a 100% print-ready A4 PDF with your data placed on the form!',
      icon: FileCheck,
      color: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header background accent */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="text-center sm:text-left mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2 border border-indigo-100">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Welcome to Overtime Claim Manager</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            How It Works
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Replace manual handwriting on paper overtime sheets with digital accuracy and automated A4 PDF overlay.
          </p>
        </div>

        {/* 4 Steps Container */}
        <div className="space-y-3.5 overflow-y-auto pr-1">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="flex items-start gap-4 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 hover:bg-slate-50 transition"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${step.color} shadow-xs`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Step {step.num}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Printing Notice Reminder */}
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2.5">
          <Printer className="w-4 h-4 shrink-0 text-amber-700" />
          <span>
            <strong>Pro Tip:</strong> When printing generated claim PDFs, always select <strong>"Actual Size" / 100% scale</strong> in your printer dialog to prevent misalignment.
          </span>
        </div>

        {/* Footer CTAs */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          {isAdmin ? (
            <button
              onClick={() => {
                onClose();
                onGoToDesigner();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
            >
              <span>Open Template Designer</span>
            </button>
          ) : (
            <div className="text-xs text-slate-400">
              Assigned form template is pre-calibrated for your account.
            </div>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                onClose();
                onGoToNewClaim();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md transition"
            >
              <span>Start First Claim</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
