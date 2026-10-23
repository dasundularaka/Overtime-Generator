import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  PhoneCall,
  MapPin,
  Mail,
  FileText,
  CheckCircle2,
  AlertCircle,
  Hash,
  Shield,
  Layers,
  Navigation,
  ExternalLink,
  Copy,
  Check,
  X,
  ArrowUpDown,
  Compass,
  Eye,
  Info,
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
import { useAuth } from '../context/AuthContext';

export const BranchManagement: React.FC = () => {
  const { isAdmin } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Popup / Details Modal State
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Add / Edit Modal State (Admin Only)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [address, setAddress] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [mapLink, setMapLink] = useState('');

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
      // Keep selected branch synced if open
      if (selectedBranch) {
        const updated = list.find(b => b.id === selectedBranch.id);
        if (updated) setSelectedBranch(updated);
      }
    });
    return () => unsub();
  }, [selectedBranch?.id]);

  // Helper: Get clean telephone string for tel: link (sync to phone)
  const getCleanPhone = (phone?: string) => {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '');
  };

  // Helper: Build Google Maps Directions / Location URL
  const getDirectionsUrl = (b: Branch): string => {
    if (b.mapLink && b.mapLink.trim()) {
      return b.mapLink.trim();
    }
    const query = encodeURIComponent(`${b.name}, ${b.address || ''}, Sri Lanka`.trim());
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  };

  // Helper: 1-click clipboard copy
  const handleCopy = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Sort branch network according to branch code (User Request)
  const sortedBranches = useMemo(() => {
    const list = [...branches].sort((a, b) => {
      const codeA = (a.branchCode || '').trim();
      const codeB = (b.branchCode || '').trim();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
    return sortOrder === 'desc' ? list.reverse() : list;
  }, [branches, sortOrder]);

  const filteredBranches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sortedBranches;
    return sortedBranches.filter(b => {
      return (
        b.name.toLowerCase().includes(q) ||
        b.branchCode.toLowerCase().includes(q) ||
        (b.address && b.address.toLowerCase().includes(q)) ||
        (b.telephone && b.telephone.toLowerCase().includes(q)) ||
        (b.email && b.email.toLowerCase().includes(q)) ||
        (b.notes && b.notes.toLowerCase().includes(q))
      );
    });
  }, [sortedBranches, searchQuery]);

  // Admin Modal Controls
  const openCreateModal = () => {
    if (!isAdmin) return;
    setEditingBranch(null);
    setName('');
    // Auto suggest next code based on numeric pattern
    const maxNum = branches.reduce((acc, b) => {
      const n = parseInt(b.branchCode.replace(/\D/g, ''), 10);
      return !isNaN(n) && n > acc ? n : acc;
    }, 0);
    setBranchCode(String(maxNum + 1).padStart(3, '0'));
    setAddress('');
    setTelephone('');
    setEmail('');
    setNotes('');
    setMapLink('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (b: Branch) => {
    if (!isAdmin) return;
    setEditingBranch(b);
    setName(b.name);
    setBranchCode(b.branchCode);
    setAddress(b.address || '');
    setTelephone(b.telephone || '');
    setEmail(b.email || '');
    setNotes(b.notes || '');
    setMapLink(b.mapLink || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
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
        mapLink: mapLink.trim() || undefined,
        createdAt: editingBranch?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveBranch(payload);

      await recordAuditLog({
        action: editingBranch ? 'BRANCH_UPDATE' : 'BRANCH_CREATE',
        actionLabel: editingBranch ? 'Updated Branch Network Details' : 'Added New Branch to Network',
        targetType: 'branch',
        targetId: payload.id,
        targetDescription: `${payload.name} (Code: ${payload.branchCode})`,
        beforeState: editingBranch || undefined,
        afterState: payload,
        details: {
          branchCode: payload.branchCode,
          telephone: payload.telephone,
          address: payload.address,
          mapLink: payload.mapLink,
        },
      });

      setActionSuccess(`Branch "${payload.name}" saved successfully!`);
      setTimeout(() => setActionSuccess(null), 4000);
      setIsModalOpen(false);

      if (selectedBranch?.id === payload.id) {
        setSelectedBranch(payload);
      }
    } catch (err: any) {
      console.error('Save branch error', err);
      setFormError(err.message || 'Failed to save branch.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteBranch = async () => {
    if (!isAdmin || !branchToDelete) return;
    setIsDeleting(true);
    try {
      await deleteBranch(branchToDelete.id);

      await recordAuditLog({
        action: 'BRANCH_DELETE',
        actionLabel: 'Deleted Operating Branch from Network',
        targetType: 'branch',
        targetId: branchToDelete.id,
        targetDescription: `${branchToDelete.name} (Code: ${branchToDelete.branchCode})`,
        beforeState: branchToDelete,
      });

      setActionSuccess(`Branch "${branchToDelete.name}" deleted successfully.`);
      setTimeout(() => setActionSuccess(null), 4000);
      if (selectedBranch?.id === branchToDelete.id) {
        setSelectedBranch(null);
      }
      setBranchToDelete(null);
    } catch (err: any) {
      console.error('Delete branch error', err);
    } finally {
      setIsDeleting(false);
    }
  };

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
                Branch Network
              </h1>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  isAdmin
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {isAdmin ? 'Admin Mode' : 'Corporate Directory (Read-Only)'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Browse corporate bank branches sorted by branch code. Click any branch to view full contact details, sync phone numbers to your device dialer, and get Google Maps directions.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sort Toggle Button */}
            <button
              onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
              title={`Sorting by Branch Code: ${sortOrder === 'asc' ? 'Ascending (001 -> 999)' : 'Descending (999 -> 001)'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>Code {sortOrder === 'asc' ? '0-9' : '9-0'}</span>
            </button>

            {/* Admin Add Button */}
            {isAdmin && (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Branch</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="mt-5 relative">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search branches by code, name, address, phone, or region..."
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

      {/* ======================================================== */}
      {/* MOBILE VIEW (Strict Order: Branch Code, Branch Name, Address) */}
      {/* ======================================================== */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1">
          <span>Branch Network ({filteredBranches.length})</span>
          <span className="text-[11px] font-normal text-slate-400">Tap for details &amp; map</span>
        </div>

        {filteredBranches.map(b => {
          const cleanPhone = getCleanPhone(b.telephone);
          const directionsUrl = getDirectionsUrl(b);

          return (
            <div
              key={b.id}
              onClick={() => setSelectedBranch(b)}
              className="rounded-2xl bg-white p-4 border border-slate-200 shadow-xs hover:border-indigo-300 hover:shadow-md transition cursor-pointer space-y-2.5 active:bg-slate-50"
            >
              {/* 1. BRANCH CODE (First) */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                  <Hash className="w-3 h-3 text-indigo-500" />
                  <span>Code: {b.branchCode}</span>
                </span>

                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  {/* Quick Directions Link */}
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition"
                    title="Get Directions on Google Maps"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </a>

                  {isAdmin && (
                    <>
                      <button
                        onClick={() => openEditModal(b)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                        title="Edit Branch"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setBranchToDelete(b)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Delete Branch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 2. BRANCH NAME (Second) */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  {b.name}
                </h3>
                {b.notes && (
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{b.notes}</p>
                )}
              </div>

              {/* 3. ADDRESS (Third) */}
              <div className="flex items-start gap-1.5 text-xs text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{b.address || 'Physical address not specified'}</span>
              </div>

              {/* Bottom Quick Action Contacts */}
              <div
                className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs"
                onClick={e => e.stopPropagation()}
              >
                {b.telephone ? (
                  <a
                    href={`tel:${cleanPhone}`}
                    className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                    title="Click to call / sync directly with phone dialer"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{b.telephone}</span>
                  </a>
                ) : (
                  <span className="text-slate-300 italic text-[11px]">No phone listed</span>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedBranch(b)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                >
                  <span>Details</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredBranches.length === 0 && !loading && (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-slate-700">No branches found</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Try a different search query</p>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* DESKTOP TABLE VIEW (Sorted by Branch Code) */}
      {/* ======================================================== */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Branch Network ({filteredBranches.length}) &bull; Sorted by Branch Code ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})
            </span>
          </div>
          <span className="text-xs text-slate-400">Click any row to open full details popup</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 w-28">Branch Code</th>
                <th className="py-3 px-4">Branch Name</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Telephone</th>
                <th className="py-3 px-4">Google Maps</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBranches.map(b => {
                const cleanPhone = getCleanPhone(b.telephone);
                const directionsUrl = getDirectionsUrl(b);

                return (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBranch(b)}
                    className="hover:bg-indigo-50/30 transition cursor-pointer group"
                  >
                    {/* Branch Code */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs group-hover:bg-indigo-100 transition">
                        <Hash className="w-3 h-3 text-indigo-500" />
                        <span>{b.branchCode}</span>
                      </span>
                    </td>

                    {/* Branch Name */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition">
                        {b.name}
                      </div>
                      {b.notes && (
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{b.notes}</div>
                      )}
                    </td>

                    {/* Address */}
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

                    {/* Telephone (Auto-syncs to phone dialer on click) */}
                    <td className="py-3.5 px-4 text-slate-600 font-mono" onClick={e => e.stopPropagation()}>
                      {b.telephone ? (
                        <a
                          href={`tel:${cleanPhone}`}
                          className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                          title="Click to call / sync to phone dialer"
                        >
                          <Phone className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{b.telephone}</span>
                        </a>
                      ) : (
                        <span className="text-slate-300 italic font-sans">Not set</span>
                      )}
                    </td>

                    {/* Google Maps Directions */}
                    <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          b.mapLink
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Get directions on Google Maps"
                      >
                        <Navigation className="w-3 h-3 text-blue-600 shrink-0" />
                        <span>Directions</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedBranch(b)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="View Branch Details Popup"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              onClick={() => openEditModal(b)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title="Edit Branch & Map Link"
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
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {/* ======================================================== */}
      {/* BRANCH DETAILS POPUP MODAL (All Details Relevant to Branch) */}
      {/* ======================================================== */}
      {selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-xs px-2.5 py-0.5 rounded-lg bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    #{selectedBranch.branchCode}
                  </span>
                  <span className="text-[11px] text-indigo-300 font-medium">Corporate Branch Network</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  {selectedBranch.name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedBranch(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* Directions Button Section (User Request: Show directions button with embedded link) */}
              <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-4 border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-600 text-white">
                      <Compass className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Google Maps Navigation</h4>
                      <p className="text-[10px] text-slate-500">
                        {selectedBranch.mapLink ? 'Direct custom location link configured' : 'Automated address search route'}
                      </p>
                    </div>
                  </div>
                  {selectedBranch.mapLink && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                      Link Verified
                    </span>
                  )}
                </div>

                {/* Primary Get Directions Button */}
                <a
                  href={getDirectionsUrl(selectedBranch)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Get Directions on Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                {/* Embedded URL string preview & copy */}
                <div className="flex items-center justify-between gap-2 p-2 bg-white/80 rounded-xl border border-blue-200 text-[11px] text-slate-600">
                  <div className="truncate font-mono">
                    <span className="font-bold text-slate-700 mr-1">Link:</span>
                    <span className="text-slate-500">{getDirectionsUrl(selectedBranch)}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(getDirectionsUrl(selectedBranch), 'directions')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0 font-semibold cursor-pointer"
                  >
                    {copiedField === 'directions' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'directions' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Physical Address */}
              <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Physical Address
                  </span>
                  {selectedBranch.address && (
                    <button
                      onClick={() => handleCopy(selectedBranch.address || '', 'address')}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer flex items-center gap-1"
                    >
                      {copiedField === 'address' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedField === 'address' ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {selectedBranch.address || <span className="text-slate-400 italic font-normal">Physical address not registered</span>}
                </p>
              </div>

              {/* Contact Information: Telephone with Auto Phone Sync */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Telephone */}
                <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-1">
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    Telephone Number
                  </span>
                  {selectedBranch.telephone ? (
                    <div className="space-y-2 pt-1">
                      <p className="text-sm font-mono font-bold text-slate-900">
                        {selectedBranch.telephone}
                      </p>
                      {/* One-click Phone Sync Button */}
                      <a
                        href={`tel:${getCleanPhone(selectedBranch.telephone)}`}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                        title="Sync and open phone dialer immediately"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Call on Phone</span>
                      </a>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic pt-1">No phone number recorded</p>
                  )}
                </div>

                {/* Email Address */}
                <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-1">
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Email Address
                  </span>
                  {selectedBranch.email ? (
                    <div className="space-y-2 pt-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {selectedBranch.email}
                      </p>
                      <a
                        href={`mailto:${selectedBranch.email}`}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Send Email</span>
                      </a>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic pt-1">No email recorded</p>
                  )}
                </div>
              </div>

              {/* Notes / Hub Information */}
              {selectedBranch.notes && (
                <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-1">
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    Operational &amp; Regional Hub Info
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed pt-0.5">
                    {selectedBranch.notes}
                  </p>
                </div>
              )}

              {/* Metadata */}
              <div className="text-[10px] text-slate-400 pt-1 flex items-center justify-between border-t border-slate-100">
                <span>Branch ID: <strong className="font-mono text-slate-600">{selectedBranch.id}</strong></span>
                {selectedBranch.updatedAt && (
                  <span>Updated: {new Date(selectedBranch.updatedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              {isAdmin ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const b = selectedBranch;
                      setSelectedBranch(null);
                      openEditModal(b);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Branch &amp; Map Link</span>
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Corporate Directory View</span>
                </span>
              )}

              <button
                onClick={() => setSelectedBranch(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs shadow-2xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ADMIN ADD / EDIT MODAL (With Google Maps Location Link) */}
      {/* ======================================================== */}
      {isModalOpen && isAdmin && (
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
                  <p className="text-xs text-slate-500">Corporate branch network &amp; Google Map navigation</p>
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
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Used for natural sorting</span>
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

              {/* Google Maps Location Link (User Request: Admins can add link) */}
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-blue-900 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-blue-600" />
                    <span>Google Maps Location Link / URL</span>
                  </label>
                  {mapLink.trim() && (
                    <a
                      href={mapLink.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Test Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={mapLink}
                  onChange={e => setMapLink(e.target.value)}
                  placeholder="https://maps.app.goo.gl/... or https://maps.google.com/?q=..."
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-slate-800 font-mono text-[11px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[10px] text-blue-700/80">
                  Paste the Google Maps share link or location URL. Staff will see a Directions button linked directly to this location.
                </p>
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
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Syncs to caller dialer on click</span>
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
      {isAdmin && (
        <ConfirmationModal
          isOpen={!!branchToDelete}
          onClose={() => setBranchToDelete(null)}
          onConfirm={confirmDeleteBranch}
          title="Delete Branch"
          message={`Are you sure you want to remove "${branchToDelete?.name}" (${branchToDelete?.branchCode}) from the branch network?`}
          confirmText={isDeleting ? 'Deleting...' : 'Delete Branch'}
          variant="danger"
        />
      )}
    </div>
  );
};
