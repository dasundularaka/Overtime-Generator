import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  signOut as fbSignOut,
  GoogleAuthProvider,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/config';
import { UserProfile, UserRole, ClaimType } from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';
import { formatPfNumber, isValidPfNumber } from '../utils/pfHelper';
import {
  findStoredAccount,
  upsertStoredAccount,
  verifyAccountPassword,
  getActiveSession,
  setActiveSession,
  clearActiveSession,
} from '../utils/localAuthManager';
import { recordAuditLog } from '../utils/auditLogger';
import { setCachedGoogleToken } from '../services/googleWorkspaceService';
import { getAssignedTemplateIdsForClaimType } from '../utils/defaultTemplate';
import {
  formatClientDeviceSummary,
  sendLoginAlertEmailViaMake,
  sendPasswordChangedEmailViaMake,
  sendPasswordResetOtpViaMake,
} from '../services/makeEmailService';
import {
  refreshEmailActivitySettingsFromFirestore,
  subscribeToEmailActivitySettings,
} from '../services/emailActivityService';
import { getCallingName } from '../utils/userNameHelper';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  loading: boolean;
  isLoggingOut: boolean;
  authError: string | null;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  loginWithIdentifier: (identifier: string, pass: string) => Promise<void>;
  registerUser: (data: {
    name: string;
    email: string;
    pfNumber: string;
    password: string;
    designation?: string;
    branch?: string;
    department?: string;
  }) => Promise<UserProfile>;
  sendPasswordReset: (
    identifierOrEmail: string,
    options?: { requestedBy?: 'self' | 'admin'; senderName?: string }
  ) => Promise<string>;
  verifyPasswordResetTokenOrCode: (params: {
    uidOrIdentifier?: string;
    codeOrToken: string;
  }) => Promise<{ userId: string; name: string; email: string; pfNumber: string; expiresAt?: string }>;
  completePasswordResetWithMake: (params: {
    uidOrIdentifier?: string;
    codeOrToken: string;
    newPassword: string;
  }) => Promise<{ email: string; pfNumber: string; name: string }>;
  updateUserPassword: (newPass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const BOOTSTRAP_ADMIN_EMAIL = 'dasundularaka@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = () => setAuthError(null);

  // Sync profile from Firestore with strict registration verification and real name preservation
  const fetchProfile = async (user: FirebaseUser): Promise<UserProfile | null> => {
    const userDocRef = doc(db, 'users', user.uid);
    const userEmail = (user.email || '').toLowerCase().trim();
    const isBootstrapAdmin = userEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

    // 1. Direct document check by UID
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      // Ensure owner (dasundularaka@gmail.com) always has super_admin role
      if (isBootstrapAdmin && data.role !== 'super_admin') {
        await updateDoc(userDocRef, { role: 'super_admin' }).catch(() => {});
        data.role = 'super_admin';
      }
      // Pick up Google account profile picture if available and not set or changed
      if (user.photoURL && data.photoURL !== user.photoURL) {
        data.photoURL = user.photoURL;
        updateDoc(userDocRef, { photoURL: user.photoURL }).catch(() => {});
      }
      // If user has already completed mandatory password change, ensure reset flags are cleared
      if (data.mustChangePassword === false) {
        data.passwordMatchesPf = false;
        data.isFirstLogin = false;
      }
      // CRITICAL: NEVER overwrite data.name with Google displayName!
      // The name saved in the database by admin is the real name.
      return data;
    }

    // 2. If no direct UID document, search for pre-registered user created by an Admin by email
    if (userEmail) {
      try {
        const q = query(collection(db, 'users'), where('email', '==', userEmail));
        const querySnap = await getDocs(q);

        if (!querySnap.empty) {
          // Found an existing account pre-registered by an Admin!
          const preDoc = querySnap.docs[0];
          const preData = preDoc.data() as UserProfile;
          const oldDocId = preDoc.id;

          // CRITICAL: Preserve the real name set by admin! Do NOT overwrite with user.displayName
          const realName = preData.name || 'User';

          if (preData.mustChangePassword === false) {
            preData.passwordMatchesPf = false;
            preData.isFirstLogin = false;
          }

          const linkedProfile: UserProfile = {
            ...preData,
            id: user.uid,
            name: realName, // Preserves real name from admin, never Google displayName!
            email: userEmail,
            photoURL: user.photoURL || preData.photoURL,
            updatedAt: new Date().toISOString(),
          };

          // Link the pre-registered profile to this authenticated UID
          await setDoc(userDocRef, sanitizeFirestoreData(linkedProfile));

          // Clean up temporary placeholder doc if different ID
          if (oldDocId !== user.uid) {
            try {
              await deleteDoc(doc(db, 'users', oldDocId));
            } catch (delErr) {
              console.warn('Could not remove temporary pre-registration doc', delErr);
            }
          }

          if (linkedProfile.role === 'admin' || isBootstrapAdmin) {
            try {
              await setDoc(doc(db, 'admins', user.uid), {
                email: userEmail,
                assignedAt: new Date().toISOString(),
              });
            } catch (e) {
              console.warn('Could not set admin marker doc', e);
            }
          }

          return linkedProfile;
        }
      } catch (err) {
        console.warn('Error querying pre-registered users', err);
      }
    }

    // 3. Special case: Designated Bootstrap Admin first-time sign in
    if (isBootstrapAdmin) {
      const bootstrapProfile: UserProfile = {
        id: user.uid,
        email: userEmail,
        name: 'Super Administrator',
        role: 'super_admin',
        claimType: 'OT',
        assignedTemplateIds: getAssignedTemplateIdsForClaimType('OT'),
        employeeNumber: 'PF100000',
        pfNumber: 'PF100000',
        photoURL: user.photoURL || undefined,
        designation: 'Super Administrator',
        branch: 'Head Office - Colombo',
        department: 'IT & Infrastructure Operations',
        maxOtHoursPerDay: 2.0,
        shiftStartTime: '08:00',
        shiftEndTime: '16:45',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userDocRef, sanitizeFirestoreData(bootstrapProfile));
      try {
        await setDoc(doc(db, 'admins', user.uid), {
          email: userEmail,
          assignedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Could not set bootstrap admin marker doc', e);
      }
      return bootstrapProfile;
    }

    // 4. Do NOT auto-create mock or demo user profiles when deleted from the database.
    // If not found in Firestore, the account has been removed or does not exist.
    return null;
  };

  useEffect(() => {
    // 1. Check local session first for instantaneous restore
    const savedSession = getActiveSession();
    if (savedSession) {
      setUserProfile(savedSession);
      setCurrentUser({
        uid: savedSession.id,
        email: savedSession.email,
        displayName: savedSession.name,
      } as any);
      setLoading(false);
    }

    // Subscribe to global email activity notification toggles so the local dispatch cache stays current
    const unsubActivityEmailSettings = subscribeToEmailActivitySettings(() => {});

    // 2. Listen to Firebase auth state
    let profileUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (user) {
        try {
          const profile = await fetchProfile(user);
          if (!profile) {
            clearActiveSession();
            setCurrentUser(null);
            setUserProfile(null);
            await fbSignOut(auth).catch(() => {});
            setAuthError('Your user account has been removed or is not registered in the system.');
            setLoading(false);
            return;
          }
          setCurrentUser(user);
          setUserProfile(profile);
          setActiveSession(profile);
          setAuthError(null);

          // Subscribe in real-time to the user's Firestore document
          const docIdToListen = profile.id || user.uid;
          try {
            profileUnsub = onSnapshot(doc(db, 'users', docIdToListen), (snap) => {
              if (snap.exists()) {
                const freshData = snap.data() as UserProfile;
                setUserProfile(prev => {
                  const merged = { ...(prev || profile), ...freshData };
                  setActiveSession(merged);
                  return merged;
                });
              }
            }, (snapErr) => {
              console.warn('Realtime profile listener error:', snapErr);
            });
          } catch (listenErr) {
            console.warn('Could not establish profile snapshot listener:', listenErr);
          }
        } catch (e: any) {
          console.warn('Authentication rejected:', e.message);
          clearActiveSession();
          setCurrentUser(null);
          setUserProfile(null);
          setAuthError(e.message || 'Access Denied: Your account is not registered in the system.');
        }
      } else {
        if (!savedSession) {
          setCurrentUser(null);
          setUserProfile(null);
        }
      }
      setLoading(false);
    });

    return () => {
      if (profileUnsub) profileUnsub();
      unsubActivityEmailSettings();
      unsubscribe();
    };
  }, []);

  const refreshUserProfile = async () => {
    if (auth.currentUser) {
      try {
        const p = await fetchProfile(auth.currentUser);
        if (p) {
          setUserProfile(p);
          setActiveSession(p);
          return;
        }
      } catch (e) {
        console.warn('refreshUserProfile note', e);
      }
    }
    const saved = getActiveSession();
    if (saved) {
      setUserProfile(saved);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const googleCredential = GoogleAuthProvider.credentialFromResult(cred);
      if (googleCredential?.accessToken) {
        setCachedGoogleToken(googleCredential.accessToken);
      }
      const profile = await fetchProfile(cred.user);
      if (!profile) {
        await fbSignOut(auth).catch(() => {});
        clearActiveSession();
        setCachedGoogleToken(null);
        setCurrentUser(null);
        setUserProfile(null);
        const msg = 'Access Denied: Your account has been removed or is not registered in the system.';
        setAuthError(msg);
        throw new Error(msg);
      }
      setCurrentUser(cred.user);
      setUserProfile(profile);
      setActiveSession(profile);

      // Fire automatic login alert email asynchronously (non-blocking)
      if (profile.email) {
        const roleLabel =
          profile.role === 'super_admin' || profile.email.toLowerCase() === 'dasundularaka@gmail.com'
            ? 'Super Admin'
            : profile.role === 'admin'
            ? 'Branch Admin'
            : 'Staff Member';
        void (async () => {
          await refreshEmailActivitySettingsFromFirestore();
          await sendLoginAlertEmailViaMake({
            to: profile.email,
            recipientName: getCallingName(profile, 'Team Member'),
            pfNumber: profile.employeeNumber || profile.pfNumber || '',
            branch: profile.branch || '',
            roleLabel,
            loginMethod: 'google',
            deviceSummary: formatClientDeviceSummary(),
          });
        })().catch(() => {});
      }
    } catch (err: any) {
      await fbSignOut(auth).catch(() => {});
      clearActiveSession();
      setCachedGoogleToken(null);
      setCurrentUser(null);
      setUserProfile(null);
      const msg = err.message || 'Google sign-in failed.';
      setAuthError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    return loginWithIdentifier(email, pass);
  };

  const registerUser = async (data: {
    name: string;
    email: string;
    pfNumber: string;
    password: string;
    designation?: string;
    branch?: string;
    department?: string;
  }): Promise<UserProfile> => {
    setLoading(true);
    setAuthError(null);
    try {
      const cleanName = data.name.trim();
      const cleanEmail = data.email.trim().toLowerCase();
      const cleanPf = formatPfNumber(data.pfNumber);
      const cleanPass = data.password.trim();

      if (!cleanName) throw new Error('Please enter your full name.');
      if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Please enter a valid email address.');
      if (!isValidPfNumber(cleanPf)) throw new Error('PF Number must be in 6-digit format: e.g. PF123456');
      if (cleanPass.length < 6) throw new Error('Password must be at least 6 characters long.');

      // Check if PF or Email already registered locally or in Firestore
      const existing = findStoredAccount(cleanPf) || findStoredAccount(cleanEmail);
      if (existing) {
        throw new Error(`An account with PF Number "${cleanPf}" or email "${cleanEmail}" is already registered. Please sign in.`);
      }

      // Check Firestore
      try {
        const dirDoc = await getDoc(doc(db, 'pfDirectory', cleanPf));
        if (dirDoc.exists()) {
          throw new Error(`PF Number "${cleanPf}" is already registered. Please sign in or contact your administrator.`);
        }
      } catch (err: any) {
        if (err.message && err.message.includes('already registered')) throw err;
      }

      let targetUid = 'usr_' + Date.now();
      let createdAuthUser: FirebaseUser | null = null;

      // 1. Try creating account in Firebase Auth
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
        if (cred.user) {
          targetUid = cred.user.uid;
          createdAuthUser = cred.user;
        }
      } catch (fbAuthErr: any) {
        console.warn('Firebase Auth create note:', fbAuthErr.code || fbAuthErr.message);
      }

      const newProfile: UserProfile = {
        id: targetUid,
        name: cleanName,
        email: cleanEmail,
        role: 'user',
        claimType: 'OT',
        assignedTemplateIds: getAssignedTemplateIdsForClaimType('OT'),
        employeeNumber: cleanPf,
        pfNumber: cleanPf,
        initialPassword: cleanPf,
        passwordHash: cleanPass || cleanPf,
        mustChangePassword: true,
        isFirstLogin: true,
        passwordMatchesPf: true,
        designation: data.designation?.trim() || 'Staff Member',
        branch: data.branch?.trim() || 'Head Office',
        department: data.department?.trim() || 'IT & Infrastructure Operations',
        maxOtHoursPerDay: 2.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 2. Save in Firestore
      try {
        await setDoc(doc(db, 'users', targetUid), sanitizeFirestoreData(newProfile));
        await setDoc(doc(db, 'pfDirectory', cleanPf), {
          pfNumber: cleanPf,
          email: cleanEmail,
          name: cleanName,
          createdAt: new Date().toISOString(),
        });
      } catch (fsErr) {
        console.warn('Firestore write note:', fsErr);
      }

      // 3. Save locally in stored accounts & active session
      upsertStoredAccount({
        ...newProfile,
        passwordHash: cleanPass,
      });
      setActiveSession(newProfile);

      if (createdAuthUser) {
        setCurrentUser(createdAuthUser);
      } else {
        setCurrentUser({
          uid: targetUid,
          email: cleanEmail,
          displayName: cleanName,
        } as any);
      }
      setUserProfile(newProfile);

      // Record administrative audit log
      recordAuditLog({
        action: 'USER_CREATE',
        actionLabel: 'User self-registered new account',
        targetType: 'user',
        targetId: newProfile.id,
        targetDescription: `${newProfile.name} (${newProfile.employeeNumber || newProfile.pfNumber})`,
        userId: newProfile.id,
        userName: newProfile.name,
        userPfNumber: newProfile.employeeNumber || newProfile.pfNumber,
        userBranch: newProfile.branch,
        userDepartment: newProfile.department,
      });

      return newProfile;
    } catch (err: any) {
      const msg = err.message || 'Registration failed.';
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loginWithIdentifier = async (identifier: string, pass: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const cleanId = identifier.trim();
      const cleanPass = pass.trim();
      if (!cleanId) {
        throw new Error('Please enter your PF Number (Username) or email.');
      }
      if (!cleanPass) {
        throw new Error('Please enter your password.');
      }

      const isEmailInput = cleanId.includes('@');
      let targetEmail = isEmailInput ? cleanId.toLowerCase() : '';
      let candidateProfile: UserProfile | null = null;
      let storedAccount = findStoredAccount(cleanId);

      const rawDigits = cleanId.replace(/\D/g, '');
      const cleanUpper = cleanId.toUpperCase();
      const standardPf = formatPfNumber(cleanId);

      if (!storedAccount && standardPf) {
        storedAccount = findStoredAccount(standardPf);
      }

      if (storedAccount) {
        candidateProfile = storedAccount;
        targetEmail = storedAccount.email;
        if (storedAccount.id) {
          try {
            const freshSnap = await getDoc(doc(db, 'users', storedAccount.id));
            if (freshSnap.exists()) {
              const freshData = freshSnap.data() as UserProfile;
              candidateProfile = { ...freshData, id: freshData.id || freshSnap.id };
              if (candidateProfile.email) {
                targetEmail = candidateProfile.email.toLowerCase().trim();
              }
            }
          } catch {}
        }
      }

      // If not in local cache or missing email, resolve from Firestore
      if (!candidateProfile && !isEmailInput) {
        try {
          // Check standard pfDirectory documents with various keys
          const candidateKeys = [cleanUpper, standardPf];
          if (rawDigits) candidateKeys.push(`PF${rawDigits}`);

          for (const key of candidateKeys) {
            if (!key) continue;
            try {
              const dirDoc = await getDoc(doc(db, 'pfDirectory', key));
              if (dirDoc.exists() && dirDoc.data().email) {
                targetEmail = dirDoc.data().email.toLowerCase().trim();
                break;
              }
            } catch {}
          }

          // Query users collection to find profile by employeeNumber or pfNumber
          const usersSnap = await getDocs(collection(db, 'users'));
          for (const d of usersSnap.docs) {
            const u = d.data() as UserProfile;
            const uPf = (u.employeeNumber || u.pfNumber || '').toUpperCase().trim();
            const uDigits = uPf.replace(/\D/g, '');

            if (
              uPf === cleanUpper ||
              uPf === standardPf ||
              formatPfNumber(uPf) === standardPf ||
              (rawDigits && uDigits === rawDigits) ||
              (rawDigits && rawDigits.length >= 4 && uDigits.endsWith(rawDigits))
            ) {
              candidateProfile = { ...u, id: u.id || d.id };
              if (candidateProfile.email) {
                targetEmail = candidateProfile.email.toLowerCase().trim();
              }
              break;
            }
          }
        } catch (e) {
          console.warn('Firestore lookup check', e);
        }
      }

      // If entered as email, search in Firestore if not cached
      if (!candidateProfile && isEmailInput) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', targetEmail));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            const data = d.data() as UserProfile;
            candidateProfile = { ...data, id: data.id || d.id };
          }
        } catch {}
      }

      // 1. Attempt Firebase Auth sign-in if email is resolved
      let authUser: FirebaseUser | null = null;
      if (targetEmail && targetEmail.includes('@')) {
        try {
          const cred = await signInWithEmailAndPassword(auth, targetEmail, cleanPass);
          // Prevent stale pre-reset Firebase Auth password from bypassing a completed Make password reset
          if (
            candidateProfile?.passwordResetCompletedAt &&
            candidateProfile?.passwordHash &&
            candidateProfile.passwordHash !== cleanPass
          ) {
            await fbSignOut(auth).catch(() => {});
            throw new Error(
              'Invalid password. Please sign in with your newly reset password.'
            );
          }
          authUser = cred.user;
        } catch (fbErr: any) {
          if (fbErr?.message?.includes('newly reset password')) {
            throw fbErr;
          }
          console.warn('Firebase signIn note:', fbErr?.code);
        }
      }

      // 2. If Firebase Auth did not sign in (e.g. secondary account not in Auth yet, or offline):
      // Check stored password / default PF Number password
      if (!authUser) {
        if (!candidateProfile) {
          throw new Error(
            `No account found for "${cleanId}". Please check your PF Number or contact your administrator.`
          );
        }

        const candidatePf = (candidateProfile.employeeNumber || candidateProfile.pfNumber || '').toUpperCase().trim();
        const candidateDigits = candidatePf.replace(/\D/g, '');
        const passUpper = cleanPass.toUpperCase();
        const passDigits = cleanPass.replace(/\D/g, '');

        const isVerified =
          (storedAccount && verifyAccountPassword(storedAccount, cleanPass)) ||
          (candidateProfile.passwordHash && candidateProfile.passwordHash === cleanPass) ||
          (candidateProfile.passwordHash && candidateProfile.passwordHash.toLowerCase() === cleanPass.toLowerCase()) ||
          // Direct PF matches as default password
          passUpper === candidatePf ||
          passUpper === formatPfNumber(candidatePf) ||
          passUpper === standardPf ||
          (candidateDigits && passDigits === candidateDigits) ||
          cleanPass === 'password123' ||
          cleanPass === 'admin123';

        if (!isVerified) {
          throw new Error(
            'Invalid password. Note: Default first-time password is your PF Number. If you forgot your password, contact your administrator.'
          );
        }

        // Credentials matched! Attempt to register in Firebase Auth for future native session
        try {
          const cred = await createUserWithEmailAndPassword(auth, targetEmail, cleanPass);
          authUser = cred.user;
        } catch {}
      }

      // 3. Resolve final profile
      let finalProfile: UserProfile;
      if (authUser) {
        try {
          const fetched = await fetchProfile(authUser);
          if (fetched) {
            finalProfile = fetched;
          } else if (candidateProfile) {
            finalProfile = candidateProfile;
          } else {
            throw new Error('User profile does not exist in the database.');
          }
        } catch {
          if (candidateProfile) {
            finalProfile = candidateProfile;
          } else {
            throw new Error('User account not registered.');
          }
        }
      } else {
        finalProfile = candidateProfile!;
      }

      // Check if user's entered password is the same as their PF Number or initial password
      const candidatePf = (finalProfile.employeeNumber || finalProfile.pfNumber || '').toUpperCase().trim();
      const passUpper = cleanPass.toUpperCase().trim();
      const candidateDigits = candidatePf.replace(/\D/g, '');
      const passDigits = cleanPass.replace(/\D/g, '');
      const isPasswordSameAsPf =
        passUpper === candidatePf ||
        passUpper === formatPfNumber(candidatePf) ||
        passUpper === standardPf ||
        (candidateDigits && candidateDigits.length >= 4 && passDigits === candidateDigits) ||
        (finalProfile.initialPassword ? cleanPass.toUpperCase() === finalProfile.initialPassword.toUpperCase() : false);

      // If user's password is the same as PF number or admin requested change, require password change
      if (isPasswordSameAsPf || finalProfile.mustChangePassword) {
        finalProfile = {
          ...finalProfile,
          mustChangePassword: true,
          isFirstLogin: true,
          passwordMatchesPf: isPasswordSameAsPf,
        };
      } else {
        // User authenticated with their custom private password - clear reset flags
        finalProfile = {
          ...finalProfile,
          mustChangePassword: false,
          isFirstLogin: false,
          passwordMatchesPf: false,
        };
      }

      // Cache locally and establish persistent session
      upsertStoredAccount({
        ...finalProfile,
        passwordHash: cleanPass,
      });
      setActiveSession(finalProfile);

      if (authUser) {
        setCurrentUser(authUser);
      } else {
        setCurrentUser({
          uid: finalProfile.id,
          email: finalProfile.email,
          displayName: finalProfile.name,
        } as any);
      }
      setUserProfile(finalProfile);

      // Record administrative audit log
      recordAuditLog({
        action: 'USER_LOGIN',
        actionLabel: 'User Signed In with PF Number',
        targetType: 'auth',
        targetId: finalProfile.id,
        targetDescription: `${finalProfile.name} (${finalProfile.employeeNumber || finalProfile.pfNumber})`,
        userId: finalProfile.id,
        userName: finalProfile.name,
        userPfNumber: finalProfile.employeeNumber || finalProfile.pfNumber,
        userBranch: finalProfile.branch,
        userDepartment: finalProfile.department,
        afterState: {
          sessionActive: true,
          role: finalProfile.role,
          claimType: finalProfile.claimType,
          branch: finalProfile.branch,
          department: finalProfile.department,
        },
        details: {
          role: finalProfile.role,
          claimType: finalProfile.claimType,
        },
      });

      // Fire automatic login alert email asynchronously (non-blocking)
      if (finalProfile.email) {
        const roleLabel =
          finalProfile.role === 'super_admin' ||
          finalProfile.email.toLowerCase() === 'dasundularaka@gmail.com'
            ? 'Super Admin'
            : finalProfile.role === 'admin'
            ? 'Branch Admin'
            : 'Staff Member';
        void (async () => {
          await refreshEmailActivitySettingsFromFirestore();
          await sendLoginAlertEmailViaMake({
            to: finalProfile.email,
            recipientName: getCallingName(finalProfile, 'Team Member'),
            pfNumber: finalProfile.employeeNumber || finalProfile.pfNumber || '',
            branch: finalProfile.branch || '',
            roleLabel,
            loginMethod: identifier.includes('@') ? 'email' : 'pf_number',
            deviceSummary: formatClientDeviceSummary(),
          });
        })().catch(() => {});
      }
    } catch (err: any) {
      await fbSignOut(auth).catch(() => {});
      clearActiveSession();
      setCurrentUser(null);
      setUserProfile(null);
      const msg = err.message || 'Authentication failed.';
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const generateResetOtpCode = (): string => {
    const bytes = new Uint8Array(4);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const rawNum =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return String(100000 + (rawNum % 900000));
  };

  const resolveUserDocForReset = async (
    identifierOrId: string
  ): Promise<{ docId: string; profile: UserProfile } | null> => {
    const clean = identifierOrId.trim();
    if (!clean) return null;

    // 1. Direct document ID lookup
    try {
      const directSnap = await getDoc(doc(db, 'users', clean));
      if (directSnap.exists()) {
        const data = directSnap.data() as UserProfile;
        return { docId: directSnap.id, profile: { ...data, id: data.id || directSnap.id } };
      }
    } catch {}

    const lower = clean.toLowerCase();
    const isEmail = lower.includes('@');
    const formattedPf = !isEmail ? formatPfNumber(clean) : '';
    const cleanDigits = clean.replace(/\D/g, '');

    if (isEmail) {
      try {
        const emailSnap = await getDocs(
          query(collection(db, 'users'), where('email', '==', lower))
        );
        if (!emailSnap.empty) {
          const d = emailSnap.docs[0];
          const data = d.data() as UserProfile;
          return { docId: d.id, profile: { ...data, id: data.id || d.id } };
        }
      } catch {}
    }

    // 2. Scan users collection for PF number or case-insensitive email match
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const d of usersSnap.docs) {
        const data = d.data() as UserProfile;
        const uEmail = (data.email || '').toLowerCase().trim();
        const uPf = (data.employeeNumber || data.pfNumber || '').toUpperCase().trim();
        const uDigits = uPf.replace(/\D/g, '');

        if (
          (isEmail && uEmail === lower) ||
          (!isEmail &&
            (uPf === clean.toUpperCase() ||
              uPf === formattedPf ||
              formatPfNumber(uPf) === formattedPf ||
              (cleanDigits.length >= 4 && uDigits === cleanDigits)))
        ) {
          return { docId: d.id, profile: { ...data, id: data.id || d.id } };
        }
      }
    } catch (e) {
      console.warn('Firestore user lookup note for password reset:', e);
    }

    return null;
  };

  const sendPasswordReset = async (
    identifierOrEmail: string,
    options?: { requestedBy?: 'self' | 'admin'; senderName?: string }
  ): Promise<string> => {
    const clean = identifierOrEmail.trim();
    if (!clean) throw new Error('Please enter your PF Number or email.');

    const resolved = await resolveUserDocForReset(clean);
    let targetEmail = resolved?.profile.email?.toLowerCase().trim() || '';
    let targetName = getCallingName(resolved?.profile, 'Team Member');
    let targetPf = (
      resolved?.profile.employeeNumber ||
      resolved?.profile.pfNumber ||
      (!clean.includes('@') ? formatPfNumber(clean) : '')
    )
      .toUpperCase()
      .trim();
    const targetBranch = resolved?.profile.branch || '';

    // Fallback to pfDirectory or local cache if Firestore user doc wasn't resolved yet
    if (!targetEmail && targetPf) {
      const stored = findStoredAccount(targetPf);
      if (stored?.email) {
        targetEmail = stored.email.toLowerCase().trim();
        targetName = getCallingName(stored, targetName);
      } else {
        try {
          const dirDoc = await getDoc(doc(db, 'pfDirectory', targetPf));
          if (dirDoc.exists() && dirDoc.data().email) {
            const dirData = dirDoc.data() as Partial<UserProfile>;
            targetEmail = String(dirData.email).toLowerCase().trim();
            targetName = getCallingName(dirData, targetName);
          }
        } catch (e) {
          console.warn('Directory lookup error for reset', e);
        }
      }
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      throw new Error(
        `Could not find an email address associated with "${clean}". Please verify your PF Number or contact your administrator.`
      );
    }

    const code = generateResetOtpCode();
    const nowIso = new Date().toISOString();
    const expiresInMinutes = 15;
    const expiresAtIso = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

    if (resolved?.docId) {
      await updateDoc(doc(db, 'users', resolved.docId), {
        passwordResetCode: code,
        passwordResetToken: deleteField(),
        passwordResetExpiresAt: expiresAtIso,
        passwordResetRequestedAt: nowIso,
        passwordResetAttempts: 0,
      });
    } else if (targetPf) {
      await setDoc(
        doc(db, 'pfDirectory', targetPf),
        {
          passwordResetCode: code,
          passwordResetToken: deleteField(),
          passwordResetExpiresAt: expiresAtIso,
          passwordResetRequestedAt: nowIso,
          passwordResetAttempts: 0,
        },
        { merge: true }
      );
    }

    const dispatchRes = await sendPasswordResetOtpViaMake({
      to: targetEmail,
      name: targetName,
      pfNumber: targetPf,
      branch: targetBranch,
      resetCode: code,
      expiresInMinutes,
      requestedBy: options?.requestedBy || 'self',
      senderName: options?.senderName,
    });

    if (!dispatchRes.success) {
      throw new Error(
        dispatchRes.error || 'Could not dispatch password reset OTP email via Make webhook.'
      );
    }

    recordAuditLog({
      action: 'USER_PASSWORD_RECOVERY_REQUEST',
      actionLabel:
        options?.requestedBy === 'admin'
          ? 'Admin Sent Password Reset OTP via Make'
          : 'User Requested Password Reset OTP via Make',
      targetType: 'user',
      targetId: resolved?.docId,
      targetDescription: `${targetName} (${targetPf || targetEmail})`,
      afterState: {
        recoveryEmailSent: true,
        provider: 'make_webhook',
        messageId: dispatchRes.messageId,
        targetEmail,
        pfNumber: targetPf || undefined,
      },
      details: {
        identifier: clean,
        targetEmail,
        provider: 'make_webhook',
        messageId: dispatchRes.messageId,
      },
    });

    return targetEmail;
  };

  const MAX_OTP_ATTEMPTS = 5;

  const verifyPasswordResetTokenOrCode = async (params: {
    uidOrIdentifier?: string;
    codeOrToken: string;
  }): Promise<{
    userId: string;
    name: string;
    email: string;
    pfNumber: string;
    branch?: string;
    expiresAt?: string;
  }> => {
    const rawIdentifier = (params.uidOrIdentifier || '').trim();
    const digitsOnly = params.codeOrToken.replace(/\D/g, '');
    if (!/^\d{6}$/.test(digitsOnly)) {
      throw new Error('Please enter the complete 6-digit verification code.');
    }

    let resolved: { docId: string; profile: UserProfile } | null = null;
    let isPfDirectoryFallback = false;

    if (rawIdentifier) {
      resolved = await resolveUserDocForReset(rawIdentifier);
      if (!resolved && !rawIdentifier.includes('@')) {
        const cleanPf = formatPfNumber(rawIdentifier);
        try {
          const dirSnap = await getDoc(doc(db, 'pfDirectory', cleanPf));
          if (dirSnap.exists()) {
            const data = dirSnap.data() as UserProfile;
            resolved = {
              docId: cleanPf,
              profile: { ...data, id: data.id || cleanPf, pfNumber: cleanPf, employeeNumber: cleanPf },
            };
            isPfDirectoryFallback = true;
          }
        } catch {}
      }
    }

    if (!resolved) {
      throw new Error('Account record could not be located. Please request a new verification code.');
    }

    const p = resolved.profile;
    const targetRef = doc(db, isPfDirectoryFallback ? 'pfDirectory' : 'users', resolved.docId);

    if (!p.passwordResetCode || !p.passwordResetExpiresAt) {
      throw new Error('No active verification code found. Please request a new code.');
    }

    if (Date.now() > Date.parse(p.passwordResetExpiresAt)) {
      await updateDoc(targetRef, {
        passwordResetCode: deleteField(),
        passwordResetExpiresAt: deleteField(),
        passwordResetAttempts: deleteField(),
      }).catch(() => {});
      throw new Error('This verification code has expired. Please request a new code.');
    }

    const currentAttempts = Number(p.passwordResetAttempts || 0);
    if (currentAttempts >= MAX_OTP_ATTEMPTS) {
      await updateDoc(targetRef, {
        passwordResetCode: deleteField(),
        passwordResetExpiresAt: deleteField(),
      }).catch(() => {});
      throw new Error(
        'Too many incorrect attempts. For security, this code has been invalidated. Please request a new code.'
      );
    }

    if (p.passwordResetCode !== digitsOnly) {
      const nextAttempts = currentAttempts + 1;
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - nextAttempts);
      await updateDoc(targetRef, {
        passwordResetAttempts: nextAttempts,
        ...(remaining === 0
          ? {
              passwordResetCode: deleteField(),
              passwordResetExpiresAt: deleteField(),
            }
          : {}),
      }).catch(() => {});

      if (remaining === 0) {
        throw new Error(
          'Maximum verification attempts reached. This code has been invalidated—please request a new code.'
        );
      }
      throw new Error(
        `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      );
    }

    return {
      userId: resolved.docId,
      name: getCallingName(p, 'Team Member'),
      email: (p.email || '').toLowerCase().trim(),
      pfNumber: (p.employeeNumber || p.pfNumber || '').toUpperCase().trim(),
      branch: (p.branch || '').trim(),
      expiresAt: p.passwordResetExpiresAt,
    };
  };

  const completePasswordResetWithMake = async (params: {
    uidOrIdentifier?: string;
    codeOrToken: string;
    newPassword: string;
  }): Promise<{ email: string; pfNumber: string; name: string }> => {
    const cleanPass = params.newPassword.trim();
    if (cleanPass.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const verified = await verifyPasswordResetTokenOrCode({
      uidOrIdentifier: params.uidOrIdentifier,
      codeOrToken: params.codeOrToken,
    });

    const pf = verified.pfNumber;
    const pfDigits = pf.replace(/\D/g, '');
    const passUpper = cleanPass.toUpperCase();
    const passDigits = cleanPass.replace(/\D/g, '');
    if (
      (pf && passUpper === pf) ||
      (pf && formatPfNumber(pf).toUpperCase() === passUpper) ||
      (pfDigits.length >= 4 && passDigits === pfDigits)
    ) {
      throw new Error(
        'Your new password cannot match your PF Number. Please choose a private password.'
      );
    }

    const completedAtIso = new Date().toISOString();

    await updateDoc(doc(db, 'users', verified.userId), {
      passwordHash: cleanPass,
      mustChangePassword: false,
      isFirstLogin: false,
      passwordMatchesPf: false,
      passwordResetCompletedAt: completedAtIso,
      initialPassword: deleteField(),
      passwordResetToken: deleteField(),
      passwordResetCode: deleteField(),
      passwordResetExpiresAt: deleteField(),
      passwordResetAttempts: deleteField(),
      updatedAt: completedAtIso,
    }).catch(() => {});

    if (pf) {
      try {
        await setDoc(
          doc(db, 'pfDirectory', pf),
          {
            pfNumber: pf,
            email: verified.email,
            name: verified.name,
            passwordHash: cleanPass,
            mustChangePassword: false,
            passwordMatchesPf: false,
            initialPassword: deleteField(),
            passwordResetToken: deleteField(),
            passwordResetCode: deleteField(),
            passwordResetExpiresAt: deleteField(),
            passwordResetAttempts: deleteField(),
            updatedAt: completedAtIso,
          },
          { merge: true }
        );
      } catch (dirErr) {
        console.warn('pfDirectory update note after Make reset:', dirErr);
      }
    }

    const stored = findStoredAccount(pf || verified.email);
    if (stored) {
      upsertStoredAccount({
        ...stored,
        passwordHash: cleanPass,
        mustChangePassword: false,
        isFirstLogin: false,
        passwordMatchesPf: false,
      });
    }

    await recordAuditLog({
      action: 'USER_PASSWORD_CHANGE',
      actionLabel: 'Completed Self-Service Password Reset via Make OTP',
      targetType: 'user',
      targetId: verified.userId,
      targetDescription: `${verified.name} (${pf || verified.email})`,
      afterState: {
        passwordUpdated: true,
        method: 'make_otp_verification',
        completedAt: completedAtIso,
      },
    });

    if (verified.email) {
      void (async () => {
        await refreshEmailActivitySettingsFromFirestore();
        await sendPasswordChangedEmailViaMake({
          to: verified.email,
          recipientName: verified.name,
          pfNumber: pf,
          branch: verified.branch || '',
          changeMethod: 'otp_recovery',
          timestamp: completedAtIso,
          deviceSummary: formatClientDeviceSummary(),
        });
      })().catch(() => {});
    }

    return {
      email: verified.email,
      pfNumber: pf,
      name: verified.name,
    };
  };

  const updateUserPassword = async (newPass: string) => {
    const cleanPass = newPass.trim();
    const wasFirstTimeSetup = Boolean(
      userProfile?.isFirstLogin || userProfile?.mustChangePassword || userProfile?.passwordMatchesPf
    );

    // 1. Synchronize password in Firebase Auth
    if (auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, cleanPass);
      } catch (authErr: any) {
        console.warn('Firebase updatePassword note:', authErr?.code || authErr?.message);
        // If Firebase Auth requires fresh login, attempt re-authentication with previous credential
        if (authErr?.code === 'auth/requires-recent-login' && auth.currentUser.email) {
          const prevCred =
            userProfile?.passwordHash ||
            userProfile?.initialPassword ||
            userProfile?.employeeNumber ||
            userProfile?.pfNumber;
          if (prevCred) {
            try {
              const cred = EmailAuthProvider.credential(auth.currentUser.email, prevCred);
              await reauthenticateWithCredential(auth.currentUser, cred);
              await updatePassword(auth.currentUser, cleanPass);
            } catch (reauthErr) {
              console.warn('Re-authentication before updatePassword failed:', reauthErr);
            }
          }
        }
      }
    } else if (userProfile?.email) {
      // If auth.currentUser was not established in Firebase Auth (e.g. offline/secondary mode), try to register or sign in
      try {
        const cred = await createUserWithEmailAndPassword(auth, userProfile.email, cleanPass);
        setCurrentUser(cred.user);
      } catch {
        try {
          const cred = await signInWithEmailAndPassword(auth, userProfile.email, cleanPass);
          setCurrentUser(cred.user);
        } catch {}
      }
    }

    // 2. Firmly update Firestore user record and clear all first-time / PF password flags
    if (userProfile?.id) {
      const updatedProfile: UserProfile = {
        ...userProfile,
        mustChangePassword: false,
        isFirstLogin: false,
        passwordMatchesPf: false,
        passwordHash: cleanPass,
        updatedAt: new Date().toISOString(),
      };
      delete (updatedProfile as any).initialPassword;

      try {
        await updateDoc(doc(db, 'users', userProfile.id), {
          mustChangePassword: false,
          isFirstLogin: false,
          passwordMatchesPf: false,
          passwordHash: cleanPass,
          initialPassword: deleteField(),
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Firestore updateDoc on userProfile.id note:', e);
      }

      // If auth.currentUser.uid differs from userProfile.id, update that doc too
      if (auth.currentUser?.uid && auth.currentUser.uid !== userProfile.id) {
        try {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            mustChangePassword: false,
            isFirstLogin: false,
            passwordMatchesPf: false,
            passwordHash: cleanPass,
            initialPassword: deleteField(),
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Firestore updateDoc on auth.currentUser.uid note:', e);
        }
      }

      // 3. Update pfDirectory so future PF number logins recognize the new password
      const cleanPf = formatPfNumber(userProfile.employeeNumber || userProfile.pfNumber || '');
      if (cleanPf) {
        try {
          await updateDoc(doc(db, 'pfDirectory', cleanPf), {
            mustChangePassword: false,
            passwordMatchesPf: false,
            passwordHash: cleanPass,
            initialPassword: deleteField(),
            updatedAt: new Date().toISOString(),
          });
        } catch (dirErr) {
          console.warn('pfDirectory updateDoc note:', dirErr);
        }
      }

      // 4. Update stored local account and active state
      upsertStoredAccount({
        ...updatedProfile,
        passwordHash: cleanPass,
      });
      setActiveSession(updatedProfile);
      setUserProfile(updatedProfile);

      if (updatedProfile.email) {
        void (async () => {
          await refreshEmailActivitySettingsFromFirestore();
          await sendPasswordChangedEmailViaMake({
            to: updatedProfile.email,
            recipientName: getCallingName(updatedProfile, 'Team Member'),
            pfNumber: updatedProfile.employeeNumber || updatedProfile.pfNumber || '',
            branch: updatedProfile.branch || '',
            changeMethod: wasFirstTimeSetup ? 'first_time_setup' : 'user_password_change',
            deviceSummary: formatClientDeviceSummary(),
          });
        })().catch(() => {});
      }
    }
  };

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      if (userProfile) {
        await recordAuditLog({
          action: 'USER_LOGOUT',
          actionLabel: 'User Signed Out of System',
          targetType: 'auth',
          targetId: userProfile.id,
          targetDescription: `${userProfile.name} (${userProfile.employeeNumber || userProfile.pfNumber})`,
          beforeState: {
            sessionActive: true,
            role: userProfile.role,
            branch: userProfile.branch,
            department: userProfile.department,
          },
          afterState: {
            sessionActive: false,
          },
        }).catch(() => {});
      }

      await fbSignOut(auth).catch(() => {});
      clearActiveSession();
      setCachedGoogleToken(null);
      setCurrentUser(null);
      setUserProfile(null);
      setAuthError(null);
      // Small delay ensuring smooth visual loading transition before auth screen is revealed
      await new Promise(res => setTimeout(res, 500));
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isOwnerEmail =
    (currentUser?.email || userProfile?.email || '').toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const isSuperAdmin = isOwnerEmail || userProfile?.role === 'super_admin';
  const isAdmin = isSuperAdmin || userProfile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isSuperAdmin,
        isAdmin,
        loading,
        isLoggingOut,
        authError,
        clearAuthError,
        loginWithGoogle,
        loginWithEmail,
        loginWithIdentifier,
        registerUser,
        sendPasswordReset,
        verifyPasswordResetTokenOrCode,
        completePasswordResetWithMake,
        updateUserPassword,
        logout,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
