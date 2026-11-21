import { sendWelcomeEmailViaMake } from '../services/makeEmailService';

export interface WelcomeEmailData {
  email: string;
  name: string;
  pfNumber: string;
  initialPassword?: string;
  loginUrl?: string;
  role?: string;
  branch?: string;
  department?: string;
  claimType?: string;
  senderName?: string;
  senderEmail?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  subject: string;
  body: string;
  mailtoUrl: string;
  message: string;
  dispatchedVia?: 'make_webhook' | 'client_mailto';
  messageId?: string;
  error?: string;
}

const DEFAULT_LOGIN_URL = 'https://otclaim.vercel.app/';

/**
 * Generates and prepares the welcome email content for a newly created user.
 * Includes Username (PF No), Password (same as PF No), and web link.
 */
export function generateUserWelcomeEmail(data: WelcomeEmailData): EmailDispatchResult {
  const cleanPf = data.pfNumber.trim().toUpperCase();
  const pass = data.initialPassword || cleanPf;
  const webLink =
    data.loginUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : DEFAULT_LOGIN_URL);
  const recipient = data.email.trim();

  const subject = `OT Claim - Your Login Credentials [${cleanPf}]`;

  const body = `Dear ${data.name || 'User'},

Welcome to OT Claim - Overtime Claim Management System.

Your user account has been successfully created by the System Administrator. You can now access the system using your PF Number credentials:

• Username (PF No): ${cleanPf}
• Password: ${pass}
• Web Link: ${webLink}

First-Time Login Security Notice:
For security purposes, when you log into the system for the first time, you will be prompted to set your new personal password before accessing your account dashboard.

If you have any questions or require assistance, please contact your system administrator.

Best regards,
OT Claim
Overtime Claim Management Team`;

  const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  return {
    success: true,
    subject,
    body,
    mailtoUrl,
    message: `Credentials email prepared for ${recipient}`,
    dispatchedVia: 'client_mailto',
  };
}

/**
 * Dispatches the welcome email for a newly created user through Make webhook automation
 * (no Gmail login required), falling back to a mailto draft only if disabled or unreachable.
 */
export async function sendUserWelcomeEmail(
  data: WelcomeEmailData,
  autoDispatch = true
): Promise<EmailDispatchResult> {
  const result = generateUserWelcomeEmail(data);

  if (autoDispatch) {
    try {
      const makeResult = await sendWelcomeEmailViaMake({
        to: data.email,
        name: data.name,
        pfNumber: data.pfNumber,
        initialPassword: data.initialPassword,
        loginUrl: data.loginUrl,
        role: data.role,
        branch: data.branch,
        department: data.department,
        claimType: data.claimType,
        senderName: data.senderName,
        senderEmail: data.senderEmail,
      });

      if (makeResult.success) {
        return {
          ...result,
          dispatchedVia: 'make_webhook',
          messageId: makeResult.messageId,
          message: `Welcome credentials email automatically dispatched to ${data.email} via Make!`,
        };
      }

      return {
        ...result,
        dispatchedVia: 'client_mailto',
        error: makeResult.error || 'Make webhook dispatch failed.',
        message: `Make auto-dispatch failed (${makeResult.error || 'network error'}). Mailto draft ready.`,
      };
    } catch (err: any) {
      console.warn('Make webhook dispatch attempt encountered error, falling back:', err);
      return {
        ...result,
        dispatchedVia: 'client_mailto',
        error: err?.message || 'Make webhook dispatch failed',
        message: `Make auto-dispatch unavailable (${err?.message || 'network error'}). Mailto ready.`,
      };
    }
  }

  return result;
}
