import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Lock,
  ArrowRight,
  AlertCircle,
  User,
  KeyRound,
  CheckCircle2,
  X,
  Mail,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  Clock,
  RefreshCw,
  ArrowLeft,
  Check,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatPfNumber } from '../utils/pfHelper';
import { ClockLogo } from './ClockLogo';
import { PageTransitionOverlay } from './PageTransitionOverlay';

type ResetModalStep = 'request' | 'otp' | 'new_password' | 'done';
type OtpCheckState = 'idle' | 'checking' | 'verified' | 'error';

const OTP_EXPIRY_SECONDS = 15 * 60;
const RESEND_COOLDOWN_SECONDS = 30;

function maskEmailAddress(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || '*'}*@${domain}`;
  return `${local.slice(0, 2)}${'•'.repeat(Math.min(6, Math.max(2, local.length - 2)))}${local.slice(-1)}@${domain}`;
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AuthScreen: React.FC = () => {
  const {
    loginWithGoogle,
    loginWithIdentifier,
    sendPasswordReset,
    verifyPasswordResetTokenOrCode,
    completePasswordResetWithMake,
    authError,
    clearAuthError,
  } = useAuth();

  // Sign In Form State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot / Reset Password Modal State (Strictly separated: Request -> OTP -> New Password -> Done)
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetModalStep>('request');
  const [forgotInput, setForgotInput] = useState('');
  const [resetSentToEmail, setResetSentToEmail] = useState('');
  const [resetUidParam, setResetUidParam] = useState('');

  // Step 2: Modern 6-box OTP State
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [verifiedOtpCode, setVerifiedOtpCode] = useState('');
  const [otpCheckState, setOtpCheckState] = useState<OtpCheckState>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const [otpSecondsRemaining, setOtpSecondsRemaining] = useState(OTP_EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const lastAutoCheckedCodeRef = useRef<string>('');
  const transitionTimeoutRef = useRef<number | null>(null);

  // Step 3: Modern New Password State
  const [verifiedAccountLabel, setVerifiedAccountLabel] = useState<string | null>(null);
  const [verifiedPfNumber, setVerifiedPfNumber] = useState<string>('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Loading & Feedback State
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [isCompletingReset, setIsCompletingReset] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [resetErrorMessage, setResetErrorMessage] = useState<string | null>(null);

  const activeError = authError || localError;
  const joinedOtp = otpDigits.join('');

  // Clear pending timeout on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Countdown timers while OTP panel is active
  useEffect(() => {
    if (!isForgotModalOpen || resetStep !== 'otp') return;
    const interval = window.setInterval(() => {
      setOtpSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isForgotModalOpen, resetStep]);

  // Focus first OTP box when entering OTP panel
  useEffect(() => {
    if (isForgotModalOpen && resetStep === 'otp') {
      const id = window.setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 120);
      return () => window.clearTimeout(id);
    }
  }, [isForgotModalOpen, resetStep]);

  const openForgotModal = () => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setForgotInput(identifier);
    setResetStep('request');
    setOtpDigits(['', '', '', '', '', '']);
    setVerifiedOtpCode('');
    setOtpCheckState('idle');
    setResetUidParam('');
    setResetSentToEmail('');
    setVerifiedAccountLabel(null);
    setVerifiedPfNumber('');
    setNewResetPassword('');
    setConfirmResetPassword('');
    setShowResetPassword(false);
    setResetSuccessMessage(null);
    setResetErrorMessage(null);
    setOtpSecondsRemaining(OTP_EXPIRY_SECONDS);
    setResendCooldown(0);
    lastAutoCheckedCodeRef.current = '';
    setIsForgotModalOpen(true);
  };

  const closeForgotModal = () => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setIsForgotModalOpen(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    clearAuthError();
    setIsSubmitting(true);

    try {
      await loginWithIdentifier(identifier.trim(), password);
    } catch (err: any) {
      console.error('Authentication error', err);
      setLocalError(err.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setLocalSuccess(null);
    clearAuthError();
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Google Sign In Error', err);
      if (!err.message?.includes('popup-closed-by-user')) {
        setLocalError(err.message || 'Google sign-in failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMessage(null);
    setResetSuccessMessage(null);
    setIsSendingReset(true);

    try {
      const cleanAccount = forgotInput.trim();
      const email = await sendPasswordReset(cleanAccount, { requestedBy: 'self' });
      setResetSentToEmail(email);
      setResetUidParam(cleanAccount);
      setOtpDigits(['', '', '', '', '', '']);
      setVerifiedOtpCode('');
      setOtpCheckState('idle');
      setOtpSecondsRemaining(OTP_EXPIRY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      lastAutoCheckedCodeRef.current = '';
      setNewResetPassword('');
      setConfirmResetPassword('');
      setResetStep('otp');
    } catch (err: any) {
      setResetErrorMessage(err.message || 'Failed to send verification code email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResendingOtp) return;
    setResetErrorMessage(null);
    setIsResendingOtp(true);

    try {
      const targetId = resetUidParam || forgotInput.trim() || resetSentToEmail;
      const email = await sendPasswordReset(targetId, { requestedBy: 'self' });
      setResetSentToEmail(email);
      setOtpDigits(['', '', '', '', '', '']);
      setVerifiedOtpCode('');
      setOtpCheckState('idle');
      setOtpSecondsRemaining(OTP_EXPIRY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      lastAutoCheckedCodeRef.current = '';
      window.setTimeout(() => otpInputRefs.current[0]?.focus(), 80);
    } catch (err: any) {
      setResetErrorMessage(err.message || 'Unable to resend verification code.');
    } finally {
      setIsResendingOtp(false);
    }
  };

  const runOtpVerification = async (codeToVerify: string) => {
    const cleanCode = codeToVerify.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setOtpCheckState('error');
      setShakeKey((k) => k + 1);
      setResetErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    if (otpSecondsRemaining <= 0) {
      setOtpCheckState('error');
      setShakeKey((k) => k + 1);
      setResetErrorMessage('This verification code has expired. Please tap "Resend Code".');
      return;
    }

    lastAutoCheckedCodeRef.current = cleanCode;
    setOtpCheckState('checking');
    setResetErrorMessage(null);

    try {
      const verifiedInfo = await verifyPasswordResetTokenOrCode({
        uidOrIdentifier: resetUidParam || forgotInput.trim() || resetSentToEmail,
        codeOrToken: cleanCode,
      });

      setVerifiedOtpCode(cleanCode);
      setVerifiedPfNumber(verifiedInfo.pfNumber || '');
      setVerifiedAccountLabel(
        `${verifiedInfo.name}${verifiedInfo.pfNumber ? ` (${verifiedInfo.pfNumber})` : ''}`
      );
      setOtpCheckState('verified');

      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = window.setTimeout(() => {
        setResetErrorMessage(null);
        setNewResetPassword('');
        setConfirmResetPassword('');
        setResetStep('new_password');
      }, 650);
    } catch (err: any) {
      setOtpCheckState('error');
      setShakeKey((k) => k + 1);
      setResetErrorMessage(
        err?.message || 'Invalid verification code. Please check your inbox and try again.'
      );
    }
  };

  // Auto-trigger live modern OTP check when all 6 digits are entered
  useEffect(() => {
    if (!isForgotModalOpen || resetStep !== 'otp') return;
    if (joinedOtp.length === 6 && otpCheckState !== 'checking' && otpCheckState !== 'verified') {
      if (lastAutoCheckedCodeRef.current !== joinedOtp) {
        runOtpVerification(joinedOtp);
      }
    }
  }, [joinedOtp, isForgotModalOpen, resetStep, otpCheckState]);

  const handleOtpDigitChange = (index: number, rawValue: string) => {
    if (otpCheckState === 'checking' || otpCheckState === 'verified') return;

    const cleaned = rawValue.replace(/\D/g, '');
    setResetErrorMessage(null);
    if (otpCheckState === 'error') {
      setOtpCheckState('idle');
    }

    if (!cleaned) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      lastAutoCheckedCodeRef.current = '';
      return;
    }

    // Handle multi-digit input (e.g. mobile SMS / OTP autofill into single box)
    if (cleaned.length > 1) {
      const next = [...otpDigits];
      const startIndex = cleaned.length >= 6 ? 0 : index;
      const chars = cleaned.slice(0, 6 - startIndex).split('');
      chars.forEach((char, offset) => {
        next[startIndex + offset] = char;
      });
      setOtpDigits(next);
      lastAutoCheckedCodeRef.current = '';
      const focusIdx = Math.min(5, startIndex + chars.length);
      otpInputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = cleaned;
    setOtpDigits(next);
    lastAutoCheckedCodeRef.current = '';

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (otpCheckState === 'checking' || otpCheckState === 'verified') return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      setResetErrorMessage(null);
      if (otpCheckState === 'error') setOtpCheckState('idle');
      lastAutoCheckedCodeRef.current = '';

      const next = [...otpDigits];
      if (next[index]) {
        next[index] = '';
        setOtpDigits(next);
      } else if (index > 0) {
        next[index - 1] = '';
        setOtpDigits(next);
        otpInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && joinedOtp.length === 6) {
      e.preventDefault();
      runOtpVerification(joinedOtp);
    }
  };

  const handleOtpPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (otpCheckState === 'checking' || otpCheckState === 'verified') return;

    const pastedDigits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pastedDigits) return;

    setResetErrorMessage(null);
    if (otpCheckState === 'error') setOtpCheckState('idle');
    lastAutoCheckedCodeRef.current = '';

    const startIndex = pastedDigits.length >= 6 ? 0 : index;
    const next = [...otpDigits];
    const slice = pastedDigits.slice(0, 6 - startIndex).split('');
    slice.forEach((char, offset) => {
      next[startIndex + offset] = char;
    });
    setOtpDigits(next);
    const focusIdx = Math.min(5, startIndex + slice.length - 1);
    otpInputRefs.current[focusIdx]?.focus();
  };

  const clearOtpBoxes = () => {
    setOtpDigits(['', '', '', '', '', '']);
    setOtpCheckState('idle');
    setResetErrorMessage(null);
    lastAutoCheckedCodeRef.current = '';
    otpInputRefs.current[0]?.focus();
  };

  // Password Strength & Validation checks for Step 3
  const passwordAnalysis = useMemo(() => {
    const clean = newResetPassword;
    const trimmed = clean.trim();
    const minLenMet = trimmed.length >= 6;
    const recommendedLen = trimmed.length >= 8;
    const hasUpper = /[A-Z]/.test(trimmed);
    const hasLower = /[a-z]/.test(trimmed);
    const hasNumber = /\d/.test(trimmed);
    const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);

    const pf = verifiedPfNumber.toUpperCase().trim();
    const pfDigits = pf.replace(/\D/g, '');
    const passUpper = trimmed.toUpperCase();
    const passDigits = trimmed.replace(/\D/g, '');
    const matchesPf =
      Boolean(trimmed) &&
      Boolean(
        (pf && passUpper === pf) ||
          (pf && formatPfNumber(pf).toUpperCase() === passUpper) ||
          (pfDigits.length >= 4 && passDigits === pfDigits)
      );

    const passwordsMatch =
      trimmed.length >= 6 && confirmResetPassword.trim() === trimmed;

    let score = 0;
    if (minLenMet) score += 1;
    if (recommendedLen) score += 1;
    if (hasUpper && hasLower) score += 1;
    if (hasNumber && (hasSymbol || recommendedLen)) score += 1;
    if (!trimmed || matchesPf) score = Math.min(score, 1);

    const level =
      !trimmed
        ? { label: 'Enter password', color: 'text-slate-400', barColor: 'bg-slate-200', score: 0 }
        : score <= 1 || matchesPf
        ? { label: matchesPf ? 'Same as PF Number' : 'Weak', color: 'text-rose-600', barColor: 'bg-rose-500', score: 1 }
        : score === 2
        ? { label: 'Fair', color: 'text-amber-600', barColor: 'bg-amber-500', score: 2 }
        : score === 3
        ? { label: 'Good', color: 'text-sky-600', barColor: 'bg-sky-500', score: 3 }
        : { label: 'Strong', color: 'text-emerald-600', barColor: 'bg-emerald-500', score: 4 };

    return {
      minLenMet,
      recommendedLen,
      hasVariety: (hasUpper || hasLower) && hasNumber,
      notPfNumber: !matchesPf,
      passwordsMatch,
      canSubmit: minLenMet && !matchesPf && passwordsMatch,
      level,
    };
  }, [newResetPassword, confirmResetPassword, verifiedPfNumber]);

  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMessage(null);

    if (!passwordAnalysis.minLenMet) {
      setResetErrorMessage('New password must be at least 6 characters long.');
      return;
    }
    if (!passwordAnalysis.notPfNumber) {
      setResetErrorMessage('Your new password cannot match your PF Number.');
      return;
    }
    if (!passwordAnalysis.passwordsMatch) {
      setResetErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsCompletingReset(true);
    try {
      const completed = await completePasswordResetWithMake({
        uidOrIdentifier: resetUidParam || forgotInput.trim() || resetSentToEmail,
        codeOrToken: verifiedOtpCode || joinedOtp,
        newPassword: newResetPassword.trim(),
      });

      const loginId = completed.pfNumber || completed.email;
      if (loginId) {
        setIdentifier(loginId);
      }
      setPassword('');
      setResetSuccessMessage(
        `Your password has been securely updated for ${completed.name}${
          completed.pfNumber ? ` (${completed.pfNumber})` : ''
        }. You can now sign in with your new private password.`
      );
      setResetStep('done');
    } catch (err: any) {
      setResetErrorMessage(err?.message || 'Unable to reset password.');
    } finally {
      setIsCompletingReset(false);
    }
  };

  const activeStepNumber =
    resetStep === 'request' ? 1 : resetStep === 'otp' ? 2 : resetStep === 'new_password' ? 3 : 4;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center px-4 py-6 sm:py-12">
      {/* App Brand Header */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="inline-flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center mb-3">
          <ClockLogo className="w-full h-full" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Overtime Claim Manager
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 mt-1">
          Official Corporate Timesheet &amp; Claim System
        </p>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-8 shadow-2xl border border-slate-100 relative">
        <div className="text-center mb-5">
          <h2 className="text-lg font-bold text-slate-900">Sign in to your account</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Access with your assigned PF Number or registered Google account
          </p>
        </div>

        {activeError && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-scale-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{activeError}</div>
          </div>
        )}

        {localSuccess && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 animate-scale-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{localSuccess}</div>
          </div>
        )}

        {/* 1-Click Sign in with Google */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs flex items-center justify-center gap-3 transition mb-4 cursor-pointer disabled:opacity-60"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center mb-4">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 absolute">
            Or with PF Number
          </span>
        </div>

        {/* SIGN IN FORM */}
        <form onSubmit={handleSignIn} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              PF Number (Username)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onBlur={() => {
                  if (identifier && !identifier.includes('@')) {
                    setIdentifier(formatPfNumber(identifier));
                  }
                }}
                placeholder="e.g. PF123456"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-slate-800 font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Your official PF Number assigned by the administrator. Default first password is your PF Number.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-slate-700">Password</label>
              <button
                type="button"
                onClick={openForgotModal}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-3 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
          >
            <span>{isSubmitting ? 'Verifying access...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Need an account? User registration is restricted to system administrators. Contact your branch manager or system administrator to create your employee profile.
          </p>
        </div>
      </div>

      {/* Modern Multi-Step OTP Password Recovery Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-slate-200/90 animate-scale-in overflow-hidden">
            {/* Dark Contrast Header */}
            <div className="bg-slate-900 px-5 pt-5 pb-4 text-white relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${
                      resetStep === 'done'
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                        : resetStep === 'new_password'
                        ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
                        : 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
                    }`}
                  >
                    {resetStep === 'otp' ? (
                      <ShieldCheck className="w-5 h-5" />
                    ) : resetStep === 'new_password' ? (
                      <Lock className="w-5 h-5" />
                    ) : resetStep === 'done' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <KeyRound className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-white">
                      {resetStep === 'request'
                        ? 'Account Recovery'
                        : resetStep === 'otp'
                        ? 'OTP Verification'
                        : resetStep === 'new_password'
                        ? 'Create New Password'
                        : 'Password Updated'}
                    </h3>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      {resetStep === 'request'
                        ? 'Receive a 6-digit security code via email'
                        : resetStep === 'otp'
                        ? 'Enter the 6-digit verification code from your inbox'
                        : resetStep === 'new_password'
                        ? 'Choose a strong private password for your account'
                        : 'Your account credentials are ready'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeForgotModal}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
                  aria-label="Close password reset modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 3-Step Visual Progress Stepper */}
              {resetStep !== 'done' && (
                <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center justify-between gap-2 text-[10px] font-semibold">
                  {[
                    { num: 1, label: 'Account' },
                    { num: 2, label: 'Verify OTP' },
                    { num: 3, label: 'New Password' },
                  ].map((step, idx) => {
                    const isCompleted = activeStepNumber > step.num;
                    const isActive = activeStepNumber === step.num;
                    return (
                      <React.Fragment key={step.num}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : isActive
                                ? 'bg-indigo-500 text-white ring-2 ring-indigo-300/50'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {isCompleted ? <Check className="w-3 h-3" /> : step.num}
                          </span>
                          <span
                            className={`truncate ${
                              isCompleted
                                ? 'text-emerald-300'
                                : isActive
                                ? 'text-white'
                                : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                        {idx < 2 && (
                          <div
                            className={`h-0.5 flex-1 rounded-full transition-colors ${
                              activeStepNumber > step.num ? 'bg-emerald-500' : 'bg-slate-700'
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6">
              {/* STEP 1: Request 6-digit OTP */}
              {resetStep === 'request' && (
                <form onSubmit={handleSendPasswordReset} className="space-y-4 text-xs animate-fade-in">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Enter your registered <strong>PF Number</strong> or <strong>Email</strong>. We will send a 6-digit one-time verification code directly to your inbox.
                  </p>

                  {resetErrorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{resetErrorMessage}</span>
                    </div>
                  )}

                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      PF Number or Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        autoFocus
                        value={forgotInput}
                        onChange={(e) => setForgotInput(e.target.value)}
                        placeholder="e.g. PF123456 or name@company.com"
                        className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-slate-800 font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeForgotModal}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingReset}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60 cursor-pointer shadow-sm"
                    >
                      {isSendingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isSendingReset ? 'Sending OTP...' : 'Send Verification Code'}</span>
                      {!isSendingReset && <ArrowRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2: Modern & Special OTP Entering + Live Checking Panel (NO password inputs) */}
              {resetStep === 'otp' && (
                <div className="space-y-4 text-xs animate-fade-in">
                  {/* Recipient & Countdown Strip */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Code sent to
                      </span>
                      <span className="text-xs font-bold text-slate-800 truncate block">
                        {maskEmailAddress(resetSentToEmail)}
                      </span>
                    </div>
                    <div
                      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono border ${
                        otpSecondsRemaining <= 0
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : otpSecondsRemaining <= 120
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>
                        {otpSecondsRemaining <= 0 ? 'Expired' : formatCountdown(otpSecondsRemaining)}
                      </span>
                    </div>
                  </div>

                  {/* 6-Digit Segmented OTP Input Boxes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="font-bold text-slate-700">
                        Enter 6-Digit Verification Code
                      </label>
                      {joinedOtp.length > 0 && otpCheckState !== 'checking' && otpCheckState !== 'verified' && (
                        <button
                          type="button"
                          onClick={clearOtpBoxes}
                          className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div
                      key={shakeKey}
                      className={`grid grid-cols-6 gap-2 sm:gap-2.5 ${
                        otpCheckState === 'error' ? 'animate-shake' : ''
                      }`}
                    >
                      {otpDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            otpInputRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={idx === 0 ? 6 : 1}
                          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                          aria-label={`OTP digit ${idx + 1}`}
                          disabled={otpCheckState === 'checking' || otpCheckState === 'verified'}
                          value={digit}
                          onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          onPaste={(e) => handleOtpPaste(idx, e)}
                          onFocus={(e) => e.target.select()}
                          className={`h-13 sm:h-14 w-full rounded-2xl border-2 text-center font-mono text-xl sm:text-2xl font-extrabold transition-all outline-none ${
                            otpCheckState === 'verified'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-500/15 scale-[1.02]'
                              : otpCheckState === 'error'
                              ? 'border-rose-400 bg-rose-50/70 text-rose-700 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/15'
                              : otpCheckState === 'checking'
                              ? 'border-indigo-400 bg-indigo-50/60 text-indigo-700 animate-pulse'
                              : digit
                              ? 'border-indigo-500 bg-indigo-50/30 text-slate-900 focus:ring-4 focus:ring-indigo-500/15'
                              : 'border-slate-200 bg-white text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 text-center">
                      Paste the 6 digits copied from your email — verification runs automatically
                    </p>
                  </div>

                  {/* Live OTP Checking Feedback Banner */}
                  {otpCheckState === 'checking' && (
                    <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-800 flex items-center justify-center gap-2 font-semibold animate-fade-in">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span>Checking 6-digit security code...</span>
                    </div>
                  )}

                  {otpCheckState === 'verified' && (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center gap-2 font-bold animate-scale-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Code Verified! Opening new password panel...</span>
                    </div>
                  )}

                  {otpCheckState === 'error' && resetErrorMessage && (
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2 animate-fade-in">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span className="font-medium leading-relaxed">{resetErrorMessage}</span>
                    </div>
                  )}

                  {/* Actions: Verify & Resend */}
                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      disabled={
                        joinedOtp.length !== 6 ||
                        otpCheckState === 'checking' ||
                        otpCheckState === 'verified' ||
                        otpSecondsRemaining <= 0
                      }
                      onClick={() => runOtpVerification(joinedOtp)}
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                    >
                      {otpCheckState === 'checking' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying Code...</span>
                        </>
                      ) : otpCheckState === 'verified' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Verified</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Verify Code</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setResetStep('request');
                          setResetErrorMessage(null);
                          setOtpCheckState('idle');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Change Account</span>
                      </button>

                      <button
                        type="button"
                        disabled={resendCooldown > 0 || isResendingOtp}
                        onClick={handleResendOtp}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 transition cursor-pointer disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isResendingOtp ? 'animate-spin' : ''}`} />
                        <span>
                          {isResendingOtp
                            ? 'Sending...'
                            : resendCooldown > 0
                            ? `Resend in ${resendCooldown}s`
                            : 'Resend Code'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Modern & Special New Password Entering Panel (shown ONLY after OTP verified) */}
              {resetStep === 'new_password' && (
                <form onSubmit={handleCompletePasswordReset} className="space-y-4 text-xs animate-fade-in">
                  {/* Verified Identity Banner */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                          OTP Verified
                        </span>
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {verifiedAccountLabel || maskEmailAddress(resetSentToEmail)}
                      </p>
                    </div>
                  </div>

                  {resetErrorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{resetErrorMessage}</span>
                    </div>
                  )}

                  {/* New Password Input */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        required
                        autoFocus
                        minLength={6}
                        value={newResetPassword}
                        onChange={(e) => setNewResetPassword(e.target.value)}
                        placeholder="Enter your new private password"
                        className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-10 text-slate-800 font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((prev) => !prev)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                      >
                        {showResetPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Live 4-Segment Strength Meter */}
                    <div className="mt-2.5 space-y-1.5">
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 2, 3, 4].map((seg) => (
                          <div
                            key={seg}
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              passwordAnalysis.level.score >= seg
                                ? passwordAnalysis.level.barColor
                                : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Password strength</span>
                        <span className={`font-bold ${passwordAnalysis.level.color}`}>
                          {passwordAnalysis.level.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Confirm New Password Input */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmResetPassword}
                        onChange={(e) => setConfirmResetPassword(e.target.value)}
                        placeholder="Re-enter your new password"
                        className={`w-full rounded-xl border py-2.5 pl-9 pr-9 text-slate-800 font-medium focus:ring-2 bg-white ${
                          confirmResetPassword && !passwordAnalysis.passwordsMatch
                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
                            : confirmResetPassword && passwordAnalysis.passwordsMatch
                            ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20'
                            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20'
                        }`}
                      />
                      {confirmResetPassword && passwordAnalysis.passwordsMatch && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute right-3 top-2.5" />
                      )}
                    </div>
                  </div>

                  {/* Live Requirements Checklist */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-[11px]">
                    <div
                      className={`flex items-center gap-2 font-medium ${
                        passwordAnalysis.minLenMet ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          passwordAnalysis.minLenMet ? 'text-emerald-600' : 'text-slate-300'
                        }`}
                      />
                      <span>At least 6 characters (8+ recommended)</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 font-medium ${
                        newResetPassword && passwordAnalysis.notPfNumber
                          ? 'text-emerald-700'
                          : !passwordAnalysis.notPfNumber
                          ? 'text-rose-600'
                          : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          newResetPassword && passwordAnalysis.notPfNumber
                            ? 'text-emerald-600'
                            : !passwordAnalysis.notPfNumber
                            ? 'text-rose-500'
                            : 'text-slate-300'
                        }`}
                      />
                      <span>Cannot be identical to your PF Number</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 font-medium ${
                        passwordAnalysis.passwordsMatch ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          passwordAnalysis.passwordsMatch ? 'text-emerald-600' : 'text-slate-300'
                        }`}
                      />
                      <span>Both password entries match</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeForgotModal}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCompletingReset || !passwordAnalysis.canSubmit}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {isCompletingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isCompletingReset ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 4: Completed */}
              {resetStep === 'done' && resetSuccessMessage && (
                <div className="py-4 text-center space-y-3 animate-scale-in">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-xs">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900">Password Updated!</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                    {resetSuccessMessage}
                  </p>
                  <button
                    type="button"
                    onClick={closeForgotModal}
                    className="mt-2 w-full py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer shadow-sm"
                  >
                    Return to Sign In
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Authentication In-Flight Transition */}
      <PageTransitionOverlay
        isVisible={isSubmitting}
        message="Authenticating..."
        subMessage="Verifying credentials & session..."
      />
    </div>
  );
};
