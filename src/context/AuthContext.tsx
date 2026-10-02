import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { UserProfile, UserRole, ClaimType } from '../types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    pass: string,
    name: string,
    role?: UserRole,
    claimType?: ClaimType,
    dept?: string,
    branch?: string,
    maxOtHours?: number
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const BOOTSTRAP_ADMIN_EMAIL = 'dasundularaka@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync profile from Firestore
  const fetchProfile = async (user: FirebaseUser): Promise<UserProfile> => {
    const userDocRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userDocRef);
      const isBootstrapAdmin = (user.email || '').toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        // Ensure bootstrap admin always has admin role
        if (isBootstrapAdmin && data.role !== 'admin') {
          await updateDoc(userDocRef, { role: 'admin' });
          data.role = 'admin';
        }
        return data;
      } else {
        // Create initial profile
        const newProfile: UserProfile = {
          id: user.uid,
          email: user.email || '',
          name: user.displayName || user.email?.split('@')[0] || 'User',
          role: isBootstrapAdmin ? 'admin' : 'user',
          claimType: 'OT',
          employeeNumber: 'EMP-' + Math.floor(1000 + Math.random() * 9000),
          designation: isBootstrapAdmin ? 'Administrator' : 'Staff Member',
          branch: 'Head Office',
          department: 'IT & Infrastructure Operations',
          maxOtHoursPerDay: 2.0, // default 2 hours limit
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await setDoc(userDocRef, newProfile);

        // Also add to admins collection if bootstrap admin
        if (isBootstrapAdmin) {
          try {
            await setDoc(doc(db, 'admins', user.uid), {
              email: user.email,
              assignedAt: new Date().toISOString(),
            });
          } catch (e) {
            console.warn('Could not set admin marker doc', e);
          }
        }

        return newProfile;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const profile = await fetchProfile(user);
          setUserProfile(profile);
        } catch (e) {
          console.error('Error fetching user profile', e);
        }
      } else {
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
    try {
      await signInWithPopup(auth, googleProvider);
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (
    email: string,
    pass: string,
    name: string,
    role: UserRole = 'user',
    claimType: ClaimType = 'OT',
    dept: string = 'IT & Infrastructure Operations',
    branch: string = 'Head Office',
    maxOtHours: number = 2.0
  ) => {
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });

      const newProfile: UserProfile = {
        id: cred.user.uid,
        email: cred.user.email || email,
        name,
        role,
        claimType,
        employeeNumber: 'EMP-' + Math.floor(1000 + Math.random() * 9000),
        designation: role === 'admin' ? 'System Administrator' : 'Staff Member',
        branch,
        department: dept,
        maxOtHoursPerDay: maxOtHours,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      if (role === 'admin') {
        await setDoc(doc(db, 'admins', cred.user.uid), {
          email,
          assignedAt: new Date().toISOString(),
        });
      }
      setUserProfile(newProfile);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fbSignOut(auth);
    setUserProfile(null);
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
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
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
