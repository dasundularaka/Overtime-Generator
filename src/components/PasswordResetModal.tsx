import React, { useState } from 'react';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  ArrowRight,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { recordAuditLog } from '../utils/auditLogger';
import { formatPfNumber } from '../utils/pfHelper';

interface PasswordResetModalProps {
  isOpen: boolean;
  onPasswordChanged: () => void;
  onClose?: () => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  onPasswordChanged,
  onClose,
}) => {
  const { userProfile, updateUserPassword, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isMandatory = Boolean(
    userProfile?.mustChangePassword ||
    userProfile?.isFirstLogin ||
    userProfile?.passwordMatchesPf
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPass = newPassword.trim();
    const cleanConfirm = confirmPassword.trim();

    if (cleanPass.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (cleanPass !== cleanConfirm) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    // Reject using the same PF number or default credentials as password
    const pf = (userProfile?.employeeNumber || userProfile?.pfNumber || '').toUpperCase().trim();
    const pfDigits = pf.replace(/\D/g, '');
    const cleanPassUpper = cleanPass.toUpperCase();
    const passDigits = cleanPass.replace(/\D/g, '');
    const formattedPf = pf ? formatPfNumber(pf) : '';

    const isSameAsPf =
      (pf && cleanPassUpper === pf) ||
      (formattedPf && cleanPassUpper === formattedPf.toUpperCase()) ||
      (pfDigits && cleanPassUpper === pfDigits) ||
      (pfDigits && cleanPassUpper === `PF${pfDigits}`) ||
      (pfDigits.length >= 4 && passDigits === pfDigits) ||
      (userProfile?.initialPassword && cleanPassUpper === userProfile.initialPassword.toUpperCase());

    if (isSameAsPf) {
      setError('Your new password cannot be the same as your PF Number or default password. Please choose a secure private password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUserPassword(cleanPass);

      await recordAuditLog({
        action: 'USER_PASSWORD_CHANGE',
        actionLabel: 'Updated Account Password to Private Password',
        targetType: 'user',
        targetId: userProfile?.id,
        targetDescription: `${userProfile?.name} (${userProfile?.employeeNumber || userProfile?.pfNumber})`,
        beforeState: {
          mustChangePassword: userProfile?.mustChangePassword,
          passwordMatchesPf: userProfile?.passwordMatchesPf,
          isFirstLogin: userProfile?.isFirstLogin,
        },
        afterState: {
          mustChangePassword: false,
          passwordMatchesPf: false,
          isFirstLogin: false,
          passwordUpdated: true,
        },
      });

      setSuccess(true);
      setTimeout(() => {
        onPasswordChanged();
      }, 1000);
    } catch (err: any) {
      console.error('Failed to update password', err);
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in">
        {/* Optional Close Button (Only when not mandatory) */}
        {!isMandatory && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header Icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-600 shadow-lg text-white mb-4">
          <KeyRound className="w-7 h-7" />
        </div>

        {/* Title */}
        <div className="text-center mb-5">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Security Verification: Set New Password
          </h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            {userProfile?.passwordMatchesPf || userProfile?.isFirstLogin
              ? 'Your account is currently using your PF Number as the default password. You must establish a secure private password before accessing the dashboard.'
              : 'A mandatory password change is required for your account. Please set a new password.'}
          </p>
        </div>

        {/* Mandatory PF Number Password Detected Alert */}
        {(userProfile?.passwordMatchesPf || userProfile?.isFirstLogin) && (
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2.5 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-950 block">Initial PF Number Password Detected</span>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Initial password matched your PF Number (<strong>{userProfile?.employeeNumber || userProfile?.pfNumber}</strong>). For corporate compliance and data security, you cannot proceed to the dashboard until you create a private password.
              </p>
            </div>
          </div>
        )}

        {/* User Particulars Badge */}
        <div className="mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
              PF Number (Username)
            </span>
            <span className="font-bold text-slate-800 font-mono">
              {userProfile?.employeeNumber || userProfile?.pfNumber || 'PF Number'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
              Staff Member
            </span>
            <span className="font-semibold text-slate-700">
              {userProfile?.name || 'Staff Member'}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Password Updated Successfully!</h3>
            <p className="text-xs text-slate-500">
              Redirecting you to your Overtime Claim dashboard...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* New Password */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-10 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Confirm New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-10 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <span>Save New Password &amp; Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => logout()}
                className="text-[11px] text-slate-400 hover:text-slate-600 font-medium transition cursor-pointer"
              >
                Sign in with a different account
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
