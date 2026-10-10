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
} from 'lucide-react';
import { RoleRate } from '../types';
import {
  fetchRoleRatesFromFirestore,
  subscribeToRoleRates,
  saveRoleRate,
  deleteRoleRate,
} from '../utils/branchRoleManager';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';

export const RoleManagement: React.FC = () => {
  const [roles, setRoles] = useState<RoleRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRate | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hourlyRateWorkingDays, setHourlyRateWorkingDays] = useState<number | ''>('');
  const [daysPaymentNonWorkingDays, setDaysPaymentNonWorkingDays] = useState<number | ''>('');
  const [hourlyRateNonWorkingDays, setHourlyRateNonWorkingDays] = useState<number | ''>('');
  const [specialHourlyRate, setSpecialHourlyRate] = useState<number | ''>('');

  // Delete State
  const [roleToDelete, setRoleToDelete] = useState<RoleRate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoleRatesFromFirestore().then(list => {
      setRoles(list);
      setLoading(false);
    });

    const unsub = subscribeToRoleRates(list => {
      setRoles(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openCreateModal = () => {
    setEditingRole(null);
    setName('');
    setDescription('');
    setHourlyRateWorkingDays('');
    setDaysPaymentNonWorkingDays('');
    setHourlyRateNonWorkingDays('');
    setSpecialHourlyRate('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (r: RoleRate) => {
    setEditingRole(r);
    setName(r.name);
    setDescription(r.description || '');
    setHourlyRateWorkingDays(r.hourlyRateWorkingDays);
    setDaysPaymentNonWorkingDays(r.daysPaymentNonWorkingDays);
    setHourlyRateNonWorkingDays(r.hourlyRateNonWorkingDays);
    setSpecialHourlyRate(r.specialHourlyRate !== undefined ? r.specialHourlyRate : '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleWorkingRateChange = (val: number | '') => {
    setHourlyRateWorkingDays(val);
    if (typeof val === 'number' && val > 0) {
      // Auto-suggest non-working day rates if empty:
      // Standard rate 1.25x or 1.5x for non-working days
      if (hourlyRateNonWorkingDays === '') {
        setHourlyRateNonWorkingDays(parseFloat((val * 1.25).toFixed(2)));
      }
      if (daysPaymentNonWorkingDays === '') {
        setDaysPaymentNonWorkingDays(parseFloat((val * 7).toFixed(2))); // ~7 hours work day
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Please enter a role name.');
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
        hourlyRateWorkingDays: Number(hourlyRateWorkingDays),
        daysPaymentNonWorkingDays: Number(daysPaymentNonWorkingDays),
        hourlyRateNonWorkingDays: Number(hourlyRateNonWorkingDays),
        specialHourlyRate: specialHourlyRate !== '' ? Number(specialHourlyRate) : undefined,
        createdAt: editingRole?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveRoleRate(payload);

      await recordAuditLog({
        action: editingRole ? 'ROLE_UPDATE' : 'ROLE_CREATE',
        actionLabel: editingRole ? 'Updated role overtime rates' : 'Created role with assigned overtime rates',
        targetType: 'role',
        targetId: payload.id,
        targetDescription: payload.name,
        details: {
          hourlyRateWorkingDays: payload.hourlyRateWorkingDays,
          daysPaymentNonWorkingDays: payload.daysPaymentNonWorkingDays,
          hourlyRateNonWorkingDays: payload.hourlyRateNonWorkingDays,
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
              Add corporate roles with assigned overtime rates: Hourly Rate in Working Days, Days Payment in Non-Working Days, and Hourly Rate in Non-Working Days. Admins can filter employees by assigned role and branch.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Role</span>
          </button>
        </div>

        {/* Search */}
        <div className="mt-5 relative">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search roles by title or description..."
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
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                      Role ID: {role.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(role)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                    title="Edit Role Rates"
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

            <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Auto-applied to assigned employees</span>
              <span className="font-semibold text-purple-600">Form 10756</span>
            </div>
          </div>
        ))}
      </div>

      {filteredRoles.length === 0 && !loading && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No corporate roles found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery ? 'Try adjusting your search query.' : 'Add your first role to configure overtime rates.'}
          </p>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingRole ? 'Edit Role Overtime Rates' : 'Add New Corporate Role'}
                  </h3>
                  <p className="text-xs text-slate-500">Assign standard working &amp; non-working day rates</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
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
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Role Title / Designation <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Senior Technical Officer"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-semibold focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Responsibilities</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Senior IT officer handling technical infrastructure & maintenance."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
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
