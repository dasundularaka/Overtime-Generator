import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserProfile } from '../types';
import { sendWelcomeEmailViaGmail, hasGoogleWorkspaceToken, ensureGoogleAccessToken } from './googleWorkspaceService';
import { recordAuditLog } from '../utils/auditLogger';

export interface AutomatedDispatchResult {
  success: boolean;
  userId: string;
  recipientEmail: string;
  messageId?: string;
  error?: string;
}

/**
 * Automated trigger that dispatches an official welcome credentials email
 * via the Gmail API to a newly created user.
 */
export async function triggerWelcomeEmailForUser(
  user: Partial<UserProfile> & { id: string; email: string; name: string },
  initialPassword?: string,
  options?: { interactiveAuthIfRequired?: boolean }
): Promise<AutomatedDispatchResult> {
  const cleanEmail = (user.email || '').trim().toLowerCase();
  const cleanPf = (user.employeeNumber || user.pfNumber || '').trim().toUpperCase();
  const name = user.name || 'User';
  const pass = initialPassword || cleanPf || 'PF1000';

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      success: false,
      userId: user.id,
      recipientEmail: cleanEmail,
      error: 'Invalid recipient email address.',
    };
  }

  try {
    // If interactive auth requested and not connected yet, ensure token
    if (options?.interactiveAuthIfRequired && !hasGoogleWorkspaceToken()) {
      await ensureGoogleAccessToken();
    }

    // Dispatch via Gmail API
    const gmailResult = await sendWelcomeEmailViaGmail({
      to: cleanEmail,
      name,
      pfNumber: cleanPf,
      initialPassword: pass,
      loginUrl: 'https://otclaim.vercel.app/',
    });

    if (gmailResult.success) {
      // Mark as dispatched in Firestore user document
      try {
        await updateDoc(doc(db, 'users', user.id), {
          welcomeEmailDispatched: true,
          welcomeEmailDispatchedAt: new Date().toISOString(),
          welcomeEmailMessageId: gmailResult.messageId || null,
        });
      } catch (updateErr) {
        console.warn('Could not update user doc with email dispatch metadata:', updateErr);
      }

      // Record administrative audit log
      await recordAuditLog({
        action: 'EMAIL_DISPATCH',
        actionLabel: 'Dispatched automated welcome email via Gmail',
        targetType: 'user',
        targetId: user.id,
        targetDescription: `${name} (${cleanPf || cleanEmail})`,
        details: {
          recipientEmail: cleanEmail,
          gmailMessageId: gmailResult.messageId,
          dispatchedAt: new Date().toISOString(),
          triggerType: 'CLOUD_FUNCTION_AUTOMATED_TRIGGER',
        },
      });

      return {
        success: true,
        userId: user.id,
        recipientEmail: cleanEmail,
        messageId: gmailResult.messageId,
      };
    } else {
      return {
        success: false,
        userId: user.id,
        recipientEmail: cleanEmail,
        error: gmailResult.error || 'Gmail dispatch failed.',
      };
    }
  } catch (err: any) {
    console.warn(`[Automated Dispatch] Could not send welcome email to ${cleanEmail}:`, err.message);
    return {
      success: false,
      userId: user.id,
      recipientEmail: cleanEmail,
      error: err.message,
    };
  }
}

/**
 * Initializes a real-time Cloud Function simulator listener.
 * Whenever an admin or system creates a new user profile in Firestore
 * that has not yet received a welcome email, this listener automatically dispatches it.
 */
export function initAutomatedUserCreationListener(isAdmin: boolean): () => void {
  if (!isAdmin) return () => {};

  try {
    const q = query(
      collection(db, 'users'),
      where('welcomeEmailDispatched', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as UserProfile;
            // Only trigger if Google Workspace token is available
            if (hasGoogleWorkspaceToken() && data && !data.welcomeEmailDispatched) {
              triggerWelcomeEmailForUser({
                ...data,
                id: data.id || change.doc.id,
              });
            }
          }
        });
      },
      (error) => {
        // Silently handle permission error if rules do not support query
        console.warn('Automated user creation listener note:', error.message);
      }
    );

    return unsubscribe;
  } catch {
    return () => {};
  }
}
