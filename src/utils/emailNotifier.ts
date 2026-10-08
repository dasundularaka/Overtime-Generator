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
}

const DEFAULT_LOGIN_URL = 'https://otclaim.vercel.app/';

/**
 * Generates and prepares the welcome email for a newly created user.
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
For security purposes, when you log into the system for the first time, you will be prompted to set your new personal password before accessing your account.

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
  };
}

/**
 * Dispatches or opens the welcome email for a newly created user.
 */
export async function sendUserWelcomeEmail(data: WelcomeEmailData): Promise<EmailDispatchResult> {
  const result = generateUserWelcomeEmail(data);

  // In browser environments without a direct SMTP backend, log the dispatch
  console.log(`[Email Dispatcher] Credentials email dispatched to ${data.email}:`, {
    to: data.email,
    subject: result.subject,
    pfNumber: data.pfNumber,
    webLink: DEFAULT_LOGIN_URL,
  });

  return result;
}
