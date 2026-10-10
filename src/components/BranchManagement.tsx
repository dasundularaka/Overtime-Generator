import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Mail,
  FileText,
  CheckCircle2,
  AlertCircle,
  Hash,
  Shield,
  Layers,
} from 'lucide-react';
import { Branch } from '../types';
import {
  fetchBranchesFromFirestore,
  subscribeToBranches,
  saveBranch,
  deleteBranch,
} from '../utils/branchRoleManager';
import { recordAuditLog } from '../utils/auditLogger';
import { ConfirmationModal } from './ConfirmationModal';

export const BranchManagement: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [address, setAddress] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Delete State
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchBranchesFromFirestore().then(list => {
      setBranches(list);
      setLoading(false);
    });

    const unsub = subscribeToBranches(list => {
      setBranches(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openCreateModal = () => {
    setEditingBranch(null);
    setName('');
    // Auto suggest next code
    const maxNum = branches.reduce((acc, b) => {
      const n = parseInt(b.branchCode.replace(/\D/g, ''), 10);
      return !isNaN(n) && n > acc ? n : acc;
    }, 0);
    setBranchCode(String(maxNum + 1).padStart(3, '0'));
    setAddress('');
    setTelephone('');
    setEmail('');
    setNotes('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (b: Branch) => {
    setEditingBranch(b);
    setName(b.name);
    setBranchCode(b.branchCode);
    setAddress(b.address || '');
    setTelephone(b.telephone || '');
    setEmail(b.email || '');
    setNotes(b.notes || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    const cleanCode = branchCode.trim().toUpperCase();

    if (!cleanName) {
      setFormError('Please enter a branch name.');
      return;
    }
    if (!cleanCode) {
      setFormError('Please enter a unique branch code.');
      return;
    }

    // Check duplicate branch code
    const isDuplicate = branches.some(
      b => b.branchCode.toUpperCase() === cleanCode && b.id !== editingBranch?.id
    );
    if (isDuplicate) {
      setFormError(`Branch code "${cleanCode}" is already in use by another branch.`);
      return;
    }

    setIsSaving(true);
    try {
      const payload: Branch = {
        id: editingBranch?.id || `br_${cleanCode.toLowerCase()}_${Date.now()}`,
        name: cleanName,
        branchCode: cleanCode,
        address: address.trim() || undefined,
        telephone: telephone.trim() || undefined,
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
        createdAt: editingBranch?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveBranch(payload);

      await recordAuditLog({
        action: editingBranch ? 'BRANCH_UPDATE' : 'BRANCH_CREATE',
        actionLabel: editingBranch ? 'Updated branch network details' : 'Added new branch to network',
        targetType: 'branch',
        targetId: payload.id,
        targetDescription: `${payload.name} (Code: ${payload.branchCode})`,
        details: {
          branchCode: payload.branchCode,
          telephone: payload.telephone,
          address: payload.address,
        },
      });

      setActionSuccess(`Branch "${payload.name}" saved successfully!`);
      setTimeout(() => setActionSuccess(null), 4000);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Save branch error', err);
      setFormError(err.message || 'Failed to save branch.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeleting(true);
    try {
      await deleteBranch(branchToDelete.id);

      await recordAuditLog({
        action: 'BRANCH_DELETE',
        actionLabel: 'Deleted branch from network',
        targetType: 'branch',
        targetId: branchToDelete.id,
        targetDescription: `${branchToDelete.name} (Code: ${branchToDelete.branchCode})`,
      });

      setActionSuccess(`Branch "${branchToDelete.name}" deleted successfully.`);
      setTimeout(() => setActionSuccess(null), 4000);
      setBranchToDelete(null);
    } catch (err: any) {
      console.error('Delete branch error', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Sort branches A to Z by Name
  const sortedBranches = [...branches].sort((a, b) => a.name.localeCompare(b.name));

  const filteredBranches = sortedBranches.filter(b => {
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.branchCode.toLowerCase().includes(q) ||
      (b.address && b.address.toLowerCase().includes(q)) ||
      (b.telephone && b.telephone.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                <Building2 className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Branch Network Management
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Admin Exclusive
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Configure corporate bank branches with branch codes, addresses, and phone contacts. Loaded alphabetically in employee profile selection without showing branch codes in printed templates.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Branch</span>
          </button>
        </div>

        {/* Search */}
        <div className="mt-5 relative">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search branches by name, branch code, address or phone..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-scale-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{actionSuccess}</span>
        </div>
      )}

      {/* Branch List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Configured Branches ({filteredBranches.length}) &bull; Alphabetical Order (A to Z)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Branch Name</th>
                <th className="py-3 px-4">Branch Code</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Telephone</th>
                <th className="py-3 px-4">Email / Contact</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBranches.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900 text-sm">{b.name}</div>
                    {b.notes && <div className="text-[11px] text-slate-400 mt-0.5">{b.notes}</div>}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <Hash className="w-3 h-3 text-indigo-500" />
                      <span>{b.branchCode}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {b.address ? (
                      <div className="flex items-center gap-1.5 max-w-xs truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{b.address}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 italic">Not set</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 font-mono">
                    {b.telephone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{b.telephone}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 italic font-sans">Not set</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {b.email ? (
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{b.email}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 italic">Not set</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(b)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Edit Branch"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setBranchToDelete(b)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Delete Branch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredBranches.length === 0 && !loading && (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No branches found</h3>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery ? 'Try adjusting your search query.' : 'Add your first branch to get started.'}
            </p>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingBranch ? 'Edit Branch' : 'Add New Branch'}
                  </h3>
                  <p className="text-xs text-slate-500">Corporate branch network registration</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Branch Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Kandy Super Grade Branch"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Branch Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={branchCode}
                    onChange={e => setBranchCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 015"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Unique 3-digit code</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Physical Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. No. 22, Dalada Veediya, Kandy"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telephone Number</label>
                  <input
                    type="text"
                    value={telephone}
                    onChange={e => setTelephone(e.target.value)}
                    placeholder="e.g. +94 81 2223400"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="kandy@bank.lk"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Operating Hub Info</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Central Province Regional Operations Center"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                <strong>Template Display Guarantee:</strong> In user creation and editing, this branch will be displayed in alphabetical order with its branch code (e.g. <em>Kandy Super Grade Branch (Code: 015)</em>). When printed on the A4 claim template, only the branch name is printed—branch codes are never shown in the template.
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
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : editingBranch ? 'Update Branch' : 'Add Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!branchToDelete}
        onClose={() => setBranchToDelete(null)}
        onConfirm={confirmDeleteBranch}
        title="Delete Branch"
        message={`Are you sure you want to remove "${branchToDelete?.name}" (${branchToDelete?.branchCode}) from the branch network?`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Branch'}
        variant="danger"
      />
    </div>
  );
};
