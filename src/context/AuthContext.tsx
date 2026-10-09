import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
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

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
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
  sendPasswordReset: (identifierOrEmail: string) => Promise<string>;
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
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = () => setAuthError(null);

  // Sync profile from Firestore with strict registration verification and real name preservation
  const fetchProfile = async (user: FirebaseUser): Promise<UserProfile> => {
    const userDocRef = doc(db, 'users', user.uid);
    const userEmail = (user.email || '').toLowerCase().trim();
    const isBootstrapAdmin = userEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

    // 1. Direct document check by UID
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      // Ensure bootstrap admin always has admin role
      if (isBootstrapAdmin && data.role !== 'admin') {
        await updateDoc(userDocRef, { role: 'admin' });
        data.role = 'admin';
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

          const linkedProfile: UserProfile = {
            ...preData,
            id: user.uid,
            name: realName, // Preserves real name from admin, never Google displayName!
            email: userEmail,
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

    // 2.5 Check stored accounts in localAuthManager
    const localAcc = findStoredAccount(userEmail) || (userEmail ? findStoredAccount(userEmail.split('@')[0]) : null);
    if (localAcc) {
      const linkedProfile: UserProfile = {
        ...localAcc,
        id: user.uid,
        email: userEmail,
        updatedAt: new Date().toISOString(),
      };
      try {
        await setDoc(userDocRef, sanitizeFirestoreData(linkedProfile));
      } catch (err) {
        console.warn('Could not sync local account to Firestore', err);
      }
      return linkedProfile;
    }

    // 3. Special case: Designated Bootstrap Admin first-time sign in
    if (isBootstrapAdmin) {
      const bootstrapProfile: UserProfile = {
        id: user.uid,
        email: userEmail,
        name: 'Administrator', // Real name for bootstrap admin
        role: 'admin',
        claimType: 'OT',
        employeeNumber: 'PF100000',
        pfNumber: 'PF100000',
        designation: 'System Administrator',
        branch: 'Head Office',
        department: 'IT & Infrastructure Operations',
        maxOtHoursPerDay: 2.0,
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

    // 4. Create standard user profile for newly registered users rather than kicking them out
    const cleanPf = formatPfNumber(user.displayName || 'PF' + Math.floor(100000 + Math.random() * 900000));
    const autoProfile: UserProfile = {
      id: user.uid,
      email: userEmail,
      name: user.displayName || 'Staff Member',
      role: 'user',
      claimType: 'OT',
      employeeNumber: cleanPf,
      pfNumber: cleanPf,
      designation: 'Staff Member',
      branch: 'Head Office',
      department: 'IT & Infrastructure Operations',
      maxOtHoursPerDay: 2.0,
      assignedTemplateIds: ['standard-official-template-v1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(userDocRef, sanitizeFirestoreData(autoProfile));
    } catch {}
    return autoProfile;
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

    // 2. Listen to Firebase auth state
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profile = await fetchProfile(user);
          setCurrentUser(user);
          setUserProfile(profile);
          setActiveSession(profile);
          setAuthError(null);
        } catch (e: any) {
          console.warn('Authentication rejected:', e.message);
          if (!savedSession) {
            clearActiveSession();
            setCurrentUser(null);
            setUserProfile(null);
            setAuthError(e.message || 'Access Denied: Your email is not registered in the system.');
          }
        }
      } else {
        if (!savedSession) {
          setCurrentUser(null);
          setUserProfile(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUserProfile = async () => {
    if (auth.currentUser) {
      try {
        const p = await fetchProfile(auth.currentUser);
        setUserProfile(p);
        setActiveSession(p);
        return;
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
      const profile = await fetchProfile(cred.user);
      setCurrentUser(cred.user);
      setUserProfile(profile);
      setActiveSession(profile);
    } catch (err: any) {
      await fbSignOut(auth).catch(() => {});
      clearActiveSession();
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
        employeeNumber: cleanPf,
        pfNumber: cleanPf,
        mustChangePassword: false,
        isFirstLogin: false,
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
      const cleanPf = isEmailInput ? '' : formatPfNumber(cleanId);
      let targetEmail = isEmailInput ? cleanId.toLowerCase() : '';
      let candidateProfile: UserProfile | null = null;
      let storedAccount = findStoredAccount(cleanId) || (cleanPf ? findStoredAccount(cleanPf) : null);

      if (storedAccount) {
        candidateProfile = storedAccount;
        targetEmail = storedAccount.email;
      }

      // If not in local cache or missing email, resolve from Firestore
      if (!candidateProfile && cleanPf) {
        try {
          const dirDoc = await getDoc(doc(db, 'pfDirectory', cleanPf));
          if (dirDoc.exists() && dirDoc.data().email) {
            targetEmail = dirDoc.data().email.toLowerCase().trim();
          }

          // Also look in users collection
          const q = query(collection(db, 'users'), where('employeeNumber', '==', cleanPf));
          const snap = await getDocs(q);
          if (!snap.empty) {
            candidateProfile = snap.docs[0].data() as UserProfile;
            targetEmail = candidateProfile.email.toLowerCase().trim();
          } else {
            // Also try with pfNumber
            const q2 = query(collection(db, 'users'), where('pfNumber', '==', cleanPf));
            const snap2 = await getDocs(q2);
            if (!snap2.empty) {
              candidateProfile = snap2.docs[0].data() as UserProfile;
              targetEmail = candidateProfile.email.toLowerCase().trim();
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
            candidateProfile = snap.docs[0].data() as UserProfile;
          }
        } catch {}
      }

      // 1. Attempt Firebase Auth sign-in if email is resolved
      let authUser: FirebaseUser | null = null;
      if (targetEmail && targetEmail.includes('@')) {
        try {
          const cred = await signInWithEmailAndPassword(auth, targetEmail, cleanPass);
          authUser = cred.user;
        } catch (fbErr: any) {
          console.warn('Firebase signIn note:', fbErr?.code);
        }
      }

      // 2. If Firebase Auth did not sign in (e.g. secondary account not in Auth yet, or offline):
      // Check stored password / default PF Number password
      if (!authUser) {
        if (!candidateProfile) {
          throw new Error(
            `No account found for "${cleanId}". Please check your PF Number or register a new account.`
          );
        }

        const isVerified =
          (storedAccount && verifyAccountPassword(storedAccount, cleanPass)) ||
          (cleanPf && cleanPass.toUpperCase() === cleanPf) || // Default first-time password is PF Number
          (candidateProfile.employeeNumber && cleanPass.toUpperCase() === formatPfNumber(candidateProfile.employeeNumber)) ||
          (candidateProfile.employeeNumber && cleanPass.toUpperCase() === candidateProfile.employeeNumber.toUpperCase());

        if (!isVerified) {
          throw new Error(
            'Invalid password. Note: Default first-time password is your PF Number (e.g. PF123456). If you forgot your password, click "Forgot Password".'
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
          finalProfile = await fetchProfile(authUser);
        } catch {
          finalProfile = candidateProfile || {
            id: authUser.uid,
            email: targetEmail,
            name: authUser.displayName || 'Staff Member',
            role: targetEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user',
            claimType: 'OT',
            employeeNumber: cleanPf || 'PF100000',
            pfNumber: cleanPf || 'PF100000',
            designation: 'Staff Member',
            branch: 'Head Office',
            department: 'IT & Infrastructure Operations',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      } else {
        finalProfile = candidateProfile!;
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

  const sendPasswordReset = async (identifierOrEmail: string): Promise<string> => {
    const clean = identifierOrEmail.trim();
    if (!clean) throw new Error('Please enter your PF Number or email.');

    let targetEmail = clean;
    const cleanPf = !clean.includes('@') ? formatPfNumber(clean) : '';
    if (cleanPf) {
      const stored = findStoredAccount(cleanPf);
      if (stored) {
        targetEmail = stored.email;
        upsertStoredAccount({
          ...stored,
          passwordHash: cleanPf,
          mustChangePassword: true,
        });
      } else {
        try {
          const dirDoc = await getDoc(doc(db, 'pfDirectory', cleanPf));
          if (dirDoc.exists() && dirDoc.data().email) {
            targetEmail = dirDoc.data().email;
          } else {
            const q = query(collection(db, 'users'), where('employeeNumber', '==', cleanPf));
            const snap = await getDocs(q);
            if (!snap.empty && snap.docs[0].data().email) {
              targetEmail = snap.docs[0].data().email;
            }
          }
        } catch (e) {
          console.warn('Directory lookup error for reset', e);
        }
      }
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      throw new Error(`Could not find an email address associated with PF Number "${clean}". Please contact your administrator.`);
    }

    await sendPasswordResetEmail(auth, targetEmail.toLowerCase().trim()).catch((e) => {
      console.warn('sendPasswordResetEmail note:', e);
    });
    return targetEmail.toLowerCase().trim();
  };

  const updateUserPassword = async (newPass: string) => {
    const cleanPass = newPass.trim();
    if (auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, cleanPass);
      } catch (e) {
        console.warn('Firebase updatePassword note:', e);
      }
    }

    if (userProfile?.id) {
      const updatedProfile: UserProfile = {
        ...userProfile,
        mustChangePassword: false,
        isFirstLogin: false,
        updatedAt: new Date().toISOString(),
      };

      try {
        await updateDoc(doc(db, 'users', userProfile.id), {
          mustChangePassword: false,
          isFirstLogin: false,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Firestore updateDoc note:', e);
      }

      upsertStoredAccount({
        ...updatedProfile,
        passwordHash: cleanPass,
      });
      setActiveSession(updatedProfile);
      setUserProfile(updatedProfile);
    }
  };

  const logout = async () => {
    await fbSignOut(auth).catch(() => {});
    clearActiveSession();
    setCurrentUser(null);
    setUserProfile(null);
    setAuthError(null);
  };

  const isBootstrapAdmin =
    (currentUser?.email || '').toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const isAdmin = isBootstrapAdmin || userProfile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isAdmin,
        loading,
        authError,
        clearAuthError,
        loginWithGoogle,
        loginWithEmail,
        loginWithIdentifier,
        registerUser,
        sendPasswordReset,
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
