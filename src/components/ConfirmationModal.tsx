import React from 'react';
import { AlertTriangle, Trash2, CheckCircle2, X, HelpCircle, Loader2 } from 'lucide-react';

export type ConfirmationVariant = 'danger' | 'warning' | 'info';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
  isLoading?: boolean;
  details?: { label: string; value: string }[];
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
  details,
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: Trash2,
          iconBg: 'bg-rose-100 text-rose-600 border-rose-200',
          btnBg: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20 shadow-lg',
          border: 'border-rose-100',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          iconBg: 'bg-amber-100 text-amber-700 border-amber-200',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20 shadow-lg',
          border: 'border-amber-100',
        };
      case 'info':
      default:
        return {
          icon: HelpCircle,
          iconBg: 'bg-indigo-100 text-indigo-700 border-indigo-200',
          btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20 shadow-lg',
          border: 'border-indigo-100',
        };
    }
  };

  const { icon: Icon, iconBg, btnBg, border } = getVariantStyles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200/80 animate-scale-in">
        {/* Close cross button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon + Title */}
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${iconBg}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 pr-4">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {/* Optional Context Details Card */}
        {details && details.length > 0 && (
          <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-3.5 space-y-1.5 text-xs">
            {details.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">{item.label}</span>
                <span className="font-semibold text-slate-800 font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition ${btnBg}`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
