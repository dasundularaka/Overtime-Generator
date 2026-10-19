import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Plus,
  Search,
  Edit2,
  Trash2,
  Banknote,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Award,
  Building2,
  FileText,
  X,
  Lock,
  Unlock,
  Shield,
  Check,
} from 'lucide-react';
import { RoleRate, ClaimType } from '../types';
import {
  fetchRoleRatesFromFirestore,
  subscribeToRoleRates,
  saveRoleRate,
  deleteRoleRate,
  toggleRoleRateLock,
} from '../utils/branchRoleManager';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';

export const RoleManagement: React.FC = () => {
  const [roles, setRoles] = useState<RoleRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Role Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRate | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [claimType, setClaimType] = useState<ClaimType>('OT');
  const [hourlyRateWorkingDays, setHourlyRateWorkingDays] = useState<number | ''>('');
  const [daysPaymentNonWorkingDays, setDaysPaymentNonWorkingDays] = useState<number | ''>('');
  const [hourlyRateNonWorkingDays, setHourlyRateNonWorkingDays] = useState<number | ''>('');
  const [specialHourlyRate, setSpecialHourlyRate] = useState<number | ''>('');
  const [isRatesLocked, setIsRatesLocked] = useState<boolean>(false);

  // Delete State
  const [roleToDelete, setRoleToDelete] = useState<RoleRate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isTogglingLock, setIsTogglingLock] = useState<string | null>(null);

  useEffect(() => {
    fetchRoleRatesFromFirestore().then(list => {
      setRoles(list);
      setLoading(false);
    });

    const unsub = subscribeToRoleRates(list => {
      setRoles(list);
      setLoading(false);
    });

    return () => {
      unsub();
    };
  }, []);

  const openCreateModal = () => {
    setEditingRole(null);
    setName('');
    setDescription('');
    setClaimType('OT');
    setHourlyRateWorkingDays('');
    setDaysPaymentNonWorkingDays('');
    setHourlyRateNonWorkingDays('');
    setSpecialHourlyRate('');
    setIsRatesLocked(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (r: RoleRate) => {
    setEditingRole(r);
    setName(r.name);
    setDescription(r.description || '');
    setClaimType(r.claimType || 'OT');
    setHourlyRateWorkingDays(r.hourlyRateWorkingDays);
    setDaysPaymentNonWorkingDays(r.daysPaymentNonWorkingDays);
    setHourlyRateNonWorkingDays(r.hourlyRateNonWorkingDays);
    setSpecialHourlyRate(r.specialHourlyRate !== undefined ? r.specialHourlyRate : '');
    setIsRatesLocked(Boolean(r.isRatesLocked));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleWorkingRateChange = (val: number | '') => {
    setHourlyRateWorkingDays(val);
    if (typeof val === 'number' && val > 0) {
      // Auto-suggest non-working day rates if empty:
      if (hourlyRateNonWorkingDays === '') {
        setHourlyRateNonWorkingDays(parseFloat((val * 1.25).toFixed(2)));
      }
      if (daysPaymentNonWorkingDays === '') {
        setDaysPaymentNonWorkingDays(parseFloat((val * 7).toFixed(2))); // ~7 hours work day
      }
    }
  };

  // 1-Click Fast Lock/Unlock from Role Card
  const handleToggleRoleLock = async (r: RoleRate) => {
    setIsTogglingLock(r.id);
    const nextLockState = !r.isRatesLocked;
    try {
      await toggleRoleRateLock(r.id, nextLockState);
      await recordAuditLog({
        action: 'ROLE_UPDATE',
        actionLabel: nextLockState ? 'Locked role overtime rates' : 'Unlocked role overtime rates',
        targetType: 'role',
        targetId: r.id,
        targetDescription: `${r.name} (${nextLockState ? 'Locked' : 'Unlocked'})`,
        details: { isRatesLocked: nextLockState },
      });
      setActionSuccess(`Role "${r.name}" rates are now ${nextLockState ? 'LOCKED (Users cannot edit)' : 'UNLOCKED (Users can edit)'}.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Toggle role lock error', err);
    } finally {
      setIsTogglingLock(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Please enter a role title / designation.');
      return;
    }

    if (hourlyRateWorkingDays === '' || Number(hourlyRateWorkingDays) < 0) {
      setFormError('Please enter a valid Hourly Rate for Working Days.');
      return;
    }

    if (daysPaymentNonWorkingDays === '' || Number(daysPaymentNonWorkingDays) < 0) {
      setFormError('Please enter a valid Days Payment for Non-Working Days.');
      return;
    }

    if (hourlyRateNonWorkingDays === '' || Number(hourlyRateNonWorkingDays) < 0) {
      setFormError('Please enter a valid Hourly Rate for Non-Working Days.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: RoleRate = {
        id: editingRole?.id || `role_${Date.now()}`,
        name: cleanName,
        description: description.trim() || undefined,
        claimType: claimType,
        hourlyRateWorkingDays: Number(hourlyRateWorkingDays),
        daysPaymentNonWorkingDays: Number(daysPaymentNonWorkingDays),
        hourlyRateNonWorkingDays: Number(hourlyRateNonWorkingDays),
        specialHourlyRate: specialHourlyRate !== '' ? Number(specialHourlyRate) : undefined,
        isRatesLocked: isRatesLocked,
        createdAt: editingRole?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveRoleRate(payload);

      await recordAuditLog({
        action: editingRole ? 'ROLE_UPDATE' : 'ROLE_CREATE',
        actionLabel: editingRole ? 'Updated role overtime rates' : 'Created new role with overtime rates',
        targetType: 'role',
        targetId: payload.id,
        targetDescription: payload.name,
        details: {
          claimType: payload.claimType,
          hourlyRateWorkingDays: payload.hourlyRateWorkingDays,
          daysPaymentNonWorkingDays: payload.daysPaymentNonWorkingDays,
          hourlyRateNonWorkingDays: payload.hourlyRateNonWorkingDays,
          isRatesLocked: payload.isRatesLocked,
        },
      });

      setActionSuccess(`Role "${payload.name}" saved successfully!`);
      setTimeout(() => setActionSuccess(null), 4000);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Save role error', err);
      setFormError(err.message || 'Failed to save role.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    setIsDeleting(true);
    try {
      await deleteRoleRate(roleToDelete.id);

      await recordAuditLog({
        action: 'ROLE_DELETE',
        actionLabel: 'Deleted corporate role rate definition',
        targetType: 'role',
        targetId: roleToDelete.id,
        targetDescription: roleToDelete.name,
      });

      setActionSuccess(`Role "${roleToDelete.name}" deleted successfully.`);
      setTimeout(() => setActionSuccess(null), 4000);
      setRoleToDelete(null);
    } catch (err: any) {
      console.error('Delete role error', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRoles = roles.filter(r => {
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
                <Briefcase className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Corporate Roles &amp; Overtime Rates
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                Admin Exclusive
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Add corporate roles, assign overtime rates, and lock/unlock rate editing. When locked, users in that role cannot modify their rates in the New Claim tab.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Add New Role Button */}
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Role</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-5 relative">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search roles by designation or description..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          />
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-scale-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{actionSuccess}</span>
        </div>
      )}

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRoles.map(role => (
          <div
            key={role.id}
            className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 font-bold">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{role.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-bold text-[10px] border ${
                          role.claimType === 'OP'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        <span>{role.claimType || 'OT'}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(role)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                    title="Edit Role & Rates"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setRoleToDelete(role)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Delete Role"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {role.description && (
                <p className="text-xs text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                  {role.description}
                </p>
              )}

              {/* Rate Matrix Card */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50/70 border border-blue-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-900">
                    <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Hourly Rate (Working Days):</span>
                  </div>
                  <span className="font-mono font-bold text-xs text-blue-950">
                    Rs. {Number(role.hourlyRateWorkingDays).toFixed(2)}/h
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/70 border border-amber-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-900">
                    <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Days Payment (Non-Working):</span>
                  </div>
                  <span className="font-mono font-bold text-xs text-amber-950">
                    Rs. {Number(role.daysPaymentNonWorkingDays).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-purple-50/70 border border-purple-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-purple-900">
                    <Banknote className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Hourly Rate (Non-Working):</span>
                  </div>
                  <span className="font-mono font-bold text-xs text-purple-950">
                    Rs. {Number(role.hourlyRateNonWorkingDays).toFixed(2)}/h
                  </span>
                </div>

                {role.specialHourlyRate !== undefined && (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                      <Award className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Special Assignment Rate:</span>
                    </div>
                    <span className="font-mono font-bold text-xs text-slate-800">
                      Rs. {Number(role.specialHourlyRate).toFixed(2)}/h
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Lock / Unlock Rates Status & Quick Action Button */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {role.isRatesLocked ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200">
                    <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>Rates Locked</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                    <Unlock className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Rates Unlocked</span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleToggleRoleLock(role)}
                disabled={isTogglingLock === role.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border shadow-2xs ${
                  role.isRatesLocked
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                }`}
                title={
                  role.isRatesLocked
                    ? 'Unlock Rates: permit users with this role to edit their rates in New Claim'
                    : 'Lock Rates: freeze rates so users with this role cannot modify them in New Claim'
                }
              >
                {role.isRatesLocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredRoles.length === 0 && !loading && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No roles found</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            {searchQuery
              ? 'Try adjusting your search query.'
              : 'Add corporate roles to define standard overtime rates for employees.'}
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Role</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* ADD / EDIT ROLE MODAL */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingRole ? 'Edit Corporate Role' : 'Add New Corporate Role'}
                  </h3>
                  <p className="text-xs text-slate-500">Designation title, rates &amp; lock policy</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-3.5 text-xs">
              {/* Role Title / Designation Input */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Role Title / Designation <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Senior Technical Officer, Systems Engineer, Banking Associate"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 font-bold focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Staff members assigned to this role will inherit its overtime rates.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Responsibilities</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Senior technical staff handling systems, network uptime & IT maintenance."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Default Claim Type Assignment */}
              <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-2xl">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-800">
                    Assigned Claim Type <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-purple-700 font-semibold">Overtime / Out of Pocket</span>
                </div>
                <select
                  value={claimType}
                  onChange={e => setClaimType(e.target.value as ClaimType)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-semibold focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                >
                  <option value="OT">OT (Overtime Claim Sheet)</option>
                  <option value="OP">OP (Out of Pocket Claim Sheet)</option>
                </select>
              </div>

              {/* Lock / Unlock Rates Switch for this Role */}
              <div className={`p-4 rounded-2xl border transition-all ${
                isRatesLocked
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-950'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className={`p-2 rounded-xl shrink-0 ${isRatesLocked ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {isRatesLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-xs">
                        Overtime Rates Lock Policy: {isRatesLocked ? 'LOCKED' : 'UNLOCKED'}
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                        {isRatesLocked
                          ? 'Rates are LOCKED: Users in this role CANNOT edit their overtime rates in the New Claim tab.'
                          : 'Rates are UNLOCKED: Users in this role CAN edit their overtime rates in the New Claim tab.'}
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={isRatesLocked}
                      onChange={e => setIsRatesLocked(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
              </div>

              {/* Overtime Rates Matrix */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="font-bold text-slate-900 text-xs block">
                  Assigned Overtime Rates (Official Form 10756 Matrix)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Working Days Hourly Rate */}
                  <div>
                    <label className="block font-bold text-blue-900 mb-1 text-[11px]">
                      Hourly Rate in Working Days (Rs.) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={hourlyRateWorkingDays}
                      onChange={e =>
                        handleWorkingRateChange(e.target.value === '' ? '' : parseFloat(e.target.value))
                      }
                      placeholder="e.g. 1850.00"
                      className="w-full rounded-xl border border-blue-300 bg-blue-50/40 px-3 py-2 font-mono font-bold text-slate-900 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Mon - Fri regular overtime</span>
                  </div>

                  {/* Non-Working Days Daily Payment */}
                  <div>
                    <label className="block font-bold text-amber-900 mb-1 text-[11px]">
                      Days Payment in Non-Working Days (Rs.) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={daysPaymentNonWorkingDays}
                      onChange={e =>
                        setDaysPaymentNonWorkingDays(e.target.value === '' ? '' : parseFloat(e.target.value))
                      }
                      placeholder="e.g. 12500.00"
                      className="w-full rounded-xl border border-amber-300 bg-amber-50/40 px-3 py-2 font-mono font-bold text-slate-900 text-xs focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Weekends / Public holidays full day</span>
                  </div>

                  {/* Non-Working Days Hourly Rate */}
                  <div>
                    <label className="block font-bold text-purple-900 mb-1 text-[11px]">
                      Hourly Rate in Non-Working Days (Rs.) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={hourlyRateNonWorkingDays}
                      onChange={e =>
                        setHourlyRateNonWorkingDays(e.target.value === '' ? '' : parseFloat(e.target.value))
                      }
                      placeholder="e.g. 2312.50"
                      className="w-full rounded-xl border border-purple-300 bg-purple-50/40 px-3 py-2 font-mono font-bold text-slate-900 text-xs focus:ring-1 focus:ring-purple-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Saturday / Sunday / Holiday hourly</span>
                  </div>

                  {/* Special Hourly Rate */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                      Special Assignment Hourly Rate (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={specialHourlyRate}
                      onChange={e =>
                        setSpecialHourlyRate(e.target.value === '' ? '' : parseFloat(e.target.value))
                      }
                      placeholder="e.g. 2500.00"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-slate-800 text-xs focus:ring-1 focus:ring-slate-400"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Special emergency / outage duties</span>
                  </div>
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
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : editingRole ? 'Update Role' : 'Add Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!roleToDelete}
        onClose={() => setRoleToDelete(null)}
        onConfirm={confirmDeleteRole}
        title="Delete Corporate Role"
        message={`Are you sure you want to remove role "${roleToDelete?.name}"? Employees assigned to this role will retain their current custom rates.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Role'}
        variant="danger"
      />

    </div>
  );
};
