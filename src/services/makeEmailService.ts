import { NotificationPriority } from '../types';

export const DEFAULT_MAKE_WEBHOOK_URL =
  'https://hook.eu1.make.com/ssy98jpmms61noog6yyn4dt0k3y8mgtr';

export type MakeEmailEventType =
  | 'welcome_credentials'
  | 'notification_broadcast'
  | 'password_reset_otp'
  | 'password_reset_link'
  | 'password_reset_credentials'
  | 'test_email';

export interface MakeWebhookDispatchResult {
  success: boolean;
  messageId?: string;
  status?: number;
  responseText?: string;
  webhookHost?: string;
  error?: string;
}

export interface MakeWelcomeEmailPayload {
  to: string;
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

export interface MakeNotificationEmailPayload {
  to: string;
  recipientName?: string;
  notificationId?: string;
  heading: string;
  body: string;
  priority: NotificationPriority;
  imageUrl?: string;
  senderRole?: string;
  senderRoleLabel?: string;
  portalUrl?: string;
}

export interface MakePasswordResetEmailPayload {
  to: string;
  name: string;
  pfNumber: string;
  newPassword: string;
  loginUrl?: string;
  resetMode?: 'pf_default' | 'custom';
  senderName?: string;
  senderEmail?: string;
}

export interface MakePasswordResetLinkPayload {
  to: string;
  name: string;
  pfNumber?: string;
  branch?: string;
  resetCode: string;
  resetUrl?: string;
  expiresInMinutes?: number;
  requestedBy?: 'self' | 'admin';
  senderName?: string;
  senderEmail?: string;
}

export interface MakeTestEmailPayload {
  to: string;
  recipientName?: string;
  senderName?: string;
  senderEmail?: string;
  templateMode?: 'standard' | 'password_reset';
}

// In-memory lock to avoid duplicate welcome email dispatches when creating users interactively
const inFlightWelcomeDispatchIds = new Set<string>();
const completedWelcomeDispatchIds = new Set<string>();

export function claimWelcomeDispatchLock(userId: string): boolean {
  if (!userId) return true;
  if (inFlightWelcomeDispatchIds.has(userId) || completedWelcomeDispatchIds.has(userId)) {
    return false;
  }
  inFlightWelcomeDispatchIds.add(userId);
  return true;
}

export function releaseWelcomeDispatchLock(userId: string, succeeded: boolean): void {
  if (!userId) return;
  inFlightWelcomeDispatchIds.delete(userId);
  if (succeeded) {
    completedWelcomeDispatchIds.add(userId);
  }
}

export function hasWelcomeDispatchClaimed(userId: string): boolean {
  if (!userId) return false;
  return inFlightWelcomeDispatchIds.has(userId) || completedWelcomeDispatchIds.has(userId);
}

/**
 * Resolves and validates the HTTPS Make.com webhook endpoint.
 */
export function getMakeWebhookUrl(): string {
  const configured =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAKE_WEBHOOK_URL
      ? String(import.meta.env.VITE_MAKE_WEBHOOK_URL).trim()
      : '';
  const candidate = configured || DEFAULT_MAKE_WEBHOOK_URL;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') {
      throw new Error('Make webhook URL must use HTTPS.');
    }
    return parsed.toString();
  } catch {
    return DEFAULT_MAKE_WEBHOOK_URL;
  }
}

