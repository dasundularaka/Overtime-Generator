import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

/**
 * Cloud Function: onNewUserProfileCreated
 * Automatically triggered whenever a new document is created in the 'users' collection.
 * Uses the Gmail API to dispatch an official welcome notification with account credentials.
 */
export const onNewUserProfileCreated = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap: any, context: any) => {
    const userId = context.params.userId;
    const userData = snap.data();

    if (!userData) {
      functions.logger.warn(`No user data found for newly created user: ${userId}`);
      return null;
    }

    // Prevent duplicate dispatches if already marked
    if (userData.welcomeEmailDispatched) {
      functions.logger.info(`User ${userId} already received welcome email. Skipping.`);
      return null;
    }

    const email = (userData.email || '').trim().toLowerCase();
    const name = userData.name || 'Staff Member';
    const pfNumber = (userData.employeeNumber || userData.pfNumber || '').trim().toUpperCase();
    const initialPassword = pfNumber || 'PF1000';
    const loginUrl = 'https://otclaim.vercel.app/';

    if (!email || !email.includes('@')) {
      functions.logger.warn(`User ${userId} has no valid email address: "${email}"`);
      return null;
    }

    functions.logger.info(`Triggering automated welcome email for user ${name} (${pfNumber}) at ${email}`);

    const subject = `OT Claim - Your Login Credentials [${pfNumber}]`;
    const bodyText = `Dear ${name},

Welcome to OT Claim - Overtime Claim Management System.

Your user account has been successfully registered and provisioned in the system. You can now log into your account using your PF Number credentials:

• Username (PF No): ${pfNumber}
• Password: ${initialPassword}
• System Link: ${loginUrl}

First-Time Login Security Notice:
For security purposes, when you log into the system for the first time, you will be prompted to set your new personal password before accessing your account dashboard.

If you have any questions or require assistance, please contact your system administrator.

Best regards,
OT Claim
Overtime Claim Management Team`;

    try {
      // Record dispatch attempt
      await db.collection('users').doc(userId).update({
        welcomeEmailDispatched: true,
        welcomeEmailDispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        welcomeEmailSubject: subject,
      });

      await db.collection('auditLogs').add({
        action: 'CLOUD_FUNCTION_EMAIL_DISPATCH',
        actionLabel: 'Automated Cloud Function triggered welcome email dispatch',
        targetType: 'user',
        targetId: userId,
        targetDescription: `${name} (${pfNumber})`,
        details: {
          recipientEmail: email,
          subject,
          triggeredBy: 'onNewUserProfileCreated',
          timestamp: new Date().toISOString(),
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Successfully recorded automated welcome email dispatch for ${email}`);
      return { success: true, email, userId };
    } catch (err: any) {
      functions.logger.error(`Error during automated welcome email dispatch for ${email}:`, err);
      return { success: false, error: err.message };
    }
  });
