import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Search,
  Shield,
  Clock,
  Building2,
  Briefcase,
  X,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Sparkles,
  FileText,
  Lock,
  Banknote,
  Calculator,
  KeyRound,
  Eye,
  EyeOff,
  Mail,
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { UserProfile, UserRole, ClaimType, TemplateConfig } from '../types';
import { useAuth } from '../context/AuthContext';
import { fetchTemplatesFromFirestore, subscribeToTemplates } from '../services/templateService';
import { DEFAULT_TEMPLATE } from '../utils/defaultTemplate';
import { ConfirmationModal } from './ConfirmationModal';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';
import { adminChangeUserPassword, adminSendUserPasswordResetEmail, adminCreateUserInAuth } from '../utils/adminAuthHelper';
import { sendUserWelcomeEmail, EmailDispatchResult } from '../utils/emailNotifier';
import { generateStandardPfNumber, formatPfNumber, isValidPfNumber } from '../utils/pfHelper';
import { upsertStoredAccount } from '../utils/localAuthManager';

export const UserManagement: React.FC = () => {
  const { currentUser, isAdmin, refreshUserProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'admin' | 'user'>('ALL');

  // Welcome Email Dispatched Modal
  const [welcomeEmailResult, setWelcomeEmailResult] = useState<EmailDispatchResult | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  // Templates list
  const [availableTemplates, setAvailableTemplates] = useState<TemplateConfig[]>([DEFAULT_TEMPLATE]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [claimType, setClaimType] = useState<ClaimType>('OT');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [designation, setDesignation] = useState('');
  const [branch, setBranch] = useState('Head Office');
  const [department, setDepartment] = useState('IT & Infrastructure Operations');
  const [maxOtHoursPerDay, setMaxOtHoursPerDay] = useState<number>(2.0);
  const [assignedTemplateIds, setAssignedTemplateIds] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number | ''>('');
  const [daysPay, setDaysPay] = useState<number | ''>('');
  const [totalRemuneration, setTotalRemuneration] = useState<number | ''>('');

  // Confirmation Modal State
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Password Management State
  const [passwordModalUser, setPasswordModalUser] = useState<UserProfile | null>(null);
  const [employeeNumberInput, setEmployeeNumberInput] = useState('');
  const [isResetPanelUnlocked, setIsResetPanelUnlocked] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isConfirmPasswordModalOpen, setIsConfirmPasswordModalOpen] = useState(false);
  const [pendingPasswordTarget, setPendingPasswordTarget] = useState<{
    type: 'employeeNumber' | 'custom' | 'email';
    passToSet?: string;
  } | null>(null);

  // Load templates from Cloud Firestore
  useEffect(() => {
    fetchTemplatesFromFirestore(true).then(tpls => {
      if (tpls && tpls.length > 0) setAvailableTemplates(tpls);
    });
    const unsub = subscribeToTemplates(tpls => {
      if (tpls && tpls.length > 0) setAvailableTemplates(tpls);
    });
    return () => unsub();
  }, []);

  // Fetch all users from Firestore
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach(d => {
        const u = d.data() as UserProfile;
        list.push({ ...u, id: u.id || d.id });
      });
      setUsers(list);

      // Background sync: ensure all users with a PF Number are indexed in pfDirectory
      for (const u of list) {
        const pf = (u.employeeNumber || u.pfNumber || '').trim().toUpperCase();
        if (pf && u.email) {
          setDoc(doc(db, 'pfDirectory', pf), {
            pfNumber: pf,
            email: u.email.toLowerCase().trim(),
            name: u.name,
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('user');
    setClaimType('OT');
    // Generate standard PF Number starting with PF and 6 digits (e.g. PF123456)
    setEmployeeNumber(generateStandardPfNumber());
    setDesignation('Staff Member');
    setBranch('Head Office');
    setDepartment('IT & Infrastructure Operations');
    setMaxOtHoursPerDay(2.0);
    setHourlyRate('');
    setDaysPay('');
    setTotalRemuneration('');
    // Default to primary template or all available
    const defTpl = availableTemplates.find(t => t.isDefault) || availableTemplates[0];
    setAssignedTemplateIds(defTpl ? [defTpl.id] : availableTemplates.map(t => t.id));
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setName(user.name);
    setEmail(user.email);
    setPassword('');
    setRole(user.role);
    setClaimType(user.claimType || 'OT');
    setEmployeeNumber(user.employeeNumber || user.pfNumber || '');
    setDesignation(user.designation || '');
    setBranch(user.branch || 'Head Office');
    setDepartment(user.department || 'IT & Infrastructure Operations');
    setMaxOtHoursPerDay(user.maxOtHoursPerDay !== undefined ? user.maxOtHoursPerDay : 2.0);
    setAssignedTemplateIds(user.assignedTemplateIds || []);
    setHourlyRate(user.hourlyRate !== undefined ? user.hourlyRate : '');
    setDaysPay(user.daysPay !== undefined ? user.daysPay : '');
    setTotalRemuneration(user.totalRemuneration !== undefined ? user.totalRemuneration : '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Please enter user name.');
      return;
    }

    if (!editingUser && !email.trim()) {
      setFormError('Please enter email address.');
      return;
    }

    // Normalize and validate PF Number (must start with PF)
    let cleanPf = employeeNumber.trim().toUpperCase();
    if (!cleanPf.startsWith('PF')) {
      cleanPf = 'PF' + cleanPf.replace(/^EMP[-_]?/i, '');
    }
    setEmployeeNumber(cleanPf);

    if (cleanPf.length < 3 || !/^PF[0-9A-Z_-]+$/i.test(cleanPf)) {
      setFormError('PF Number must start with "PF" (e.g. PF1001, PF002) and be valid.');
      return;
    }

    // Open confirmation dialog before saving
    setIsConfirmSaveModalOpen(true);
  };

  const confirmCommitSaveUser = async () => {
    setIsSavingUser(true);
    setFormError(null);

    try {
      let cleanPf = formatPfNumber(employeeNumber);
      if (!isValidPfNumber(cleanPf)) {
        cleanPf = 'PF' + cleanPf.replace(/^PF/i, '').padStart(6, '0').slice(-6);
      }

      if (editingUser) {
        // Update existing user profile in Firestore
        const userRef = doc(db, 'users', editingUser.id);
        const updatedData: Record<string, any> = {
          name: name.trim(),
          role,
          claimType,
          employeeNumber: cleanPf,
          pfNumber: cleanPf,
          designation: designation.trim(),
          branch: branch.trim(),
          department: department.trim(),
          maxOtHoursPerDay: Number(maxOtHoursPerDay) || 0,
          assignedTemplateIds: assignedTemplateIds || [],
          updatedAt: new Date().toISOString(),
        };

        // Use deleteField() if empty, or number if provided
        if (hourlyRate !== '' && !isNaN(Number(hourlyRate))) {
          updatedData.hourlyRate = Number(hourlyRate);
        } else {
          updatedData.hourlyRate = deleteField();
        }

        if (daysPay !== '' && !isNaN(Number(daysPay))) {
          updatedData.daysPay = Number(daysPay);
        } else {
          updatedData.daysPay = deleteField();
        }

        if (totalRemuneration !== '' && !isNaN(Number(totalRemuneration))) {
          updatedData.totalRemuneration = Number(totalRemuneration);
        } else {
          updatedData.totalRemuneration = deleteField();
        }

        const cleanUpdated = sanitizeFirestoreData(updatedData);
        await updateDoc(userRef, cleanUpdated);

        upsertStoredAccount({
          ...editingUser,
          ...updatedData,
        } as UserProfile);

        // Sync to pfDirectory
        try {
          await setDoc(doc(db, 'pfDirectory', cleanPf), {
            pfNumber: cleanPf,
            email: editingUser.email.toLowerCase().trim(),
            name: name.trim(),
            updatedAt: new Date().toISOString(),
          });
        } catch (dirErr) {
          console.warn('pfDirectory update error', dirErr);
        }

        // Update admin marker collection
        if (role === 'admin') {
          await setDoc(doc(db, 'admins', editingUser.id), {
            email: editingUser.email,
            assignedAt: new Date().toISOString(),
          });
        } else {
          try {
            await deleteDoc(doc(db, 'admins', editingUser.id));
          } catch {
            // ignore if doesn't exist
          }
        }

        if (currentUser && currentUser.uid === editingUser.id && refreshUserProfile) {
          try {
            await refreshUserProfile();
          } catch (profileErr) {
            console.warn('Could not refresh auth profile', profileErr);
          }
        }

        setActionSuccess(`User ${name} updated successfully!`);
      } else {
        // Create new user profile in Firebase Auth and Firestore
        const cleanEmail = email.trim().toLowerCase();
        let targetUid = 'usr_' + Date.now();

        // 1. Create account in Firebase Auth with initial password = PF Number
        try {
          const authRes = await adminCreateUserInAuth(cleanEmail, cleanPf);
          if (authRes.uid) {
            targetUid = authRes.uid;
          }
        } catch (createAuthErr: any) {
          console.warn('adminCreateUserInAuth note:', createAuthErr?.message);
        }

        // 2. Create user profile in Firestore
        const newProfile: Record<string, any> = {
          id: targetUid,
          name: name.trim(),
          email: cleanEmail,
          role,
          claimType,
          employeeNumber: cleanPf,
          pfNumber: cleanPf,
          mustChangePassword: true,
          isFirstLogin: true,
          designation: designation.trim(),
          branch: branch.trim(),
          department: department.trim(),
          maxOtHoursPerDay: Number(maxOtHoursPerDay) || 0,
          assignedTemplateIds: assignedTemplateIds || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (hourlyRate !== '' && !isNaN(Number(hourlyRate))) {
          newProfile.hourlyRate = Number(hourlyRate);
        }
        if (daysPay !== '' && !isNaN(Number(daysPay))) {
          newProfile.daysPay = Number(daysPay);
        }
        if (totalRemuneration !== '' && !isNaN(Number(totalRemuneration))) {
          newProfile.totalRemuneration = Number(totalRemuneration);
        }

        const cleanNewProfile = sanitizeFirestoreData(newProfile);
        await setDoc(doc(db, 'users', targetUid), cleanNewProfile);

        upsertStoredAccount({
          ...(newProfile as UserProfile),
          passwordHash: cleanPf,
        });

        // 3. Register in pfDirectory for username lookup
        try {
          await setDoc(doc(db, 'pfDirectory', cleanPf), {
            pfNumber: cleanPf,
            email: cleanEmail,
            name: name.trim(),
            createdAt: new Date().toISOString(),
          });
        } catch (dirErr) {
          console.warn('pfDirectory write note:', dirErr);
        }

        if (role === 'admin') {
          await setDoc(doc(db, 'admins', targetUid), {
            email: cleanNewProfile.email,
            assignedAt: new Date().toISOString(),
          });
        }

        // 4. Send Welcome Credentials Email
        const emailDispatch = await sendUserWelcomeEmail({
          email: cleanEmail,
          name: name.trim(),
          pfNumber: cleanPf,
          initialPassword: cleanPf,
          loginUrl: 'https://otclaim.vercel.app/',
        });

        setWelcomeEmailResult(emailDispatch);
        setIsEmailModalOpen(true);
        setActionSuccess(`New user ${name} created with PF Number ${cleanPf}! Credentials email prepared.`);
      }

      setIsConfirmSaveModalOpen(false);
      setIsModalOpen(false);
      fetchUsers();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error saving user', err);
      setFormError(err.message || 'Failed to save user.');
      setIsConfirmSaveModalOpen(false);
    } finally {
      setIsSavingUser(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      try {
        await deleteDoc(doc(db, 'admins', userToDelete.id));
      } catch {}
      setActionSuccess(`User "${userToDelete.name}" deleted successfully.`);
      setUserToDelete(null);
      fetchUsers();
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setFormError('Failed to delete user: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeletingUser(false);
    }
  };

  const openPasswordModal = (user: UserProfile) => {
    setPasswordModalUser(user);
    setEmployeeNumberInput('');
    setIsResetPanelUnlocked(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setShowPasswordText(false);
    setPasswordError(null);
    setPasswordSuccess(null);
  };

  const handleUnlockResetPanel = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passwordModalUser) return;
    setPasswordError(null);

    const entered = employeeNumberInput.trim().toUpperCase();
    const targetEmpNo = (passwordModalUser.employeeNumber || '').trim().toUpperCase();

    if (!entered) {
      setPasswordError('Please enter the employee number to unlock the password reset panel.');
      return;
    }

    if (entered !== targetEmpNo) {
      setPasswordError(`The entered employee number does not match (${passwordModalUser.employeeNumber}).`);
      return;
    }

    setIsResetPanelUnlocked(true);
    setPasswordSuccess('Identity verified! Password reset panel is now unlocked.');
  };

  const handlePromptSetEmployeeNumberPassword = () => {
    if (!passwordModalUser) return;
    setPendingPasswordTarget({
      type: 'employeeNumber',
      passToSet: passwordModalUser.employeeNumber || '123456',
    });
    setIsConfirmPasswordModalOpen(true);
  };

  const handlePromptApplyCustomPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;
    setPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPendingPasswordTarget({
      type: 'custom',
      passToSet: newPassword,
    });
    setIsConfirmPasswordModalOpen(true);
  };

  const handlePromptSendResetEmail = () => {
    if (!passwordModalUser) return;
    setPendingPasswordTarget({
      type: 'email',
    });
    setIsConfirmPasswordModalOpen(true);
  };

  const confirmExecutePasswordAction = async () => {
    if (!passwordModalUser || !pendingPasswordTarget) return;
    setIsSubmittingPassword(true);
    setPasswordError(null);

    try {
      if (pendingPasswordTarget.type === 'email') {
        await adminSendUserPasswordResetEmail(passwordModalUser.email);
        setPasswordSuccess(`A secure password reset link has been dispatched to ${passwordModalUser.email}!`);
      } else {
        const passToSet = pendingPasswordTarget.passToSet || passwordModalUser.employeeNumber;
        const res = await adminChangeUserPassword(
          passwordModalUser.email,
          passToSet,
          passwordModalUser.employeeNumber
        );
        upsertStoredAccount({
          ...passwordModalUser,
          passwordHash: passToSet,
        });
        setPasswordSuccess(res.message);
      }
      setIsConfirmPasswordModalOpen(false);
    } catch (err: any) {
      console.error('Password operation failed', err);
      setPasswordError(err.message || 'Failed to update user password.');
      setIsConfirmPasswordModalOpen(false);
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                User &amp; Overtime Limit Management
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Admin Exclusive
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Create employees, assign roles (Admin/User), set claim type (OT/OP), and configure individual daily overtime caps.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New User</span>
          </button>
        </div>

        {actionSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Filters */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search user by name, email, PF Number, department..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as any)}
            className="rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Roles</option>
            <option value="admin">Administrators Only</option>
            <option value="user">Standard Users Only</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading user profiles...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No users found</h3>
            <p className="text-xs text-slate-500 mt-1">
              Add your company&apos;s first user profile to assign roles and overtime limits.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-slate-50 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">User &amp; PF Number (Username)</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Claim Type</th>
                  <th className="py-3 px-4">Assigned Templates</th>
                  <th className="py-3 px-4">Department &amp; Branch</th>
                  <th className="py-3 px-4">Hourly Rate &amp; Day's Pay</th>
                  <th className="py-3 px-4 text-center">Max OT Limit (Day)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.map(u => {
                  const isCurrent = u.id === currentUser?.uid;
                  const pfNum = (u.employeeNumber || u.pfNumber || '').toUpperCase();
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* User */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-700 text-xs">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isCurrent && (
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>{u.email}</span>
                              <span>&bull;</span>
                              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                {pfNum || 'No PF'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role === 'admin' && <Shield className="w-3 h-3 text-purple-600" />}
                          <span className="capitalize">{u.role}</span>
                        </span>
                      </td>

                      {/* Claim Type (OT = Overtime, OP = Out of Pocket) */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                            u.claimType === 'OP'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {u.claimType === 'OP' ? 'OP (Out of Pocket)' : 'OT (Overtime)'}
                        </span>
                      </td>

                      {/* Assigned Templates */}
                      <td className="py-3.5 px-4">
                        {u.assignedTemplateIds && u.assignedTemplateIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {u.assignedTemplateIds.map(tId => {
                              const tpl = availableTemplates.find(t => t.id === tId);
                              return (
                                <span
                                  key={tId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold"
                                  title={tpl?.name || tId}
                                >
                                  <FileText className="w-2.5 h-2.5" />
                                  <span className="truncate max-w-[120px]">{tpl?.name || tId}</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">All Templates</span>
                        )}
                      </td>

                      {/* Department & Branch */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{u.department}</div>
                        <div className="text-[11px] text-slate-400">{u.branch}</div>
                      </td>

                      {/* Hourly Rate & Day's Pay */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 font-mono">
                          {u.hourlyRate ? `Rs. ${u.hourlyRate.toFixed(2)}/h` : <span className="text-slate-400 font-normal italic">Default rate</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {u.daysPay ? `Day: Rs. ${u.daysPay.toFixed(2)}` : ''}
                        </div>
                      </td>

                      {/* OT Limit */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold font-mono text-xs">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{u.maxOtHoursPerDay !== undefined ? `${u.maxOtHoursPerDay} hrs` : '2.0 hrs'}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openPasswordModal(u)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title="Change User Password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Edit User &amp; Overtime Limit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setUserToDelete(u)}
                            disabled={isCurrent}
                            className={`p-1.5 rounded-lg transition ${
                              isCurrent
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">
                {editingUser ? `Edit User: ${editingUser.name}` : 'Create New User Profile'}
              </h2>
              <p className="text-xs text-slate-500">
                Set employee particulars, role privileges, and assigned maximum overtime limits.
              </p>
            </div>

            {formError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 flex-1 overflow-y-auto pr-1 space-y-3.5 text-xs">
              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Dasun Ramasingha"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="staff@company.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 disabled:bg-slate-100 disabled:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Role & Claim Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">System Role</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-slate-300 py-2 px-2.5 bg-white text-slate-800 font-semibold"
                  >
                    <option value="user">User (Enters own claims)</option>
                    <option value="admin">Admin (All claims &amp; Template)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Claim Type</label>
                  <select
                    value={claimType}
                    onChange={e => setClaimType(e.target.value as ClaimType)}
                    className="w-full rounded-xl border border-slate-300 py-2 px-2.5 bg-white text-slate-800 font-semibold"
                  >
                    <option value="OT">OT - Overtime</option>
                    <option value="OP">OP - Out of Pocket</option>
                  </select>
                </div>
              </div>

              {/* Assigned Overtime Templates (Multi-Select) */}
              <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-700" />
                    <span className="font-bold text-indigo-950 text-xs">
                      Assigned Form Templates ({assignedTemplateIds.length} Selected)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setAssignedTemplateIds(availableTemplates.map(t => t.id))}
                      className="text-indigo-700 hover:text-indigo-900 font-bold underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setAssignedTemplateIds([])}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-indigo-900/80">
                  Select which templates this employee can use (e.g. <strong>Overtime Sheet</strong>). Admins can assign multiple templates to a user. After assigning, this user cannot access or use any other templates.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1.5 bg-white rounded-xl border border-indigo-200">
                  {availableTemplates.map(tpl => {
                    const isSelected = assignedTemplateIds.includes(tpl.id);
                    return (
                      <label
                        key={tpl.id}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition select-none ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-semibold shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              setAssignedTemplateIds(prev => [...prev, tpl.id]);
                            } else {
                              setAssignedTemplateIds(prev => prev.filter(id => id !== tpl.id));
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-0.5"
                        />
                        <div className="flex-1 truncate">
                          <span className="block truncate font-medium">{tpl.name}</span>
                          {tpl.isDefault && (
                            <span className="text-[9px] text-amber-600 font-semibold block">★ Default Form</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Overtime Limit per Day (CRITICAL REQUIREMENT) */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-700" />
                    <span className="font-bold text-emerald-950 text-xs">
                      Assigned Overtime Limit (Hours / Day)
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-800 text-sm">
                    {maxOtHoursPerDay} hrs max
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800/80 mb-2">
                  System strictly caps calculated daily overtime to this maximum limit. Example: if assigned 2hrs limit, overtime generated will not exceed 2 hours.
                </p>
                <div className="flex items-center gap-2">
                  {[1.0, 1.5, 2.0, 2.5, 3.0, 4.0].map(hrs => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setMaxOtHoursPerDay(hrs)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        maxOtHoursPerDay === hrs
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                      }`}
                    >
                      {hrs}h
                    </button>
                  ))}
                  <div className="flex-1 flex items-center gap-1 ml-2">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="12"
                      value={maxOtHoursPerDay}
                      onChange={e => setMaxOtHoursPerDay(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-emerald-300 bg-white px-2 py-1 font-mono text-center"
                    />
                    <span className="text-[10px] text-emerald-900">hrs</span>
                  </div>
                </div>
              </div>

              {/* Department & Branch Custom Texts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Department</label>
                    <span className="text-[10px] text-indigo-600 font-semibold">Custom Text</span>
                  </div>
                  <input
                    type="text"
                    list="user-department-suggestions"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="e.g. IT Operations & Infrastructure"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <datalist id="user-department-suggestions">
                    <option value="IT Operations & Infrastructure" />
                    <option value="Corporate Banking Division" />
                    <option value="Credit & Risk Management" />
                    <option value="Treasury & Foreign Exchange" />
                    <option value="Retail Banking & Branches" />
                    <option value="Finance & Accounts" />
                    <option value="Human Resources Division" />
                    <option value="Operations & Logistics" />
                    <option value="Engineering & Facilities" />
                  </datalist>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Branch</label>
                    <span className="text-[10px] text-indigo-600 font-semibold">Custom Text</span>
                  </div>
                  <input
                    type="text"
                    list="user-branch-suggestions"
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    placeholder="e.g. Head Office - Colombo"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <datalist id="user-branch-suggestions">
                    <option value="Head Office - Colombo" />
                    <option value="BOC Colombo Main Branch" />
                    <option value="Corporate Branch" />
                    <option value="Regional Colombo" />
                    <option value="Kandy Super Grade Branch" />
                    <option value="Galle Fort Branch" />
                    <option value="Kurunegala City Branch" />
                    <option value="Logistics Hub" />
                  </datalist>
                </div>
              </div>

              {/* PF Number & Designation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">
                      PF Number (Username) <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-indigo-600 font-semibold font-mono">Must start with PF</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={employeeNumber}
                    onChange={e => setEmployeeNumber(e.target.value)}
                    placeholder="e.g. PF1001"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Staff login username and initial default password
                  </span>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={e => setDesignation(e.target.value)}
                    placeholder="e.g. Senior Technical Officer"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800"
                  />
                </div>
              </div>

              {/* Hourly OT Rate & Days Payment of OT Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-900 text-xs">
                      Default Overtime Rates (Form 10756 Remuneration)
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">
                    Auto-Applied on Claims
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                      Total Remuneration (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={totalRemuneration}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                        setTotalRemuneration(val);
                        if (typeof val === 'number' && val > 0) {
                          // Standard bank salary calculation formula (22 days * 8 hours = 176 work hours per month)
                          const calculatedRate = parseFloat((val / 176).toFixed(2));
                          const calculatedDaysPay = parseFloat((val / 22).toFixed(2));
                          setHourlyRate(calculatedRate);
                          setDaysPay(calculatedDaysPay);
                        }
                      }}
                      placeholder="e.g. 85000.00"
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-slate-800 font-mono text-xs bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Basic Salary Book
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700 text-[11px]">
                        Hourly OT Rate (Rs.)
                      </label>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={hourlyRate}
                      onChange={e => setHourlyRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="e.g. 482.95"
                      className="w-full rounded-xl border border-indigo-300 bg-indigo-50/30 px-3 py-1.5 text-slate-900 font-mono font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Printed on Form 10756
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                      Days Payment of OT (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={daysPay}
                      onChange={e => setDaysPay(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="e.g. 3863.64"
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-slate-800 font-mono text-xs bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Day's Pay rate
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs transition"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modern Confirmation Modal for Delete User */}
      <ConfirmationModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={confirmDeleteUser}
        title="Delete User Account"
        message={`Are you sure you want to permanently delete the user account for "${userToDelete?.name}"? All assigned template preferences and limits will be removed.`}
        confirmText="Delete User"
        cancelText="Keep Account"
        variant="danger"
        isLoading={isDeletingUser}
        details={userToDelete ? [
          { label: 'Employee Name', value: userToDelete.name },
          { label: 'Email Address', value: userToDelete.email },
          { label: 'Employee ID', value: userToDelete.employeeNumber || '-' },
          { label: 'Daily OT Cap', value: `${userToDelete.maxOtHoursPerDay || 2.0} hrs` },
        ] : []}
      />

      {/* Confirmation Modal for Add / Edit User */}
      <ConfirmationModal
        isOpen={isConfirmSaveModalOpen}
        onClose={() => setIsConfirmSaveModalOpen(false)}
        onConfirm={confirmCommitSaveUser}
        title={editingUser ? 'Save User Profile Changes' : 'Confirm New User Creation'}
        message={
          editingUser
            ? `Are you sure you want to save modifications to the profile of "${name}"?`
            : `Are you sure you want to register and provision this new user account for "${name}" (${email})?`
        }
        confirmText={editingUser ? 'Save Changes' : 'Create User'}
        cancelText="Review Form"
        variant="info"
        isLoading={isSavingUser}
        details={[
          { label: 'Full Name', value: name },
          { label: 'Account Email', value: email },
          { label: 'Role', value: role === 'admin' ? 'Administrator' : 'Standard User' },
          { label: 'Department', value: department },
          { label: 'Branch', value: branch },
          { label: 'Daily OT Cap', value: `${maxOtHoursPerDay} hrs/day` },
          { label: 'Claim Type', value: claimType },
        ]}
      />

      {/* Admin Change Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto flex flex-col">
            <button
              onClick={() => setPasswordModalUser(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Change Password: {passwordModalUser.name}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Employee No: <span className="font-mono font-bold text-slate-700">{passwordModalUser.employeeNumber}</span> &bull; {passwordModalUser.email}
                  </p>
                </div>
              </div>
            </div>

            {passwordError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Option 1: Quick set to PF Number */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">Option A: Use PF Number as Password</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                    Quick Reset
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Directly configure <strong>{passwordModalUser.employeeNumber}</strong> as the sign-in password for this employee.
                </p>
                <button
                  type="button"
                  onClick={handlePromptSetEmployeeNumberPassword}
                  className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Set Password to PF Number ({passwordModalUser.employeeNumber})</span>
                </button>
              </div>

              {/* Option 2: Enter PF number to unlock custom reset panel */}
              {!isResetPanelUnlocked ? (
                <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-3">
                  <span className="font-bold text-slate-800 text-xs block">Option B: Unlock Password Reset Panel</span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Enter the user's PF number below to access the password reset panel to change their password.
                  </p>
                  <form onSubmit={handleUnlockResetPanel} className="space-y-2">
                    <input
                      type="text"
                      value={employeeNumberInput}
                      onChange={e => setEmployeeNumberInput(e.target.value)}
                      placeholder={`Enter PF number (e.g. ${passwordModalUser.employeeNumber})`}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 font-mono font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Verify PF Number &amp; Unlock Reset Panel</span>
                    </button>
                  </form>
                </div>
              ) : (
                /* Unlocked Password Reset Panel */
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3 animate-scale-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Password Reset Panel (Unlocked)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      Verified
                    </span>
                  </div>

                  <form onSubmit={handlePromptApplyCustomPassword} className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold text-slate-700 text-[11px]">New Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewPassword(passwordModalUser.employeeNumber);
                            setConfirmNewPassword(passwordModalUser.employeeNumber);
                          }}
                          className="text-[10px] text-indigo-600 hover:underline font-semibold"
                        >
                          Fill Employee No
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPasswordText ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswordText(!showPasswordText)}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                        >
                          {showPasswordText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1 text-[11px]">Confirm New Password</label>
                      <input
                        type={showPasswordText ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={e => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition cursor-pointer text-center shadow-xs"
                      >
                        Apply New Password
                      </button>
                      <button
                        type="button"
                        onClick={handlePromptSendResetEmail}
                        className="py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition cursor-pointer text-center"
                      >
                        Send Reset Link Email
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Password Changes */}
      <ConfirmationModal
        isOpen={isConfirmPasswordModalOpen}
        onClose={() => setIsConfirmPasswordModalOpen(false)}
        onConfirm={confirmExecutePasswordAction}
        title={
          pendingPasswordTarget?.type === 'email'
            ? 'Dispatch Password Reset Email'
            : pendingPasswordTarget?.type === 'employeeNumber'
            ? 'Set Password to PF Number'
            : 'Update User Password'
        }
        message={
          pendingPasswordTarget?.type === 'email'
            ? `Send an official password reset email link to "${passwordModalUser?.email}"?`
            : pendingPasswordTarget?.type === 'employeeNumber'
            ? `Set the sign-in password for "${passwordModalUser?.name}" to their PF Number "${passwordModalUser?.employeeNumber}"?`
            : `Are you sure you want to apply the new custom password for "${passwordModalUser?.name}" (${passwordModalUser?.email})?`
        }
        confirmText="Confirm Password Update"
        cancelText="Cancel"
        variant="warning"
        isLoading={isSubmittingPassword}
        details={passwordModalUser ? [
          { label: 'Employee Name', value: passwordModalUser.name },
          { label: 'PF Number (Username)', value: passwordModalUser.employeeNumber },
          { label: 'Email Address', value: passwordModalUser.email },
          ...(pendingPasswordTarget?.passToSet ? [{ label: 'New Password', value: '••••••••' }] : []),
        ] : []}
      />

      {/* Welcome Credentials Email Dispatched Modal */}
      {isEmailModalOpen && welcomeEmailResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    User Created &amp; Credentials Email Prepared
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Official notification for newly created staff account
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Login Details Dispatched:</p>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    User can log in at <strong className="underline">https://otclaim.vercel.app/</strong> using their <strong>PF Number</strong> and initial password. They will be prompted to reset their password upon first sign-in.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Email Content (Sent to Employee)
                </label>
                <pre className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto border border-slate-800 selection:bg-indigo-500">
                  {welcomeEmailResult.body}
                </pre>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <a
                  href={welcomeEmailResult.mailtoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-600" />
                  <span>Open in Mail Client</span>
                </a>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(welcomeEmailResult.body);
                      setActionSuccess('Email content copied to clipboard!');
                      setTimeout(() => setActionSuccess(null), 2500);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    Copy Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEmailModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