export function getMakeWebhookDisplayInfo(): {
  configured: boolean;
  host: string;
  maskedUrl: string;
} {
  const raw = getMakeWebhookUrl();
  try {
    const parsed = new URL(raw);
    const tail = parsed.pathname.slice(-5);
    return {
      configured: true,
      host: parsed.host,
      maskedUrl: `${parsed.origin}/•••••${tail}`,
    };
  } catch {
    return {
      configured: true,
      host: 'hook.eu1.make.com',
      maskedUrl: 'https://hook.eu1.make.com/•••••8mgtr',
    };
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHttpUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function resolveDefaultAppUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://otclaim.vercel.app/';
}

function formatTextParagraphsHtml(text: string): string {
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return '';
  const paragraphs = normalized.split(/\n{2,}/);
  return paragraphs
    .map(
      (para, idx) =>
        `<p style="margin:${idx === paragraphs.length - 1 ? '0' : '0 0 12px 0'};line-height:1.6;color:#1e293b;">${escapeHtml(
          para
        ).replace(/\n/g, '<br />')}</p>`
    )
    .join('');
}

function buildBrandedEmailShell(params: {
  eyebrow: string;
  accentHex: string;
  badgeText?: string;
  badgeBgHex?: string;
  badgeTextHex?: string;
  title: string;
  bodyHtml: string;
  footerNote?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const safeCtaUrl = sanitizeHttpUrl(params.ctaUrl);
  return `<div style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="height:5px;background-color:${params.accentHex};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:24px 28px 16px 28px;border-bottom:1px solid #f1f5f9;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
              ${escapeHtml(params.eyebrow)}
            </td>
            ${
              params.badgeText
                ? `<td align="right">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background-color:${
                      params.badgeBgHex || '#eef2ff'
                    };color:${params.badgeTextHex || '#3730a3'};">
                      ${escapeHtml(params.badgeText)}
                    </span>
                  </td>`
                : ''
            }
          </tr>
        </table>
        <h1 style="margin:10px 0 0 0;font-size:20px;line-height:1.3;font-weight:700;color:#0f172a;">
          ${escapeHtml(params.title)}
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 28px;font-size:14px;line-height:1.65;color:#334155;">
        ${params.bodyHtml}
        ${
          safeCtaUrl && params.ctaLabel
            ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
                <tr>
                  <td style="border-radius:10px;background-color:${params.accentHex};">
                    <a href="${escapeHtml(safeCtaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 20px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;">
                      ${escapeHtml(params.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;line-height:1.5;color:#64748b;">
        ${escapeHtml(
          params.footerNote || 'Automated system notification delivered via OT Claim Management Portal.'
        )}
      </td>
    </tr>
  </table>
</div>`;
}

/**
 * Low-level POST dispatcher to the Make.com webhook URL.
 * Supports Make's default HTTP 200 "Accepted" text response as well as JSON responses.
 */
export async function postToMakeWebhook(
  payload: Record<string, unknown>,
  timeoutMs = 15000
): Promise<MakeWebhookDispatchResult> {
  const webhookUrl = getMakeWebhookUrl();
  const parsedUrl = new URL(webhookUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = (await response.text()).trim();
    let parsedJson: Record<string, unknown> | null = null;
    if (responseText.startsWith('{') || responseText.startsWith('[')) {
      try {
        const candidate = JSON.parse(responseText);
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          parsedJson = candidate as Record<string, unknown>;
        }
      } catch {
        // Non-JSON body like "Accepted" is expected from Make default webhooks
      }
    }

    if (!response.ok) {
      const serverErr =
        (parsedJson?.error as string) ||
        (parsedJson?.message as string) ||
        responseText ||
        `HTTP ${response.status}`;
      return {
        success: false,
        status: response.status,
        responseText,
        webhookHost: parsedUrl.host,
        error: `Make webhook rejected request (${response.status}): ${serverErr}`,
      };
    }

    const headerRequestId =
      response.headers.get('x-request-id') || response.headers.get('x-make-execution-id') || '';
    const messageId =
      (parsedJson?.messageId as string) ||
      (parsedJson?.id as string) ||
      headerRequestId ||
      `make_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return {
      success: true,
      status: response.status,
      messageId,
      responseText: responseText || 'Accepted',
      webhookHost: parsedUrl.host,
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      success: false,
      webhookHost: parsedUrl.host,
      error: isAbort
        ? 'Make webhook request timed out. Please verify your Make scenario is active.'
        : err?.message || 'Network error while contacting Make webhook.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Dispatches a new user welcome credentials email through Make webhook automation.
 */
export async function sendWelcomeEmailViaMake(
  params: MakeWelcomeEmailPayload
): Promise<MakeWebhookDispatchResult> {
  const recipientEmail = (params.to || '').trim().toLowerCase();
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { success: false, error: 'Valid recipient email address is required.' };
  }

  const cleanPf = (params.pfNumber || '').trim().toUpperCase();
  const initialPassword = params.initialPassword || cleanPf || 'PF1000';
  const loginUrl = sanitizeHttpUrl(params.loginUrl) || resolveDefaultAppUrl();
  const recipientName = (params.name || 'User').trim();
  const subject = `OT Claim - Your Login Credentials [${cleanPf || recipientName}]`;

  const textBody = `Dear ${recipientName},

Welcome to OT Claim - Overtime Claim Management System.

Your user account has been successfully created by the System Administrator. You can now access the system using your PF Number credentials:

• Username (PF No): ${cleanPf}
• Initial Password: ${initialPassword}
• Web Portal: ${loginUrl}

First-Time Login Security Notice:
For security purposes, when you log into the system for the first time, you will be prompted to set your new personal password before accessing your account dashboard.

If you have any questions or require assistance, please contact your system administrator.

Best regards,
OT Claim
Overtime Claim Management Team`;

  const htmlBody = buildBrandedEmailShell({
    eyebrow: 'OT Claim Management System',
    accentHex: '#4f46e5',
    badgeText: 'Account Provisioned',
    badgeBgHex: '#eef2ff',
    badgeTextHex: '#3730a3',
    title: 'Your OT Claim Login Credentials',
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Dear <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 16px 0;">Welcome to the <strong>OT Claim Management System</strong>. Your staff account has been created and you can sign in using the credentials below:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:0 0 16px 0;">
        <tr>
          <td style="padding:14px 18px 8px 18px;border-bottom:1px solid #e2e8f0;">
            <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Username (PF No)</div>
            <div style="margin-top:3px;font-size:15px;font-weight:700;color:#0f172a;font-family:monospace;">${escapeHtml(cleanPf)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;">
            <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Temporary Password</div>
            <div style="margin-top:3px;font-size:15px;font-weight:700;color:#0f172a;font-family:monospace;">${escapeHtml(initialPassword)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 18px 14px 18px;">
            <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Portal URL</div>
            <div style="margin-top:3px;font-size:13px;"><a href="${escapeHtml(loginUrl)}" style="color:#4f46e5;font-weight:600;text-decoration:none;">${escapeHtml(loginUrl)}</a></div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
        <tr>
          <td style="padding:12px 14px;font-size:12px;line-height:1.5;color:#92400e;">
            <strong>First-Time Login Security Notice:</strong> When signing in for the first time, you will be prompted to set a new personal password before accessing your dashboard.
          </td>
        </tr>
      </table>
    `,
    ctaLabel: 'Open OT Claim Portal',
    ctaUrl: loginUrl,
    footerNote: 'Automated account provisioning notification sent via Make email automation.',
  });

  return postToMakeWebhook({
    event: 'welcome_credentials' satisfies MakeEmailEventType,
    source: 'OT Claim System',
    timestamp: new Date().toISOString(),
    to: recipientEmail,
    recipientEmail,
    recipientName,
    subject,
    text: textBody,
    body: textBody,
    html: htmlBody,
    pfNumber: cleanPf,
    username: cleanPf,
    initialPassword,
    loginUrl,
    role: params.role || 'user',
    branch: params.branch || '',
    department: params.department || '',
    claimType: params.claimType || 'OT',
    senderName: params.senderName || 'System Administrator',
    senderEmail: params.senderEmail || '',
  });
}

