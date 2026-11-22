import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatPfNumber } from '../utils/pfHelper';
import { ClockLogo } from './ClockLogo';
import { PageTransitionOverlay } from './PageTransitionOverlay';

type ResetModalStep = 'request' | 'verify' | 'done';

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

  // Forgot / Reset Password Modal State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetModalStep>('request');
  const [forgotInput, setForgotInput] = useState('');
  const [resetSentToEmail, setResetSentToEmail] = useState('');
  const [resetUidParam, setResetUidParam] = useState('');
  const [resetCodeOrToken, setResetCodeOrToken] = useState('');
  const [isFromEmailLink, setIsFromEmailLink] = useState(false);
  const [isVerifyingLink, setIsVerifyingLink] = useState(false);
  const [verifiedAccountLabel, setVerifiedAccountLabel] = useState<string | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isCompletingReset, setIsCompletingReset] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [resetErrorMessage, setResetErrorMessage] = useState<string | null>(null);

  const activeError = authError || localError;

  const clearResetUrlQuery = () => {
    if (typeof window !== 'undefined' && window.location.search.includes('resetToken=')) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  };

  // Detect 1-click Make password reset link parameters (?resetToken=...&uid=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken')?.trim();
    const uid = params.get('uid')?.trim() || '';
    if (!token) return;

    setIsForgotModalOpen(true);
    setResetStep('verify');
    setIsFromEmailLink(true);
    setResetCodeOrToken(token);
    setResetUidParam(uid);
    setResetErrorMessage(null);
    setResetSuccessMessage(null);
    setIsVerifyingLink(true);

    verifyPasswordResetTokenOrCode({ uidOrIdentifier: uid, codeOrToken: token })
      .then((info) => {
        setVerifiedAccountLabel(
          `${info.name}${info.pfNumber ? ` (${info.pfNumber})` : ''}`
        );
        setResetSentToEmail(info.email);
        if (info.pfNumber) {
          setForgotInput(info.pfNumber);
        } else if (info.email) {
          setForgotInput(info.email);
        }
      })
      .catch((err: any) => {
        setResetErrorMessage(
          err?.message || 'This reset link is invalid or has expired. Please request a new one.'
        );
      })
      .finally(() => {
        setIsVerifyingLink(false);
      });
  }, []);

  const openForgotModal = () => {
    setForgotInput(identifier);
    setResetStep('request');
    setIsFromEmailLink(false);
    setResetCodeOrToken('');
    setResetUidParam('');
    setResetSentToEmail('');
    setVerifiedAccountLabel(null);
    setNewResetPassword('');
    setConfirmResetPassword('');
    setResetSuccessMessage(null);
    setResetErrorMessage(null);
    setIsForgotModalOpen(true);
  };

  const closeForgotModal = () => {
    setIsForgotModalOpen(false);
    clearResetUrlQuery();
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
      const email = await sendPasswordReset(forgotInput.trim(), { requestedBy: 'self' });
      setResetSentToEmail(email);
      setResetUidParam(forgotInput.trim());
      setIsFromEmailLink(false);
      setResetCodeOrToken('');
      setNewResetPassword('');
      setConfirmResetPassword('');
      setResetStep('verify');
    } catch (err: any) {
      setResetErrorMessage(err.message || 'Failed to send password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMessage(null);

    if (newResetPassword.trim().length < 6) {
      setResetErrorMessage('New password must be at least 6 characters long.');
      return;
    }
    if (newResetPassword.trim() !== confirmResetPassword.trim()) {
      setResetErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsCompletingReset(true);
    try {
      const completed = await completePasswordResetWithMake({
        uidOrIdentifier: resetUidParam || forgotInput.trim(),
        codeOrToken: resetCodeOrToken.trim(),
        newPassword: newResetPassword.trim(),
      });

      const loginId = completed.pfNumber || completed.email;
      if (loginId) {
        setIdentifier(loginId);
      }
      setPassword('');
      clearResetUrlQuery();
      setResetSuccessMessage(
        `Your password has been updated for ${completed.name}${
          completed.pfNumber ? ` (${completed.pfNumber})` : ''
        }. You can now sign in with your new password.`
      );
      setResetStep('done');
    } catch (err: any) {
      setResetErrorMessage(err?.message || 'Unable to reset password.');
    } finally {
      setIsCompletingReset(false);
    }
  };

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
                onChange={e => setIdentifier(e.target.value)}
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
                onChange={e => setPassword(e.target.value)}
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

      {/* Forgot / Reset Password Modal (Make-powered 1-click link + 6-digit OTP) */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reset Your Password</h3>
                  <p className="text-[11px] text-slate-500">
                    {resetStep === 'request'
                      ? 'Automated Make Email Recovery'
                      : resetStep === 'verify'
                      ? 'Set a New Private Password'
                      : 'Recovery Complete'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeForgotModal}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                aria-label="Close password reset modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetStep === 'done' && resetSuccessMessage && (
              <div className="py-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">Password Updated!</h4>
                <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                  {resetSuccessMessage}
                </p>
                <button
                  type="button"
                  onClick={closeForgotModal}
                  className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            )}

            {resetStep === 'request' && (
              <form onSubmit={handleSendPasswordReset} className="mt-4 space-y-4 text-xs">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter your registered <strong>PF Number</strong> or <strong>Email</strong>. We will send a reset link and 6-digit verification code to your inbox via Make.
                </p>

                {resetErrorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{resetErrorMessage}</span>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    PF Number or Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={forgotInput}
                      onChange={e => setForgotInput(e.target.value)}
                      placeholder="e.g. PF123456 or name@company.com"
                      className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeForgotModal}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingReset}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60 cursor-pointer shadow-xs"
                  >
                    {isSendingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isSendingReset ? 'Sending via Make...' : 'Send Reset Email'}</span>
                  </button>
                </div>
              </form>
            )}

            {resetStep === 'verify' && (
              <form onSubmit={handleCompletePasswordReset} className="mt-4 space-y-3.5 text-xs">
                {isVerifyingLink ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-600">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span>Verifying password reset link...</span>
                  </div>
                ) : (
                  <>
                    {!resetErrorMessage && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          {isFromEmailLink ? (
                            <>
                              <span className="font-bold block">Reset Link Verified</span>
                              <span className="text-[11px] text-emerald-800">
                                Choosing a new password for{' '}
                                <strong>{verifiedAccountLabel || resetSentToEmail}</strong>.
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-bold block">Reset Email Sent via Make!</span>
                              <span className="text-[11px] text-emerald-800">
                                Enter the 6-digit code sent to{' '}
                                <strong>{resetSentToEmail}</strong> (or click the button in the email).
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {resetErrorMessage && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{resetErrorMessage}</span>
                      </div>
                    )}

                    {!isFromEmailLink && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          6-Digit Verification Code
                        </label>
                        <input
                          type="text"
                          required
                          inputMode="numeric"
                          value={resetCodeOrToken}
                          onChange={e => setResetCodeOrToken(e.target.value)}
                          placeholder="e.g. 482917"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 font-mono font-bold tracking-widest text-center text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type={showResetPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={newResetPassword}
                          onChange={e => setNewResetPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-9 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword(prev => !prev)}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showResetPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type={showResetPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={confirmResetPassword}
                          onChange={e => setConfirmResetPassword(e.target.value)}
                          placeholder="Re-enter your new password"
                          className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          clearResetUrlQuery();
                          setResetStep('request');
                          setIsFromEmailLink(false);
                          setResetErrorMessage(null);
                        }}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        Request new code
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={closeForgotModal}
                          className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isCompletingReset}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60 cursor-pointer shadow-xs"
                        >
                          {isCompletingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>{isCompletingReset ? 'Saving...' : 'Update Password'}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </form>
            )}
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
