import { NotificationPriority } from '../types';

export const DEFAULT_MAKE_WEBHOOK_URL =
  'https://hook.eu1.make.com/ssy98jpmms61noog6yyn4dt0k3y8mgtr';

export type MakeEmailEventType =
  | 'welcome_credentials'
  | 'notification_broadcast'
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
  targetLabel?: string;
  imageUrl?: string;
  senderName?: string;
  senderEmail?: string;
  senderBranch?: string;
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

export interface MakeTestEmailPayload {
  to: string;
  recipientName?: string;
  senderName?: string;
  senderEmail?: string;
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
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br />');
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
    <tr>
      <td style="height:5px;background:${params.accentHex};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:24px 28px 16px 28px;border-bottom:1px solid #f1f5f9;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
              ${escapeHtml(params.eyebrow)}
            </td>
            ${
              params.badgeText
                ? `<td align="right">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${
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
            ? `<div style="margin-top:24px;">
                <a href="${escapeHtml(safeCtaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${
                  params.accentHex
                };color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">
                  ${escapeHtml(params.ctaLabel)}
                </a>
              </div>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;line-height:1.5;color:#64748b;">
        ${escapeHtml(
          params.footerNote || 'Automated system notification delivered via OT Claim Management Portal.'
        )}
      </td>
    </tr>
  </table>
</body>
</html>`;
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
      <p style="margin:0 0 14px 0;">Dear <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 16px 0;">Welcome to the <strong>OT Claim Management System</strong>. Your staff account has been created and you can sign in using the credentials below:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 16px 0;">
        <div style="margin-bottom:8px;"><span style="color:#64748b;font-size:12px;font-weight:600;">Username (PF No):</span><br /><strong style="font-size:15px;color:#0f172a;font-family:monospace;">${escapeHtml(cleanPf)}</strong></div>
        <div style="margin-bottom:8px;"><span style="color:#64748b;font-size:12px;font-weight:600;">Temporary Password:</span><br /><strong style="font-size:15px;color:#0f172a;font-family:monospace;">${escapeHtml(initialPassword)}</strong></div>
        <div><span style="color:#64748b;font-size:12px;font-weight:600;">Portal URL:</span><br /><a href="${escapeHtml(loginUrl)}" style="color:#4f46e5;font-weight:600;text-decoration:none;">${escapeHtml(loginUrl)}</a></div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:12px;color:#92400e;">
        <strong>First-Time Login Security Notice:</strong> When signing in for the first time, you will be prompted to set a new personal password before accessing your dashboard.
      </div>
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
  const senderName = (params.senderName || 'Administrator').trim();
  const senderBranch = (params.senderBranch || 'Head Office').trim();
  const subject = `[${priorityConfig.label}] ${params.heading}`;

  const textBody = `Dear ${recipientName},

You have received a new ${priorityConfig.label} notification from ${senderName} (${senderBranch}).

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
      <p style="margin:0 0 12px 0;">Dear <strong>${escapeHtml(recipientName)}</strong>,</p>
      <div style="margin:0 0 16px 0;padding:14px 16px;background:#f8fafc;border-left:4px solid ${priorityConfig.accentHex};border-radius:8px;color:#1e293b;">
        ${formatTextParagraphsHtml(params.body)}
      </div>
      ${
        safeImageUrl
          ? `<div style="margin:0 0 16px 0;">
              <img src="${escapeHtml(safeImageUrl)}" alt="Notification attachment" style="max-width:100%;height:auto;border-radius:10px;border:1px solid #e2e8f0;display:block;" />
            </div>`
          : ''
      }
      <p style="margin:0;font-size:12px;color:#64748b;">
        Sent by <strong>${escapeHtml(senderName)}</strong> &middot; ${escapeHtml(senderBranch)}
        ${params.targetLabel ? ` &middot; Audience: ${escapeHtml(params.targetLabel)}` : ''}
      </p>
    `,
    ctaLabel: 'Open Notification Center',
    ctaUrl: portalUrl,
    footerNote: 'Sent automatically via OT Claim Notification System & Make Email Automation.',
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
    targetLabel: params.targetLabel || '',
    imageUrl: safeImageUrl || '',
    hasEmbeddedImage: Boolean(!safeImageUrl && params.imageUrl),
    senderName,
    senderEmail: params.senderEmail || '',
    senderBranch,
    portalUrl,
  });
}

/**
 * Dispatches an updated credentials notice when an admin resets an employee password.
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
  const subject = `OT Claim - Password Updated [${cleanPf || recipientName}]`;

  const textBody = `Dear ${recipientName},

An administrator has reset your OT Claim Management System password.

• Username (PF No): ${cleanPf}
• Temporary Password: ${params.newPassword}
• Web Portal: ${loginUrl}

For security, you will be prompted to create a new personal password on your next sign-in.

Best regards,
OT Claim Administration`;

  const htmlBody = buildBrandedEmailShell({
    eyebrow: 'Account Security Notice',
    accentHex: '#d97706',
    badgeText: 'Password Reset',
    badgeBgHex: '#fef3c7',
    badgeTextHex: '#92400e',
    title: 'Your OT Claim Password Was Reset',
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Dear <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 16px 0;">An administrator has reset your account password. Use the temporary credentials below to sign in:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 16px 0;">
        <div style="margin-bottom:8px;"><span style="color:#64748b;font-size:12px;font-weight:600;">Username (PF No):</span><br /><strong style="font-size:15px;color:#0f172a;font-family:monospace;">${escapeHtml(cleanPf)}</strong></div>
        <div><span style="color:#64748b;font-size:12px;font-weight:600;">Temporary Password:</span><br /><strong style="font-size:15px;color:#0f172a;font-family:monospace;">${escapeHtml(params.newPassword)}</strong></div>
      </div>
      <p style="margin:0;font-size:12px;color:#64748b;">
        You will be prompted to set a new personal password immediately upon logging in.
      </p>
    `,
    ctaLabel: 'Sign In to OT Claim',
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
