import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  X,
  Building2,
  Briefcase,
  Hash,
  Star,
  Banknote,
  Shield,
  User,
  Filter,
  Clock,
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Employee, UserProfile, Branch, RoleRate, Department } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatPfNumber } from '../utils/pfHelper';
import { deleteStoredAccount } from '../utils/localAuthManager';
import {
  getEmployees,
  saveEmployee,
  deleteEmployee,
  getSettings,
  saveSettings,
} from '../utils/storage';
import {
  fetchBranchesFromFirestore,
  subscribeToBranches,
  fetchRoleRatesFromFirestore,
  subscribeToRoleRates,
  fetchDepartmentsFromFirestore,
  subscribeToDepartments,
} from '../utils/branchRoleManager';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';
import { SearchableBranchSelect } from './SearchableBranchSelect';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';

export const EmployeeManager: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(getSettings());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTabFilter, setActiveTabFilter] = useState<'ALL' | 'users' | 'admins'>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Branches, Roles & Departments from database
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roleRates, setRoleRates] = useState<RoleRate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [designation, setDesignation] = useState('');
  const [branch, setBranch] = useState(userProfile?.branch || 'Head Office - Colombo');
  const [branchCode, setBranchCode] = useState('');
  const [department, setDepartment] = useState(settings.defaultDepartment || 'IT & Infrastructure Operations');
  const [hourlyRate, setHourlyRate] = useState<number | ''>('');
  const [daysPay, setDaysPay] = useState<number | ''>('');
  const [hourlyRateNonWorkingDays, setHourlyRateNonWorkingDays] = useState<number | ''>('');
  const [totalRemuneration, setTotalRemuneration] = useState<number | ''>('');
  const [roleId, setRoleId] = useState<string>('');
  const [shiftStartTime, setShiftStartTime] = useState<string>('08:00');
  const [shiftEndTime, setShiftEndTime] = useState<string>('16:45');

  // Delete Confirmation State
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);

  // Fetch employees and users - strictly real Firestore database data
  const loadEmployeesAndUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: Employee[] = [];
      snap.forEach(d => {
        const u = d.data() as UserProfile;
        list.push({
          id: u.id || d.id,
          name: u.name,
          employeeNumber: u.employeeNumber || u.pfNumber || 'PF000000',
          pfNumber: u.pfNumber,
          designation: u.designation || 'Staff Member',
          branch: u.branch || 'Head Office - Colombo',
          branchCode: u.branchCode,
          roleId: u.roleId,
          department: u.department || 'Operations',
          hourlyRate: u.hourlyRate,
          daysPay: u.daysPay,
          hourlyRateNonWorkingDays: u.hourlyRateNonWorkingDays,
          totalRemuneration: u.totalRemuneration,
          claimType: u.claimType,
          shiftStartTime: u.shiftStartTime || '08:00',
          shiftEndTime: u.shiftEndTime || '16:45',
          maxOtHoursPerDay: u.maxOtHoursPerDay,
          assignedTemplateIds: u.assignedTemplateIds,
          email: u.email,
          photoURL: u.photoURL,
          role: u.role || 'user',
          createdAt: u.createdAt || new Date().toISOString(),
        });
      });

      // Pure real database data only - no local resurrecting
      setEmployees(list);
    } catch (e) {
      console.warn('Could not load from Firestore', e);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeesAndUsers();

    fetchBranchesFromFirestore().then(b => setBranches(b));
    const unsubBranches = subscribeToBranches(b => setBranches(b));

    fetchRoleRatesFromFirestore().then(r => setRoleRates(r));
    const unsubRoles = subscribeToRoleRates(r => setRoleRates(r));

    fetchDepartmentsFromFirestore().then(d => setDepartments(d));
    const unsubDepts = subscribeToDepartments(d => setDepartments(d));

    return () => {
      unsubBranches();
      unsubRoles();
      unsubDepts();
    };
  }, []);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setName('');
    setEmployeeNumber('');
    const firstRole = roleRates.length > 0 ? roleRates[0] : null;
    const initialDesignation = firstRole ? firstRole.name : 'Staff Member';
    setDesignation(initialDesignation);
    setRoleId(firstRole ? firstRole.id : '');
    const userBranch = userProfile?.branch || (branches.length > 0 ? branches[0].name : 'Head Office - Colombo');
    setBranch(userBranch);
    const foundBranch = branches.find(b => b.name === userBranch);
    setBranchCode(foundBranch ? foundBranch.branchCode : '');
    if (firstRole?.department) {
      setDepartment(firstRole.department);
    } else {
      setDepartment(departments.length > 0 ? departments[0].name : 'IT & Infrastructure Operations');
    }
    if (firstRole) {
      setHourlyRate(firstRole.hourlyRateWorkingDays);
      setDaysPay(firstRole.daysPaymentNonWorkingDays);
      setHourlyRateNonWorkingDays(firstRole.hourlyRateNonWorkingDays);
    } else {
      setHourlyRate('');
      setDaysPay('');
      setHourlyRateNonWorkingDays('');
    }
    setTotalRemuneration('');
    setShiftStartTime('08:00');
    setShiftEndTime('16:45');
    setIsModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setName(emp.name);
    setEmployeeNumber(emp.employeeNumber);
    setDesignation(emp.designation);
    setBranch(emp.branch);
    setBranchCode(emp.branchCode || '');
    setDepartment(emp.department);
    setShiftStartTime(emp.shiftStartTime || '08:00');
    setShiftEndTime(emp.shiftEndTime || '16:45');
    setHourlyRate(emp.hourlyRate !== undefined ? emp.hourlyRate : '');
    setDaysPay(emp.daysPay !== undefined ? emp.daysPay : '');
    setHourlyRateNonWorkingDays(emp.hourlyRateNonWorkingDays !== undefined ? emp.hourlyRateNonWorkingDays : '');
    setTotalRemuneration(emp.totalRemuneration !== undefined ? emp.totalRemuneration : '');
    setRoleId(emp.roleId || '');
    setIsModalOpen(true);
  };

  const handleDesignationSelect = (selectedName: string) => {
    setDesignation(selectedName);
    if (!selectedName) return;
    const found = roleRates.find(r => r.name === selectedName);
    if (found) {
      setRoleId(found.id);
      setHourlyRate(found.hourlyRateWorkingDays);
      setDaysPay(found.daysPaymentNonWorkingDays);
      setHourlyRateNonWorkingDays(found.hourlyRateNonWorkingDays);
      if (found.department) {
        setDepartment(found.department);
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    setIsConfirmSaveModalOpen(true);
  };

  const confirmCommitSaveEmployee = async () => {
    const cleanPf = formatPfNumber(employeeNumber.trim()) || ('PF' + String(Math.floor(100000 + Math.random() * 900000)));
    const isNew = !editingEmployee;

    const payload: Employee & Record<string, any> = {
      id: editingEmployee?.id || 'emp_' + Date.now(),
      name: name.trim(),
      employeeNumber: cleanPf,
      pfNumber: cleanPf,
      designation: designation.trim(),
      branch: branch.trim(),
      branchCode: branchCode || undefined,
      department: department.trim(),
      roleId: roleId || undefined,
      shiftStartTime: shiftStartTime || '08:00',
      shiftEndTime: shiftEndTime || '16:45',
      hourlyRate: hourlyRate !== '' ? Number(hourlyRate) : undefined,
      daysPay: daysPay !== '' ? Number(daysPay) : undefined,
      hourlyRateNonWorkingDays: hourlyRateNonWorkingDays !== '' ? Number(hourlyRateNonWorkingDays) : undefined,
      totalRemuneration: totalRemuneration !== '' ? Number(totalRemuneration) : undefined,
      createdAt: editingEmployee?.createdAt || new Date().toISOString(),
      role: editingEmployee?.role || 'user',
      ...(isNew ? {
        initialPassword: cleanPf,
        passwordHash: cleanPf,
        mustChangePassword: true,
        isFirstLogin: true,
        passwordMatchesPf: true,
      } : {}),
    };

    const updated = saveEmployee(payload);
    // Also update in list
    setEmployees(prev => {
      const idx = prev.findIndex(p => p.id === payload.id);
      if (idx >= 0) {
        const c = [...prev];
        c[idx] = payload;
        return c;
      }
      return [payload, ...prev];
    });

    try {
      await setDoc(doc(db, 'users', payload.id), sanitizeFirestoreData(payload), { merge: true });
      if (cleanPf) {
        await setDoc(doc(db, 'pfDirectory', cleanPf), {
          pfNumber: cleanPf,
          name: payload.name,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch {}

    recordAuditLog({
      action: editingEmployee ? 'USER_UPDATE' : 'USER_CREATE',
      actionLabel: editingEmployee ? 'Updated Employee Profile & Shift Times' : 'Created New Employee Profile',
      targetType: 'user',
      targetId: payload.id,
      targetDescription: `${payload.name} (${payload.employeeNumber})`,
      beforeState: editingEmployee || undefined,
      afterState: payload,
      details: {
        branch: payload.branch,
        department: payload.department,
        designation: payload.designation,
        shift: `${shiftStartTime} - ${shiftEndTime}`,
      },
    });

    setIsConfirmSaveModalOpen(false);
    setIsModalOpen(false);
  };

  const confirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    try {
      const cleanPf = formatPfNumber(employeeToDelete.employeeNumber || employeeToDelete.pfNumber || '');

      // 1. Permanently delete from Firestore collections
      await deleteDoc(doc(db, 'users', employeeToDelete.id));
      try {
        await deleteDoc(doc(db, 'employees', employeeToDelete.id));
      } catch {}
      try {
        await deleteDoc(doc(db, 'admins', employeeToDelete.id));
      } catch {}
      if (cleanPf) {
        try {
          await deleteDoc(doc(db, 'pfDirectory', cleanPf));
        } catch {}
      }

      // 2. Purge from local caches to prevent ghost re-appearance
      deleteEmployee(employeeToDelete.id);
      deleteStoredAccount(employeeToDelete.id);
      if (employeeToDelete.email) deleteStoredAccount(employeeToDelete.email);
      if (cleanPf) deleteStoredAccount(cleanPf);

      setEmployees(prev => prev.filter(e => e.id !== employeeToDelete.id));

      recordAuditLog({
        action: 'USER_DELETE',
        actionLabel: 'Deleted Employee Profile',
        targetType: 'user',
        targetId: employeeToDelete.id,
        targetDescription: `${employeeToDelete.name} (${employeeToDelete.employeeNumber})`,
        beforeState: employeeToDelete,
      });

      if (settings.defaultEmployeeId === employeeToDelete.id) {
        const newSettings = { ...settings, defaultEmployeeId: undefined };
        saveSettings(newSettings);
        setSettings(newSettings);
      }
    } catch (err) {
      console.error('Failed to permanently delete employee', err);
    } finally {
      setEmployeeToDelete(null);
    }
  };

  const handleSetDefault = (id: string) => {
    const newSettings = { ...settings, defaultEmployeeId: id };
    saveSettings(newSettings);
    setSettings(newSettings);
  };

  // Branch isolation rule:
  // "In employees, separate users and admins in their profile, but users can't view others not assigned their branch. Users only can view users and admins in they assigned branch."
  const userAssignedBranch = userProfile?.branch?.trim() || '';

  const branchScopedEmployees = employees.filter(emp => {
    if (isAdmin) return true; // Admins can view all branches
    if (!userAssignedBranch) return true;
    return emp.branch.trim().toLowerCase() === userAssignedBranch.toLowerCase();
  });

  // Filtered employees
  const filtered = branchScopedEmployees.filter(emp => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      emp.name.toLowerCase().includes(q) ||
      emp.employeeNumber.toLowerCase().includes(q) ||
      emp.department.toLowerCase().includes(q) ||
      emp.designation.toLowerCase().includes(q);

    const matchesRoleType =
      activeTabFilter === 'ALL'
        ? true
        : activeTabFilter === 'admins'
        ? emp.role === 'admin'
        : emp.role !== 'admin';

    const matchesBranch = branchFilter === 'ALL' || emp.branch === branchFilter;
    const matchesRoleRate =
      roleFilter === 'ALL' ||
      emp.roleId === roleFilter ||
      (emp.designation && emp.designation.toLowerCase().includes(roleFilter.toLowerCase()));

    return matchesSearch && matchesRoleType && matchesBranch && matchesRoleRate;
  });

  const adminCount = branchScopedEmployees.filter(e => e.role === 'admin').length;
  const standardUserCount = branchScopedEmployees.filter(e => e.role !== 'admin').length;

  return (
    <div className="space-y-6 pb-16">
      {/* Header Bar */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Employee Profiles
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {branchScopedEmployees.length} Visible
              </span>
              {!isAdmin && userAssignedBranch && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Branch: {userAssignedBranch}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isAdmin
                ? 'Full enterprise directory: Manage employees and system administrators with branch and role rate assignments.'
                : `Showing verified employees and administrators assigned to your branch (${userAssignedBranch || 'Head Office'}).`}
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New Profile</span>
            </button>
          )}
        </div>

        {/* User vs Admin Profile Separation Tabs */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              onClick={() => setActiveTabFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTabFilter === 'ALL'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Profiles ({branchScopedEmployees.length})
            </button>
            <button
              onClick={() => setActiveTabFilter('users')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                activeTabFilter === 'users'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Standard Users ({standardUserCount})</span>
            </button>
            <button
              onClick={() => setActiveTabFilter('admins')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                activeTabFilter === 'admins'
                  ? 'bg-white text-purple-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-purple-600" />
              <span>Administrators ({adminCount})</span>
            </button>
          </div>

          {/* Filters: Branch & Role */}
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white py-1.5 px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.name}>
                    {b.name} (Code: {b.branchCode})
                  </option>
                ))}
              </select>
            )}

            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white py-1.5 px-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Roles</option>
              {roleRates.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4 relative">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, employee number, designation, department..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(emp => {
          const isDefault = settings.defaultEmployeeId === emp.id;
          const isUserAdmin = emp.role === 'admin';
          return (
            <div
              key={emp.id}
              className={`relative rounded-2xl bg-white p-5 shadow-xs border transition hover:shadow-md ${
                isDefault
                  ? 'border-indigo-500 ring-1 ring-indigo-500/20'
                  : isUserAdmin
                  ? 'border-purple-200'
                  : 'border-slate-200'
              }`}
            >
              {isDefault && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                  <Star className="w-3 h-3 fill-indigo-600" />
                  <span>Default Profile</span>
                </div>
              )}

              <div className="flex items-start gap-3">
                {emp.photoURL ? (
                  <img
                    src={emp.photoURL}
                    alt={emp.name}
                    referrerPolicy="no-referrer"
                    className="h-11 w-11 shrink-0 rounded-xl object-cover border border-slate-200 shadow-2xs"
                  />
                ) : (
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                      isUserAdmin ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {emp.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0 pr-12">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm truncate">{emp.name}</h3>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    <Hash className="w-3 h-3 text-slate-400" />
                    <span className="font-mono font-bold text-indigo-700">{emp.employeeNumber}</span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ml-1 ${
                        isUserAdmin
                          ? 'bg-purple-100 text-purple-700 border border-purple-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {isUserAdmin ? 'Admin' : 'User'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Details List */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate font-medium">{emp.designation || 'Staff'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{emp.department}</span>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>
                    Branch: <strong className="text-slate-800">{emp.branch}</strong>
                  </span>
                  {emp.branchCode && (
                    <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1 rounded">
                      #{emp.branchCode}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                    <Clock className="w-3 h-3 text-sky-600" />
                    Shift: {emp.shiftStartTime || '08:00'} - {emp.shiftEndTime || '16:45'}
                  </span>
                </div>
                {(emp.hourlyRate || emp.daysPay || emp.hourlyRateNonWorkingDays) && (
                  <div className="pt-1.5 flex flex-col gap-1 text-[11px] font-mono text-indigo-700 bg-indigo-50/50 p-2 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span>Working Days OT:</span>
                      <strong>{emp.hourlyRate ? `Rs. ${Number(emp.hourlyRate).toFixed(2)}/h` : 'Default'}</strong>
                    </div>
                    {emp.daysPay && (
                      <div className="flex items-center justify-between">
                        <span>Non-Working Days Payment:</span>
                        <strong>Rs. {Number(emp.daysPay).toFixed(2)}</strong>
                      </div>
                    )}
                    {emp.hourlyRateNonWorkingDays && (
                      <div className="flex items-center justify-between">
                        <span>Non-Working OT Rate:</span>
                        <strong>Rs. {Number(emp.hourlyRateNonWorkingDays).toFixed(2)}/h</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                {!isDefault ? (
                  <button
                    onClick={() => handleSetDefault(emp.id)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                  >
                    Set as Default
                  </button>
                ) : (
                  <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Auto-selected on new claim</span>
                  </span>
                )}

                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(emp)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                      title="Edit profile"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEmployeeToDelete(emp)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Delete profile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No employee profiles found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery
              ? 'Try a different search term.'
              : !isAdmin
              ? `No other staff registered under branch "${userAssignedBranch}".`
              : 'Add your first employee to get started.'}
          </p>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-slate-900">
              {editingEmployee ? 'Edit Employee Profile' : 'Add New Employee'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configured with branch network and corporate role rates
            </p>

            <form onSubmit={handleSave} className="mt-5 space-y-3.5 text-xs">
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
                <label className="block font-bold text-slate-700 mb-1">
                  PF Number (Staff ID)
                </label>
                <input
                  type="text"
                  value={employeeNumber}
                  onChange={e => setEmployeeNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. PF123456"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Branch Selector (A to Z with code) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Branch Network <span className="text-rose-500">*</span>
                </label>
                <SearchableBranchSelect
                  value={branch}
                  branchCode={branchCode}
                  branches={branches}
                  onChange={(selectedName, selectedCode) => {
                    setBranch(selectedName);
                    setBranchCode(selectedCode);
                  }}
                  placeholder="Search branch name, code, or city..."
                />
              </div>

              {/* Designation Dropdown (Sorted A to Z, no payment rates displayed) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    Designation <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-indigo-600 font-semibold">Sorted A to Z</span>
                </div>
                <select
                  value={designation}
                  onChange={e => handleDesignationSelect(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  <option value="">-- Select Designation --</option>
                  {roleRates.map(r => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                  {!roleRates.some(r => r.name === designation) && designation && (
                    <option value={designation}>{designation}</option>
                  )}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Designation from database. Rates and department load automatically.
                </span>
              </div>

              {/* Department Dropdown (Auto-loaded with designation) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    Department <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-indigo-600 font-semibold">Auto-loaded with designation</span>
                </div>
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  <option value="">-- Select Department --</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                  {!departments.some(d => d.name === department) && department && (
                    <option value={department}>{department}</option>
                  )}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Assigned department. Loads automatically when designation is selected.
                </span>
              </div>

              {/* Overtime Rates Form 10756 Remuneration */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                  <Banknote className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Assigned Overtime Rates Matrix (Form 10756)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-600 text-[10px] mb-1">
                      Working Day OT (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={hourlyRate}
                      onChange={e => setHourlyRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="1850.00"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 text-[10px] mb-1">
                      Non-Working Day (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={daysPay}
                      onChange={e => setDaysPay(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="12500.00"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 text-[10px] mb-1">
                      Non-Working OT (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={hourlyRateNonWorkingDays}
                      onChange={e =>
                        setHourlyRateNonWorkingDays(e.target.value === '' ? '' : parseFloat(e.target.value))
                      }
                      placeholder="2312.50"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Custom Shift Schedule Assignment */}
              <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-sky-900 text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-sky-600" />
                    <span>Custom Shift Working Hours (Start &amp; End Time)</span>
                  </div>
                  <span className="font-mono font-bold text-sky-900 text-xs bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-md">
                    {shiftStartTime} - {shiftEndTime}
                  </span>
                </div>
                <p className="text-[10px] text-sky-800/80">
                  Duty hours for this employee. Daily overtime calculations apply after shift end time.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-sky-900 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={shiftStartTime}
                      onChange={e => setShiftStartTime(e.target.value)}
                      className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-sky-900 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={shiftEndTime}
                      onChange={e => setShiftEndTime(e.target.value)}
                      className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[9px] font-semibold text-sky-700 mr-1">Presets:</span>
                  {[
                    { label: 'General (08:00 - 16:45)', start: '08:00', end: '16:45' },
                    { label: 'Morning (07:30 - 16:15)', start: '07:30', end: '16:15' },
                    { label: 'Regular (08:30 - 17:15)', start: '08:30', end: '17:15' },
                    { label: 'Late (09:00 - 17:45)', start: '09:00', end: '17:45' },
                  ].map(preset => {
                    const isCurrent = shiftStartTime === preset.start && shiftEndTime === preset.end;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setShiftStartTime(preset.start);
                          setShiftEndTime(preset.end);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition cursor-pointer ${
                          isCurrent
                            ? 'bg-sky-700 text-white'
                            : 'bg-white border border-sky-300 text-sky-900 hover:bg-sky-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs cursor-pointer"
                >
                  {editingEmployee ? 'Save Changes' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      <ConfirmationModal
        isOpen={isConfirmSaveModalOpen}
        onClose={() => setIsConfirmSaveModalOpen(false)}
        onConfirm={confirmCommitSaveEmployee}
        title={editingEmployee ? 'Confirm Profile Update' : 'Confirm New Employee'}
        message={`Save particulars for "${name}"?`}
        confirmText="Confirm Save"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!employeeToDelete}
        onClose={() => setEmployeeToDelete(null)}
        onConfirm={confirmDeleteEmployee}
        title="Delete Employee Profile"
        message={`Are you sure you want to delete profile for "${employeeToDelete?.name}"?`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};