/**
 * Dispatches a broadcast notification email to a single recipient via Make webhook automation.
 */
export async function sendNotificationEmailViaMake(
  params: MakeNotificationEmailPayload
): Promise<MakeWebhookDispatchResult> {
  const recipientEmail = (params.to || '').trim().toLowerCase();
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { success: false, error: 'Valid recipient email address is required.' };
  }

  const priorityConfig =
    params.priority === 'high'
      ? {
          label: 'High Priority',
          shortLabel: 'High',
          accentHex: '#dc2626',
          badgeBgHex: '#fee2e2',
          badgeTextHex: '#991b1b',
        }
      : params.priority === 'medium'
      ? {
          label: 'Medium Priority',
          shortLabel: 'Medium',
          accentHex: '#d97706',
          badgeBgHex: '#fef3c7',
          badgeTextHex: '#92400e',
        }
      : {
          label: 'Low Priority',
          shortLabel: 'Low',
          accentHex: '#059669',
          badgeBgHex: '#d1fae5',
          badgeTextHex: '#065f46',
        };

  const portalUrl = sanitizeHttpUrl(params.portalUrl) || resolveDefaultAppUrl();
  const safeImageUrl = sanitizeHttpUrl(params.imageUrl);
  const recipientName = (params.recipientName || 'Team Member').trim();
  const normalizedSenderRole = (params.senderRole || '').trim().toLowerCase();
  const isSuperAdminRole =
    normalizedSenderRole === 'super_admin' ||
    normalizedSenderRole === 'superadmin' ||
    normalizedSenderRole === 'super admin';
  const senderRoleLabel =
    (params.senderRoleLabel || '').trim() || (isSuperAdminRole ? 'Super Admin' : 'Branch Admin');
  const subject = `[${priorityConfig.label}] ${params.heading}`;

  const textBody = `Dear ${recipientName},

You have received a new ${priorityConfig.label} notification from ${senderRoleLabel}.

Heading: ${params.heading}

${params.body}
${safeImageUrl ? `\nAttachment Image: ${safeImageUrl}` : ''}

View inside OT Claim Portal: ${portalUrl}

Best regards,
OT Claim Notification System`;

  const htmlBody = buildBrandedEmailShell({
    eyebrow: 'OT Claim System Notification',
    accentHex: priorityConfig.accentHex,
    badgeText: priorityConfig.label,
    badgeBgHex: priorityConfig.badgeBgHex,
    badgeTextHex: priorityConfig.badgeTextHex,
    title: params.heading,
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Dear <strong>${escapeHtml(recipientName)}</strong>,</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;background-color:#f8fafc;border-left:4px solid ${priorityConfig.accentHex};border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;font-size:14px;line-height:1.6;color:#1e293b;">
            ${formatTextParagraphsHtml(params.body)}
          </td>
        </tr>
      </table>
      ${
        safeImageUrl
          ? `<div style="margin:0 0 16px 0;">
              <img src="${escapeHtml(safeImageUrl)}" alt="Notification attachment" style="max-width:100%;height:auto;border-radius:10px;border:1px solid #e2e8f0;display:block;" />
            </div>`
          : ''
      }
      <p style="margin:0;font-size:12px;color:#64748b;">
        Sent by <strong>${escapeHtml(senderRoleLabel)}</strong>
      </p>
    `,
    ctaLabel: 'Open Notification Center',
    ctaUrl: portalUrl,
    footerNote: 'Sent automatically via OT Claim Notification System.',
  });

  return postToMakeWebhook({
    event: 'notification_broadcast' satisfies MakeEmailEventType,
    source: 'OT Claim System',
    timestamp: new Date().toISOString(),
    to: recipientEmail,
    recipientEmail,
    recipientName,
    subject,
    text: textBody,
    body: textBody,
    html: htmlBody,
    notificationId: params.notificationId || '',
    heading: params.heading,
    message: params.body,
    priority: params.priority,
    priorityLabel: priorityConfig.shortLabel,
    imageUrl: safeImageUrl || '',
    hasEmbeddedImage: Boolean(!safeImageUrl && params.imageUrl),
    senderRole: isSuperAdminRole ? 'super_admin' : 'admin',
    senderRoleLabel,
    portalUrl,
  });
}

/**
 * Modern HTML wrapper for security & password recovery emails.
 * Uses dark slate/indigo contrast header and email-safe inline table styling.
 */
function buildModernSecurityEmailHtml(params: {
  badgeText: string;
  badgeBgHex?: string;
  badgeTextHex?: string;
  accentHex?: string;
  title: string;
  subtitle: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const safeCtaUrl = sanitizeHttpUrl(params.ctaUrl);
  const accent = params.accentHex || '#4f46e5';

  return `<div style="margin:0;padding:28px 12px;background-color:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
    <tr>
      <td style="padding:28px 32px 24px 32px;background-color:#0f172a;border-bottom:4px solid ${accent};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
              OT CLAIM &middot; ACCOUNT SECURITY
            </td>
            <td align="right">
              <span style="display:inline-block;padding:4px 11px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background-color:${
                params.badgeBgHex || '#312e81'
              };color:${params.badgeTextHex || '#e0e7ff'};">
                ${escapeHtml(params.badgeText)}
              </span>
            </td>
          </tr>
        </table>
        <h1 style="margin:14px 0 6px 0;font-size:22px;line-height:1.25;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">
          ${escapeHtml(params.title)}
        </h1>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#cbd5e1;">
          ${escapeHtml(params.subtitle)}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;font-size:14px;line-height:1.65;color:#334155;">
        ${params.bodyHtml}
        ${
          safeCtaUrl && params.ctaLabel
            ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius:12px;background-color:${accent};">
                          <a href="${escapeHtml(safeCtaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                            ${escapeHtml(params.ctaLabel)} &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td style="padding:18px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b;">
        ${escapeHtml(
          params.footerNote || 'Automated security email from OT Claim Management System via Make.'
        )}
      </td>
    </tr>
  </table>
</div>`;
}

/**
 * Dispatches a modern self-service or admin-triggered 6-digit OTP Password Reset email via Make.
 * Includes a selectable "Copy Code" button instead of any reset link or "Reset Password Now" button.
 */
export async function sendPasswordResetLinkViaMake(
  params: MakePasswordResetLinkPayload
): Promise<MakeWebhookDispatchResult> {
  const recipientEmail = (params.to || '').trim().toLowerCase();
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { success: false, error: 'Valid recipient email address is required.' };
  }

  const recipientName = (params.name || 'Team Member').trim();
  const cleanPf = (params.pfNumber || '').trim().toUpperCase();
  const branch = (params.branch || '').trim();
  const resetCode = String(params.resetCode || '').replace(/\D/g, '').slice(0, 6);
  const codeDigits = resetCode.split('');
  const expiresInMinutes = params.expiresInMinutes ?? 15;
  const requestedAtText = new Date().toLocaleString();
  const isAdminTriggered = params.requestedBy === 'admin';
  const subject = `OT Claim - Password Verification Code${cleanPf ? ` [${cleanPf}]` : ''}`;

  const textBody = `Hello ${recipientName},

${
  isAdminTriggered
    ? 'An administrator has initiated a password reset for your OT Claim Management System account.'
    : 'We received a request to reset the password for your OT Claim Management System account.'
}

Verification Code: ${resetCode}
Expires In: ${expiresInMinutes} minutes
${cleanPf ? `PF Number: ${cleanPf}\n` : ''}
How to reset your password:
1. Copy the 6-digit verification code above: ${resetCode}
2. Enter the code in the OTP Verification panel on the OT Claim sign-in screen.
3. Once your code is verified, enter and confirm your new personal password.

Security Notice:
If you did not request a password reset, you can safely ignore this email. Your existing password remains secure and unchanged.

Best regards,
OT Claim Security Team`;

  const digitBoxesHtml =
    codeDigits.length === 6
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:12px auto 0 auto;">
          <tr>
            ${codeDigits
              .map(
                (digit, idx) =>
                  `<td style="padding:0 ${idx === 5 ? '0' : '5px'} 0 0;">
                    <div style="width:38px;height:46px;line-height:46px;text-align:center;background-color:#ffffff;border:1.5px solid #c7d2fe;border-radius:10px;font-size:22px;font-weight:800;color:#0f172a;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">
                      ${escapeHtml(digit)}
                    </div>
                  </td>`
              )
              .join('')}
          </tr>
        </table>`
      : '';

  const htmlBody = buildModernSecurityEmailHtml({
    badgeText: isAdminTriggered ? 'Admin Initiated' : 'One-Time Verification',
    badgeBgHex: '#312e81',
    badgeTextHex: '#e0e7ff',
    accentHex: '#4f46e5',
    title: 'Your Password Verification Code',
    subtitle: `Enter this 6-digit OTP on the recovery screen (valid for ${expiresInMinutes} minutes)`,
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 20px 0;">${
        isAdminTriggered
          ? 'An administrator initiated a password reset for your <strong>OT Claim Management System</strong> account. Use the 6-digit verification code below on the OTP verification panel to unlock your new password form.'
          : 'We received a request to reset your <strong>OT Claim Management System</strong> password. Copy the 6-digit verification code below and enter it on the OTP verification panel to proceed.'
      }</p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;background-color:#f8fafc;border:1.5px dashed #a5b4fc;border-radius:16px;">
        <tr>
          <td align="center" style="padding:20px 16px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#4f46e5;">
              6-Digit Security OTP
            </div>
            ${digitBoxesHtml}
            <div style="margin-top:16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:12px;background-color:#4f46e5;padding:11px 22px;">
                    <span style="display:inline-block;font-size:12px;font-weight:700;color:#e0e7ff;letter-spacing:0.04em;text-transform:uppercase;vertical-align:middle;margin-right:10px;">
                      Copy Code
                    </span>
                    <span style="display:inline-block;padding:4px 10px;border-radius:8px;background-color:#312e81;font-size:16px;font-weight:800;letter-spacing:0.16em;color:#ffffff;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;vertical-align:middle;user-select:all;-webkit-user-select:all;-moz-user-select:all;cursor:pointer;">
                      ${escapeHtml(resetCode)}
                    </span>
                  </td>
                </tr>
              </table>
            </div>
            <div style="margin-top:10px;font-size:11px;color:#64748b;">
              Tap or click the code inside <strong>Copy Code</strong> to select all 6 digits &middot; Valid for ${escapeHtml(expiresInMinutes)} minutes
            </div>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
        ${
          cleanPf
            ? `<tr>
                <td style="padding:11px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;">
                  <span style="color:#64748b;font-weight:600;">Account PF Number</span>
                </td>
                <td align="right" style="padding:11px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a;font-family:monospace;">
                  ${escapeHtml(cleanPf)}
                </td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding:11px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;">
            <span style="color:#64748b;font-weight:600;">Registered Email</span>
          </td>
          <td align="right" style="padding:11px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#0f172a;">
            ${escapeHtml(recipientEmail)}
          </td>
        </tr>
        ${
          branch
            ? `<tr>
                <td style="padding:11px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;">
                  <span style="color:#64748b;font-weight:600;">Branch</span>
                </td>
                <td align="right" style="padding:11px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#0f172a;">
                  ${escapeHtml(branch)}
                </td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding:11px 16px;font-size:12px;">
            <span style="color:#64748b;font-weight:600;">Requested</span>
          </td>
          <td align="right" style="padding:11px 16px;font-size:12px;font-weight:600;color:#475569;">
            ${escapeHtml(requestedAtText)}
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
        <tr>
          <td style="padding:12px 14px;font-size:12px;line-height:1.5;color:#92400e;">
            <strong>Didn&apos;t request this?</strong> You can safely ignore this message. Your current password remains unchanged and this verification code will expire automatically.
          </td>
        </tr>
      </table>
    `,
    footerNote: 'Automated one-time verification code delivered via Make email automation.',
  });

  return postToMakeWebhook({
    event: 'password_reset_otp' satisfies MakeEmailEventType,
    source: 'OT Claim System',
    timestamp: new Date().toISOString(),
    to: recipientEmail,
    recipientEmail,
    recipientName,
    subject,
    text: textBody,
    body: textBody,
    html: htmlBody,
    pfNumber: cleanPf,
    username: cleanPf,
    branch,
    resetCode,
    expiresInMinutes,
    requestedBy: params.requestedBy || 'self',
    senderName: params.senderName || 'OT Claim Security',
    senderEmail: params.senderEmail || '',
  });
}

export const sendPasswordResetOtpViaMake = sendPasswordResetLinkViaMake;

/**
 * Dispatches an updated credentials notice when an admin resets an employee password directly.
 */
export async function sendPasswordResetNotificationViaMake(
  params: MakePasswordResetEmailPayload
): Promise<MakeWebhookDispatchResult> {
  const recipientEmail = (params.to || '').trim().toLowerCase();
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { success: false, error: 'Valid recipient email address is required.' };
  }

  const cleanPf = (params.pfNumber || '').trim().toUpperCase();
  const recipientName = (params.name || 'User').trim();
  const loginUrl = sanitizeHttpUrl(params.loginUrl) || resolveDefaultAppUrl();
  const resetTypeLabel =
    params.resetMode === 'custom' ? 'Temporary Admin Password' : 'Reset to PF Number';
  const subject = `OT Claim - Password Updated [${cleanPf || recipientName}]`;

  const textBody = `Dear ${recipientName},

An administrator has reset your OT Claim Management System password.

• Username (PF No): ${cleanPf}
• Temporary Password: ${params.newPassword}
• Reset Type: ${resetTypeLabel}
• Web Portal: ${loginUrl}

For security, you will be prompted to create a new personal password on your next sign-in.

Best regards,
OT Claim Administration`;

  const htmlBody = buildModernSecurityEmailHtml({
    badgeText: 'Password Reset',
    badgeBgHex: '#78350f',
    badgeTextHex: '#fef3c7',
    accentHex: '#d97706',
    title: 'Your OT Claim Password Was Reset',
    subtitle: 'Temporary credentials are ready for your next sign-in',
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 18px 0;">An administrator has updated your sign-in credentials for the <strong>OT Claim Management System</strong>. Use the temporary credentials below to log in:</p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:0 0 18px 0;">
        <tr>
          <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
            <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Username (PF No)</div>
            <div style="margin-top:4px;font-size:16px;font-weight:800;color:#0f172a;font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(cleanPf)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
            <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Temporary Password</div>
            <div style="margin-top:4px;font-size:16px;font-weight:800;color:#b45309;font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(params.newPassword)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 18px;">
            <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Reset Method</div>
            <div style="margin-top:3px;font-size:13px;font-weight:600;color:#334155;">${escapeHtml(resetTypeLabel)}</div>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
        <tr>
          <td style="padding:12px 14px;font-size:12px;line-height:1.5;color:#92400e;">
            <strong>Mandatory Password Update:</strong> Immediately after signing in with these temporary credentials, you will be prompted to set your own private password.
          </td>
        </tr>
      </table>
    `,
    ctaLabel: 'Sign In & Update Password',
    ctaUrl: loginUrl,
    footerNote: 'Security notification dispatched via Make email automation.',
  });

  return postToMakeWebhook({
    event: 'password_reset_credentials' satisfies MakeEmailEventType,
    source: 'OT Claim System',
    timestamp: new Date().toISOString(),
    to: recipientEmail,
    recipientEmail,
    recipientName,
    subject,
    text: textBody,
    body: textBody,
    html: htmlBody,
    pfNumber: cleanPf,
    username: cleanPf,
    initialPassword: params.newPassword,
    loginUrl,
    resetMode: params.resetMode || 'pf_default',
    senderName: params.senderName || 'Administrator',
    senderEmail: params.senderEmail || '',
  });
}

/**
 * Dispatches a live test payload to verify the Make webhook email scenario end-to-end.
 */
export async function sendTestEmailViaMake(
  params: MakeTestEmailPayload
): Promise<MakeWebhookDispatchResult> {
  const recipientEmail = (params.to || '').trim().toLowerCase();
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid recipient email address.' };
  }

  const recipientName = (params.recipientName || 'Administrator').trim();
  const senderName = (params.senderName || 'OT Claim System').trim();
  const portalUrl = resolveDefaultAppUrl();

  if (params.templateMode === 'password_reset') {
    return sendPasswordResetLinkViaMake({
      to: recipientEmail,
      name: recipientName,
      pfNumber: 'PF1001',
      branch: 'Head Office',
      resetCode: '482917',
      expiresInMinutes: 15,
      requestedBy: 'self',
      senderName,
      senderEmail: params.senderEmail,
    });
  }

  const subject = 'OT Claim - Make Automated Email Test';
  const sentAt = new Date().toISOString();

  const textBody = `Hello ${recipientName},

This is an automated test email triggered from the OT Claim Management System using your Make webhook integration.

If you received this message, your Make scenario is correctly receiving email payloads without requiring Gmail OAuth.

Triggered by: ${senderName}
Timestamp: ${sentAt}
Portal: ${portalUrl}`;

  const htmlBody = buildBrandedEmailShell({
    eyebrow: 'Make Webhook Integration Check',
    accentHex: '#059669',
    badgeText: 'Test Successful',
    badgeBgHex: '#d1fae5',
    badgeTextHex: '#065f46',
    title: 'Automated Email Integration Active',
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hello <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 14px 0;">Your OT Claim automated email pipeline is connected to <strong>Make</strong> and dispatching email payloads directly without Gmail OAuth.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-size:12px;color:#475569;">
        <div><strong>Triggered By:</strong> ${escapeHtml(senderName)}</div>
        <div style="margin-top:4px;"><strong>Timestamp:</strong> ${escapeHtml(sentAt)}</div>
      </div>
    `,
    ctaLabel: 'Open OT Claim Portal',
    ctaUrl: portalUrl,
    footerNote: 'Make webhook verification message sent from OT Claim System Settings.',
  });

  return postToMakeWebhook({
    event: 'test_email' satisfies MakeEmailEventType,
    source: 'OT Claim System',
    timestamp: sentAt,
    to: recipientEmail,
    recipientEmail,
    recipientName,
    subject,
    text: textBody,
    body: textBody,
    html: htmlBody,
    heading: 'Make Automated Email Test',
    message: textBody,
    priority: 'low',
    priorityLabel: 'Low',
    senderName,
    senderEmail: params.senderEmail || '',
    portalUrl,
  });
}
