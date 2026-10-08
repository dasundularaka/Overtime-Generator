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

    // 3. Special case: Designated Bootstrap Admin first-time sign in
    if (isBootstrapAdmin) {
      const bootstrapProfile: UserProfile = {
        id: user.uid,
        email: userEmail,
        name: 'Administrator', // Real name for bootstrap admin
        role: 'admin',
        claimType: 'OT',
        employeeNumber: 'EMP-0001',
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

    // 4. USER IS NOT REGISTERED IN THE SYSTEM!
    // Reject login immediately and sign out!
    await fbSignOut(auth);
    throw new Error(
      `Access Denied: The email "${user.email || 'provided'}" is not registered in the system. Only administrators can create new user accounts. Please contact your system administrator.`
    );
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profile = await fetchProfile(user);
          setCurrentUser(user);
          setUserProfile(profile);
          setAuthError(null);
        } catch (e: any) {
          console.warn('Authentication rejected:', e.message);
          setCurrentUser(null);
          setUserProfile(null);
          setAuthError(e.message || 'Access Denied: Your email is not registered in the system.');
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUserProfile = async () => {
    if (auth.currentUser) {
      const p = await fetchProfile(auth.currentUser);
      setUserProfile(p);
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
    } catch (err: any) {
      await fbSignOut(auth);
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
    setLoading(true);
    setAuthError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const profile = await fetchProfile(cred.user);
      setCurrentUser(cred.user);
      setUserProfile(profile);
    } catch (err: any) {
      await fbSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      const msg = err.message || 'Authentication failed.';
      setAuthError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithIdentifier = async (identifier: string, pass: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const cleanId = identifier.trim();
      if (!cleanId) {
        throw new Error('Please enter your PF Number (Username) or email.');
      }
      if (!pass) {
        throw new Error('Please enter your password.');
      }

      let targetEmail = cleanId;

      if (!cleanId.includes('@')) {
        let cleanPf = cleanId.toUpperCase();
        if (!cleanPf.startsWith('PF') && /^[0-9A-Z]+$/.test(cleanPf)) {
          // If user typed numeric e.g. 1001, also try PF1001
        }
        let resolvedEmail: string | null = null;

        // 1. Direct doc lookup in pfDirectory (publicly readable index)
        try {
          const dirDoc = await getDoc(doc(db, 'pfDirectory', cleanPf));
          if (dirDoc.exists() && dirDoc.data().email) {
            resolvedEmail = dirDoc.data().email;
          }
        } catch (e) {
          console.warn('pfDirectory lookup check', e);
        }

        // 1b. If not found and doesn't start with PF, try with PF prefix
        if (!resolvedEmail && !cleanPf.startsWith('PF')) {
          try {
            const dirDocPf = await getDoc(doc(db, 'pfDirectory', `PF${cleanPf}`));
            if (dirDocPf.exists() && dirDocPf.data().email) {
              resolvedEmail = dirDocPf.data().email;
            }
          } catch {}
        }

        // 2. Try normalized (without hyphens or spaces)
        if (!resolvedEmail) {
          const noHyphen = cleanPf.replace(/[^A-Z0-9]/g, '');
          try {
            const dirDoc2 = await getDoc(doc(db, 'pfDirectory', noHyphen));
            if (dirDoc2.exists() && dirDoc2.data().email) {
              resolvedEmail = dirDoc2.data().email;
            }
          } catch {}
        }

        // 3. Fallback: Search in users collection by employeeNumber or pfNumber
        if (!resolvedEmail) {
          try {
            const q1 = query(collection(db, 'users'), where('employeeNumber', '==', cleanPf));
            const snap1 = await getDocs(q1);
            if (!snap1.empty && snap1.docs[0].data().email) {
              resolvedEmail = snap1.docs[0].data().email;
            } else {
              const pfWithPrefix = cleanPf.startsWith('PF') ? cleanPf : `PF${cleanPf}`;
              const q2 = query(collection(db, 'users'), where('employeeNumber', '==', pfWithPrefix));
              const snap2 = await getDocs(q2);
              if (!snap2.empty && snap2.docs[0].data().email) {
                resolvedEmail = snap2.docs[0].data().email;
              }
            }
          } catch (userQueryErr) {
            console.warn('Could not query users collection by employeeNumber', userQueryErr);
          }
        }

        if (resolvedEmail) {
          targetEmail = resolvedEmail;
          // Cache in pfDirectory for future instant lookups
          try {
            await setDoc(doc(db, 'pfDirectory', cleanPf), {
              pfNumber: cleanPf,
              email: resolvedEmail,
              updatedAt: new Date().toISOString(),
            });
          } catch {}
        } else {
          // Fallback to internal standard email format for this PF Number
          targetEmail = `${cleanPf.toLowerCase()}@otclaim.internal`;
        }
      }

      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, targetEmail.toLowerCase().trim(), pass);
      } catch (signInErr: any) {
        // If user account is registered in system but not yet initialized in Firebase Auth:
        if (
          signInErr.code === 'auth/user-not-found'
        ) {
          try {
            cred = await createUserWithEmailAndPassword(auth, targetEmail.toLowerCase().trim(), pass);
          } catch {
            throw signInErr;
          }
        } else {
          throw signInErr;
        }
      }

      const profile = await fetchProfile(cred.user);
      setCurrentUser(cred.user);
      setUserProfile(profile);
    } catch (err: any) {
      await fbSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      let msg = err.message || 'Authentication failed.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid PF Number or password. Note: Default first-time password is your PF Number. If you need a password reset, click "Forgot Password" or ask your administrator.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'No user account found with this PF Number. Please check the PF Number or contact your administrator.';
      }
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
    if (!clean.includes('@')) {
      const cleanPf = clean.toUpperCase();
      try {
        const dirDoc = await getDoc(doc(db, 'pfDirectory', cleanPf));
        if (dirDoc.exists() && dirDoc.data().email) {
          targetEmail = dirDoc.data().email;
        } else {
          const noHyphen = cleanPf.replace(/[^A-Z0-9]/g, '');
          const dirDoc2 = await getDoc(doc(db, 'pfDirectory', noHyphen));
          if (dirDoc2.exists() && dirDoc2.data().email) {
            targetEmail = dirDoc2.data().email;
          } else {
            // Check in users collection
            const q = query(collection(db, 'users'), where('employeeNumber', '==', cleanPf));
            const snap = await getDocs(q);
            if (!snap.empty && snap.docs[0].data().email) {
              targetEmail = snap.docs[0].data().email;
            }
          }
        }
      } catch (e) {
        console.warn('Directory lookup error for reset', e);
      }
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      throw new Error(`Could not find an email address associated with PF Number "${clean}". Please contact your administrator.`);
    }

    await sendPasswordResetEmail(auth, targetEmail.toLowerCase().trim());
    return targetEmail.toLowerCase().trim();
  };

  const updateUserPassword = async (newPass: string) => {
    if (!auth.currentUser) throw new Error('No active authenticated session.');
    await updatePassword(auth.currentUser, newPass);
    if (userProfile?.id) {
      await updateDoc(doc(db, 'users', userProfile.id), {
        mustChangePassword: false,
        isFirstLogin: false,
        updatedAt: new Date().toISOString(),
      });
      setUserProfile((prev) => (prev ? { ...prev, mustChangePassword: false, isFirstLogin: false } : null));
    }
  };

  const logout = async () => {
    await fbSignOut(auth);
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
