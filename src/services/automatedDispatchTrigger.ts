import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserProfile } from '../types';
import {
  claimWelcomeDispatchLock,
  hasWelcomeDispatchClaimed,
  releaseWelcomeDispatchLock,
  sendWelcomeEmailViaMake,
} from './makeEmailService';
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
 * via the configured Make webhook to a newly created user (without Gmail).
 */
export async function triggerWelcomeEmailForUser(
  user: Partial<UserProfile> & { id: string; email: string; name: string },
  initialPassword?: string
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

  if (!claimWelcomeDispatchLock(user.id)) {
    return {
      success: true,
      userId: user.id,
      recipientEmail: cleanEmail,
    };
  }

  let succeeded = false;
  try {
    const makeResult = await sendWelcomeEmailViaMake({
      to: cleanEmail,
      name,
      pfNumber: cleanPf,
      initialPassword: pass,
      loginUrl:
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'https://otclaim.vercel.app/',
      role: user.role,
      branch: user.branch,
      department: user.department,
      claimType: user.claimType,
    });

    if (makeResult.success) {
      succeeded = true;
      try {
        await updateDoc(doc(db, 'users', user.id), {
          welcomeEmailDispatched: true,
          welcomeEmailDispatchedAt: new Date().toISOString(),
          welcomeEmailMessageId: makeResult.messageId || null,
        });
      } catch (updateErr) {
        console.warn('Could not update user doc with email dispatch metadata:', updateErr);
      }

      await recordAuditLog({
        action: 'EMAIL_DISPATCH',
        actionLabel: 'Dispatched Automated Welcome Email via Make',
        targetType: 'user',
        targetId: user.id,
        targetDescription: `${name} (${cleanPf || cleanEmail})`,
        beforeState: {
          welcomeEmailDispatched: false,
        },
        afterState: {
          welcomeEmailDispatched: true,
          recipientEmail: cleanEmail,
          provider: 'make_webhook',
          makeMessageId: makeResult.messageId,
          dispatchedAt: new Date().toISOString(),
        },
        details: {
          recipientEmail: cleanEmail,
          provider: 'make_webhook',
          makeMessageId: makeResult.messageId,
          dispatchedAt: new Date().toISOString(),
          triggerType: 'MAKE_WEBHOOK_AUTOMATED_TRIGGER',
        },
      });

      return {
        success: true,
        userId: user.id,
        recipientEmail: cleanEmail,
        messageId: makeResult.messageId,
      };
    }

    return {
      success: false,
      userId: user.id,
      recipientEmail: cleanEmail,
      error: makeResult.error || 'Make webhook dispatch failed.',
    };
  } catch (err: any) {
    console.warn(`[Automated Dispatch] Could not send welcome email to ${cleanEmail}:`, err.message);
    return {
      success: false,
      userId: user.id,
      recipientEmail: cleanEmail,
      error: err.message,
    };
  } finally {
    releaseWelcomeDispatchLock(user.id, succeeded);
  }
}

/**
 * Initializes a real-time Firestore listener for admins.
 * Whenever a new user profile exists with welcomeEmailDispatched === false
 * (and wasn't already claimed by interactive user creation), automatically
 * dispatches their welcome email via Make webhook without requiring Gmail sign-in.
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
            const targetId = data.id || change.doc.id;
            if (data && !data.welcomeEmailDispatched && !hasWelcomeDispatchClaimed(targetId)) {
              triggerWelcomeEmailForUser({
                ...data,
                id: targetId,
              });
            }
          }
        });
      },
      (error) => {
        console.warn('Automated user creation listener note:', error.message);
      }
    );

    return unsubscribe;
  } catch {
    return () => {};
  }
}
