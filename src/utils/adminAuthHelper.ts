import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { firebaseConfig } from '../firebase/config';

function getSecondaryAuth() {
  const app =
    getApps().find(a => a.name === 'SecondaryAdminAuth') ||
    initializeApp(firebaseConfig, 'SecondaryAdminAuth');
  return getAuth(app);
}

/**
 * Changes a user's password from an admin session without signing out the active admin.
 * - If user account doesn't exist in Firebase Auth yet, creates it with the new password.
 * - If account exists and previous password / employee number matches, updates password directly.
 * - If account exists and cannot sign in directly, dispatches a secure password reset link to user's email.
 */
export async function adminChangeUserPassword(
  userEmail: string,
  newPass: string,
  oldPassGuess?: string
): Promise<{ success: boolean; message: string }> {
  const secAuth = getSecondaryAuth();
  const cleanEmail = userEmail.toLowerCase().trim();

  try {
    // 1. Try creating account with the new password (for pre-registered users)
    try {
      await createUserWithEmailAndPassword(secAuth, cleanEmail, newPass);
      await signOut(secAuth);
      return {
        success: true,
        message: `Account created for ${cleanEmail} with the specified password.`,
      };
    } catch (createErr: any) {
      if (createErr.code === 'auth/email-already-in-use') {
        // 2. Account already exists in Firebase Auth.
        // If an old password guess is provided (such as employee number), try logging in to change it:
        if (oldPassGuess) {
          try {
            const cred = await signInWithEmailAndPassword(secAuth, cleanEmail, oldPassGuess);
            await updatePassword(cred.user, newPass);
            await signOut(secAuth);
            return {
              success: true,
              message: `Successfully updated password for ${cleanEmail}.`,
            };
          } catch {
            // Password guess didn't work; proceed to reset email dispatch
          }
        }

        // 3. Fallback: Dispatch an official password reset email to the user
        await sendPasswordResetEmail(secAuth, cleanEmail);
        await signOut(secAuth);
        return {
          success: true,
          message: `Password update requested. A secure password reset link has been dispatched to ${cleanEmail}.`,
        };
      }

      throw createErr;
    }
  } catch (err: any) {
    try {
      await signOut(secAuth);
    } catch {
      // ignore
    }
    throw err;
  }
}

/**
 * Sends a password reset email directly to a user's registered email.
 */
export async function adminSendUserPasswordResetEmail(userEmail: string): Promise<void> {
  const secAuth = getSecondaryAuth();
  await sendPasswordResetEmail(secAuth, userEmail.toLowerCase().trim());
  await signOut(secAuth);
}

/**
 * Creates a new user in Firebase Auth with default password (e.g. PF number)
 * without signing out the current admin.
 */
export async function adminCreateUserInAuth(
  email: string,
  initialPassword: string
): Promise<{ success: boolean; uid?: string; message: string }> {
  const secAuth = getSecondaryAuth();
  const cleanEmail = email.toLowerCase().trim();

  try {
    const cred = await createUserWithEmailAndPassword(secAuth, cleanEmail, initialPassword);
    const uid = cred.user.uid;
    await signOut(secAuth);
    return {
      success: true,
      uid,
      message: `User created in Firebase Auth.`,
    };
  } catch (err: any) {
    try {
      await signOut(secAuth);
    } catch {}
    if (err.code === 'auth/email-already-in-use') {
      return {
        success: true,
        message: 'Account already registered in Auth system.',
      };
    }
    console.warn('adminCreateUserInAuth note:', err.message);
    return {
      success: false,
      message: err.message || 'Could not create auth account',
    };
  }
}
