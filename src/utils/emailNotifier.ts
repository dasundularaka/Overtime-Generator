import {
  sendWelcomeEmailViaGmail,
  hasGoogleWorkspaceToken,
  ensureGoogleAccessToken,
} from '../services/googleWorkspaceService';

export interface WelcomeEmailData {
  email: string;
  name: string;
  pfNumber: string;
  initialPassword?: string;
  loginUrl?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  subject: string;
  body: string;
  mailtoUrl: string;
  message: string;
  dispatchedVia?: 'gmail_api' | 'client_mailto';
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
  const webLink = data.loginUrl || DEFAULT_LOGIN_URL;
  const recipient = data.email.trim();

  const subject = `Your Overtime Claim System Login Credentials [${cleanPf}]`;

  const body = `Dear ${data.name || 'User'},

Welcome to the Overtime Claim Management System.

Your user account has been successfully created by the System Administrator. You can now access the system using your PF Number credentials:

• Username (PF No): ${cleanPf}
• Password: ${pass}
• Web Link: ${webLink}

First-Time Login Security Notice:
For security purposes, when you log into the system for the first time, you will be prompted to set your new personal password before accessing your account dashboard.

If you have any questions or require assistance, please contact your system administrator.

Best regards,
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
 * Dispatches the welcome email for a newly created user.
 * Automatically attempts to dispatch via Gmail API if Google Workspace is connected.
 */
export async function sendUserWelcomeEmail(
  data: WelcomeEmailData,
  forceGmail = false
): Promise<EmailDispatchResult> {
  const result = generateUserWelcomeEmail(data);

  // If forceGmail or Google token is present, dispatch automatically via Gmail API
  if (forceGmail || hasGoogleWorkspaceToken()) {
    try {
      if (forceGmail && !hasGoogleWorkspaceToken()) {
        await ensureGoogleAccessToken();
      }

      const gmailResult = await sendWelcomeEmailViaGmail({
        to: data.email,
        name: data.name,
        pfNumber: data.pfNumber,
        initialPassword: data.initialPassword,
        loginUrl: data.loginUrl,
      });

      if (gmailResult.success) {
        return {
          ...result,
          dispatchedVia: 'gmail_api',
          messageId: gmailResult.messageId,
          message: `Welcome credentials email automatically dispatched to ${data.email} via Gmail!`,
        };
      }
    } catch (err: any) {
      console.warn('Gmail API dispatch attempt encountered error, falling back:', err);
      return {
        ...result,
        dispatchedVia: 'client_mailto',
        error: err.message || 'Gmail dispatch failed',
        message: `Gmail auto-dispatch unavailable (${err.message || 'auth required'}). Mailto ready.`,
      };
    }
  }

  return result;
}
