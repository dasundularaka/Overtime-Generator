import React, { useState, useEffect } from 'react';
import {
  History,
  FileText,
  Printer,
  Download,
  Trash2,
  Copy,
  Edit,
  Search,
  Eye,
  Calendar,
  Clock,
  Filter,
} from 'lucide-react';
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';
import { ClaimRecord, TemplateConfig } from '../types';
import { getActiveTemplate, deleteClaim } from '../utils/storage';
import { recordAuditLog } from '../utils/auditLogger';
import { generateOvertimePdf, printPdfDocument } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { ConfirmationModal } from './ConfirmationModal';
import { MONTH_NAMES } from '../utils/timeCalculations';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';
import { Banknote, CheckCircle2, ChevronRight, ChevronDown, X, ExternalLink, User, Building2, Hash, Layers } from 'lucide-react';

interface ClaimHistoryProps {
  onEditClaim: (claim: ClaimRecord) => void;
  onNavigateToNewClaim: () => void;
}

export const ClaimHistory: React.FC<ClaimHistoryProps> = ({
  onEditClaim,
  onNavigateToNewClaim,
}) => {
  const { currentUser, userProfile, isAdmin } = useAuth();
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateConfig[]>([getActiveTemplate()]);

  useEffect(() => {
    const unsub = subscribeToTemplates(list => {
      if (list.length > 0) setTemplates(list);
    });
    return () => unsub();
  }, []);

  const resolveTemplate = (claim?: ClaimRecord | null): TemplateConfig => {
    if (!claim) return templates[0] || getActiveTemplate();
    return (
      templates.find(t => t.id === claim.templateId) ||
      templates.find(t => t.isDefault) ||
      templates[0] ||
      getActiveTemplate()
    );
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'DRAFTS'>('ALL');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [mobileFilterCategory, setMobileFilterCategory] = useState<'month' | 'year' | null>('month');

  // Preview Modal
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [viewingClaim, setViewingClaim] = useState<ClaimRecord | null>(null);
  const [selectedMobileClaim, setSelectedMobileClaim] = useState<ClaimRecord | null>(null);

  // Confirmation Modal & Action Feedback
  const [claimToDelete, setClaimToDelete] = useState<ClaimRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [claimToDuplicate, setClaimToDuplicate] = useState<ClaimRecord | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);

  // Fetch claims from Firestore (Admins see all; Users see only their own)
  const fetchClaims = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      if (isAdmin) {
        const q = collection(db, 'claims');
        const snap = await getDocs(q);
        const list: ClaimRecord[] = [];
        snap.forEach(d => {
          list.push(d.data() as ClaimRecord);
        });
        list.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
        setClaims(list);
      } else {
        const myUid = currentUser.uid;
        const myProfileId = userProfile?.id;
        const myPf = (userProfile?.employeeNumber || userProfile?.pfNumber || '').toUpperCase().trim();

        const claimMap = new Map<string, ClaimRecord>();

        // 1. Query by UID
        try {
          const snapUid = await getDocs(query(collection(db, 'claims'), where('userId', '==', myUid)));
          snapUid.forEach(d => claimMap.set(d.id, d.data() as ClaimRecord));
        } catch {}

        // 2. Query by userProfile.id if different
        if (myProfileId && myProfileId !== myUid) {
          try {
            const snapProf = await getDocs(query(collection(db, 'claims'), where('userId', '==', myProfileId)));
            snapProf.forEach(d => claimMap.set(d.id, d.data() as ClaimRecord));
          } catch {}
        }

        // 3. Query by PF Number
        if (myPf) {
          try {
            const snapPf = await getDocs(query(collection(db, 'claims'), where('employeeNumber', '==', myPf)));
            snapPf.forEach(d => {
              const c = d.data() as ClaimRecord;
              if (c.employeeNumber?.toUpperCase().trim() === myPf) {
                claimMap.set(d.id, c);
              }
            });
          } catch {}
        }

        // Strict isolation filter: ensure regular user never sees anyone else's claims
        const list = Array.from(claimMap.values()).filter(c => {
          const matchUid = c.userId === myUid || (myProfileId && c.userId === myProfileId);
          const matchPf = myPf && c.employeeNumber?.toUpperCase().trim() === myPf;
          return matchUid || matchPf;
        });

        list.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
        setClaims(list);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [currentUser, userProfile, isAdmin]);

  const handlePreviewPdf = async (claim: ClaimRecord) => {
    try {
      const templateToUse = resolveTemplate(claim);
      const { blob, url, filename } = await generateOvertimePdf(claim, templateToUse);
      setPreviewPdfUrl(url);
      setPreviewPdfBlob(blob);
      setPreviewFilename(filename);
      setIsPreviewOpen(true);
    } catch (err: any) {
      setToastMessage('Failed to generate preview PDF: ' + err.message);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleDownloadPdf = async (claim: ClaimRecord) => {
    try {
      const templateToUse = resolveTemplate(claim);
      const { url, filename } = await generateOvertimePdf(claim, templateToUse);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setToastMessage('Failed to download PDF: ' + err.message);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handlePrint = async (claim: ClaimRecord) => {
    try {
      const templateToUse = resolveTemplate(claim);
      const { url } = await generateOvertimePdf(claim, templateToUse);
      printPdfDocument(url);
    } catch (err: any) {
      setToastMessage('Failed to print document: ' + err.message);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleDuplicate = (claim: ClaimRecord) => {
    setClaimToDuplicate(claim);
  };

  const confirmCommitDuplicate = async () => {
    if (!claimToDuplicate) return;
    setIsDuplicating(true);
    const newId = 'clm_' + Date.now();
    const duplicated: ClaimRecord = {
      ...claimToDuplicate,
      id: newId,
      claimNumber: `CLM-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      claimDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'claims', newId), sanitizeFirestoreData(duplicated));

      await recordAuditLog({
        action: 'CLAIM_DUPLICATE',
        actionLabel: 'Duplicated Overtime Claim Timesheet',
        targetType: 'claim',
        targetId: newId,
        targetDescription: `${duplicated.claimNumber} (${duplicated.employeeName} - ${duplicated.month}/${duplicated.year})`,
        beforeState: {
          originalClaimNumber: claimToDuplicate.claimNumber,
          employeeName: claimToDuplicate.employeeName,
          month: claimToDuplicate.month,
          year: claimToDuplicate.year,
          totalHoursFormatted: claimToDuplicate.totalHoursFormatted,
          totalOtPayment: claimToDuplicate.totalOtPayment,
        },
        afterState: {
          newClaimNumber: duplicated.claimNumber,
          employeeName: duplicated.employeeName,
          month: duplicated.month,
          year: duplicated.year,
          totalHoursFormatted: duplicated.totalHoursFormatted,
          totalOtPayment: duplicated.totalOtPayment,
        },
        details: {
          originalClaimId: claimToDuplicate.id,
          month: duplicated.month,
          year: duplicated.year,
          totalHours: duplicated.totalHoursFormatted,
          totalOtPayment: duplicated.totalOtPayment,
        },
      });

      fetchClaims();
      setToastMessage('Claim duplicated successfully!');
      setClaimToDuplicate(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `claims/${newId}`);
    } finally {
      setIsDuplicating(false);
    }
  };

  const confirmDeleteClaim = async () => {
    if (!claimToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'claims', claimToDelete.id));
      deleteClaim(claimToDelete.id);

      await recordAuditLog({
        action: 'CLAIM_DELETE',
        actionLabel: 'Deleted Overtime Claim Timesheet',
        targetType: 'claim',
        targetId: claimToDelete.id,
        targetDescription: `${claimToDelete.claimNumber} (${claimToDelete.employeeName} - ${claimToDelete.month}/${claimToDelete.year})`,
        beforeState: {
          claimNumber: claimToDelete.claimNumber,
          employeeName: claimToDelete.employeeName,
          month: claimToDelete.month,
          year: claimToDelete.year,
          totalHoursFormatted: claimToDelete.totalHoursFormatted,
          totalOtPayment: claimToDelete.totalOtPayment,
          branch: claimToDelete.branch,
          department: claimToDelete.department,
        },
        details: {
          month: claimToDelete.month,
          year: claimToDelete.year,
          totalHours: claimToDelete.totalHoursFormatted,
          totalOtPayment: claimToDelete.totalOtPayment,
          branch: claimToDelete.branch,
        },
      });

      fetchClaims();
      if (viewingClaim?.id === claimToDelete.id) {
        setViewingClaim(null);
      }
      setToastMessage(`Claim #${claimToDelete.claimNumber} deleted successfully.`);
      setClaimToDelete(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `claims/${claimToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const availableYears = Array.from(new Set(claims.map(c => c.year))).sort((a, b) => b - a);

  const draftsCount = claims.filter(c => c.status === 'draft').length;
  const submittedCount = claims.filter(c => c.status !== 'draft').length;

  const filtered = claims.filter(c => {
    const matchesSearch =
      c.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.employeeNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.claimNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMonth = selectedMonth === 'ALL' || c.month === selectedMonth;
    const matchesYear = selectedYear === 'ALL' || String(c.year) === selectedYear;

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'DRAFTS' ? c.status === 'draft' : c.status !== 'draft');

    return matchesSearch && matchesMonth && matchesYear && matchesStatus;
  });

  const isAllSelected = filtered.length > 0 && filtered.every(c => selectedClaimIds.includes(c.id));
  const isSomeSelected = filtered.some(c => selectedClaimIds.includes(c.id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedClaimIds([]);
    } else {
      setSelectedClaimIds(filtered.map(c => c.id));
    }
  };

  const toggleSelectClaim = (id: string) => {
    setSelectedClaimIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkPrint = async () => {
    const selectedClaims = claims.filter(c => selectedClaimIds.includes(c.id));
    if (selectedClaims.length === 0) return;
    setIsBulkPrinting(true);
    setToastMessage(`Processing batch print for ${selectedClaims.length} claims...`);
    try {
      for (let i = 0; i < selectedClaims.length; i++) {
        const c = selectedClaims[i];
        const templateToUse = resolveTemplate(c);
        const { url } = await generateOvertimePdf(c, templateToUse);
        printPdfDocument(url);
        if (i < selectedClaims.length - 1) {
          await new Promise(r => setTimeout(r, 600));
        }
      }
      setToastMessage(`Batch print dialog sent for ${selectedClaims.length} claims.`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      setToastMessage('Error printing claims: ' + err.message);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsBulkPrinting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedClaimIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const count = selectedClaimIds.length;
      for (const id of selectedClaimIds) {
        await deleteDoc(doc(db, 'claims', id));
        deleteClaim(id);
      }

      await recordAuditLog({
        action: 'CLAIM_BULK_DELETE',
        actionLabel: `Bulk Deleted ${count} Overtime Claims`,
        targetType: 'claim',
        targetId: `bulk_${Date.now()}`,
        targetDescription: `${count} selected overtime claims`,
        beforeState: {
          claimsSelected: count,
          claimIds: selectedClaimIds,
        },
        afterState: {
          claimsSelected: 0,
        },
        details: {
          count,
          deletedClaimIds: selectedClaimIds,
        },
      });

      setSelectedClaimIds([]);
      setIsBulkDeleteModalOpen(false);
      fetchClaims();
      setToastMessage(`Successfully deleted ${count} selected claims.`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, 'claims/bulk');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                <span className="md:hidden">History</span>
              <span className="hidden md:inline">{isAdmin ? 'Claims & Drafts History (Admin View)' : 'My Overtime Claims & Drafts'}</span>
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <span>{claims.length}</span>
                <span className="hidden md:inline"> Records</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isAdmin
                ? 'Review company-wide submissions, resume drafts, download official A4 PDFs, and inspect timesheets.'
                : 'Your personal claims and saved drafts history. Resume incomplete drafts or download print-ready forms.'}
            </p>
          </div>

          <button
            onClick={onNavigateToNewClaim}
            className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
          >
            <span>Create New Claim</span>
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="mt-4 flex items-center gap-2 border-b border-slate-100 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span className="md:hidden">All</span><span className="hidden md:inline">All Records</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                statusFilter === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {claims.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('SUBMITTED')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'SUBMITTED'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="md:hidden">Submitted</span><span className="hidden md:inline">Submitted / Saved</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                statusFilter === 'SUBMITTED' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {submittedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('DRAFTS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'DRAFTS'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Drafts</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                statusFilter === 'DRAFTS' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
              }`}
            >
              {draftsCount}
            </span>
          </button>
        </div>

        {/* Filters */}
        {/* Mobile Filter & Search Bar */}
        <div className="mt-4 md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
              className={`relative h-10 w-10 flex items-center justify-center rounded-xl border transition shrink-0 ${
                selectedMonth !== 'ALL' || selectedYear !== 'ALL'
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-2xs'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              aria-label="Filter"
            >
              <Filter className="w-4 h-4" />
              {(selectedMonth !== 'ALL' || selectedYear !== 'ALL') && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-600 rounded-full ring-2 ring-white" />
              )}
            </button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search claimant, emp #, dept..."
                className="w-full h-10 rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-8 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile Filter Categories Popover */}
          {isMobileFilterOpen && (
            <div className="mt-2.5 p-3.5 bg-white border border-slate-200 rounded-2xl shadow-lg space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">Filter Categories</span>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedMonth !== 'ALL' || selectedYear !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth('ALL');
                        setSelectedYear('ALL');
                      }}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsMobileFilterOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Main Category: Month Period */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMobileFilterCategory(mobileFilterCategory === 'month' ? null : 'month')}
                  className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">Month Period</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {selectedMonth === 'ALL' ? 'All Months' : selectedMonth}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        mobileFilterCategory === 'month' ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Hidden sub filter categories in dropdown */}
                {mobileFilterCategory === 'month' && (
                  <div className="p-2.5 bg-white border-t border-slate-100 grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedMonth('ALL')}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold text-center transition ${
                        selectedMonth === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      All Months
                    </button>
                    {MONTH_NAMES.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedMonth(m)}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold text-center truncate transition ${
                          selectedMonth === m
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Main Category: Year */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMobileFilterCategory(mobileFilterCategory === 'year' ? null : 'year')}
                  className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">Year</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {selectedYear === 'ALL' ? 'All Years' : selectedYear}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        mobileFilterCategory === 'year' ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Hidden sub filter categories in dropdown */}
                {mobileFilterCategory === 'year' && (
                  <div className="p-2.5 bg-white border-t border-slate-100 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedYear('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                        selectedYear === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      All Years
                    </button>
                    {availableYears.map(y => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setSelectedYear(String(y))}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          selectedYear === String(y)
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Close Button */}
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="px-4 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Filters (3 Columns) */}
        <div className="hidden md:grid md:grid-cols-3 md:gap-3 mt-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search claimant, emp #, dept..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800"
          >
            <option value="ALL">All Months</option>
            {MONTH_NAMES.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800"
          >
            <option value="ALL">All Years</option>
            {availableYears.map(y => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedClaimIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl shadow-xs animate-scale-in">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs">
              {selectedClaimIds.length}
            </span>
            <span className="text-xs font-semibold text-indigo-950">
              {selectedClaimIds.length} {selectedClaimIds.length === 1 ? 'claim' : 'claims'} selected
            </span>
            <span className="text-xs text-indigo-500 font-medium hidden sm:inline">
              (out of {filtered.length} total)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkPrint}
              disabled={isBulkPrinting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-100/70 text-xs font-semibold shadow-xs transition disabled:opacity-50"
              title="Print all selected claims"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isBulkPrinting ? 'Printing...' : 'Print Selected'}</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setIsBulkDeleteModalOpen(true)}
                disabled={isBulkDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                title="Delete all selected claims"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
            )}

            <button
              onClick={() => setSelectedClaimIds([])}
              className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 transition font-medium"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MOBILE VIEW (Branch Network Style Cards) */}
      {/* In card thumbnail: Show Month Period and Status ONLY */}
      {/* On click: Show all data */}
      {/* ======================================================== */}
      <div className="md:hidden space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1 pb-1">
          <span>Claim History ({filtered.length})</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            Loading claims...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">No claims found</h3>
            <p className="text-xs text-slate-500 mt-1">
              No claims match your filters or no claims have been submitted yet.
            </p>
          </div>
        ) : (
          filtered.map(claim => {
            const isDraft = claim.status === 'draft';
            return (
              <div
                key={claim.id}
                onClick={() => setSelectedMobileClaim(claim)}
                className={`rounded-2xl p-4 border shadow-xs hover:border-indigo-300 hover:shadow-md active:bg-slate-50 transition cursor-pointer flex items-center justify-between gap-3 ${
                  isDraft
                    ? 'bg-amber-50/20 border-amber-200/70 hover:border-amber-300'
                    : 'bg-white border-slate-200'
                }`}
              >
                {/* Month Period Only */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      isDraft
                        ? 'bg-amber-100/80 text-amber-800'
                        : 'bg-indigo-50 text-indigo-700'
                    }`}
                  >
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <span className="font-bold text-slate-900 text-sm tracking-tight block truncate">
                      {claim.month} {claim.year}
                    </span>
                  </div>
                </div>

                {/* Status Only */}
                <div className="flex items-center gap-2 shrink-0">
                  {isDraft ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[11px] bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                      <Clock className="w-3 h-3 text-amber-700" />
                      <span>Draft</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Submitted</span>
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* DESKTOP VIEW (Table) */}
      {/* ======================================================== */}
      <div className="hidden md:block rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading claims...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No claims found</h3>
            <p className="text-xs text-slate-500 mt-1">
              No claims match your filters or no claims have been submitted yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-slate-50 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={el => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={toggleSelectAll}
                      title="Select all filtered claims"
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Claim Ref</th>
                  <th className="py-3 px-4">Claimant</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-center">Days</th>
                  <th className="py-3 px-4 text-center">Total OT Hours</th>
                  <th className="py-3 px-4 text-right">Payment Due</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map(claim => {
                  const isSelected = selectedClaimIds.includes(claim.id);
                  const isDraft = claim.status === 'draft';
                  return (
                  <tr
                    key={claim.id}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/60'
                        : isDraft
                        ? 'bg-amber-50/30 hover:bg-amber-50/60'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectClaim(claim.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-600 text-[11px]">
                      {claim.claimNumber}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{claim.employeeName}</div>
                      <div className="text-[11px] text-slate-400">
                        {claim.employeeNumber} &bull; {claim.department}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800">
                        {claim.month} {claim.year}
                      </span>
                    </td>

                    {/* Prominent Status Label (Draft vs Submitted) */}
                    <td className="py-3.5 px-4 text-center">
                      {isDraft ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs"
                          title="Uncompleted draft timesheet - click Resume to continue editing"
                        >
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Draft</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs"
                          title="Submitted overtime claim"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Submitted</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                          claim.claimType === 'OP'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                        title={claim.claimType === 'OP' ? 'Out of Pocket' : 'Overtime'}
                      >
                        {claim.claimType === 'OP' ? 'OP (Out of Pocket)' : 'OT (Overtime)'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 font-semibold text-[11px]">
                        {claim.otDaysCount} Days
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="font-bold font-mono text-indigo-600">
                        {claim.totalHoursFormatted}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-1">
                        ({claim.totalDecimalHours}h)
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold font-mono text-emerald-700">
                        Rs. {(claim.totalOtPayment || (claim.hourlyRate && claim.totalDecimalHours ? claim.hourlyRate * claim.totalDecimalHours : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {claim.hourlyRate ? `@ Rs. ${Number(claim.hourlyRate).toFixed(2)}/h` : ''}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {claim.claimDate}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isDraft && (
                          <button
                            onClick={() => onEditClaim(claim)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                            title="Resume editing this uncompleted draft sheet"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Resume</span>
                          </button>
                        )}

                        <button
                          onClick={() => setViewingClaim(claim)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="View Timesheet"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePreviewPdf(claim)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="Preview Official A4 PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePrint(claim)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                          title="Print Document"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(claim)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {!isDraft && (
                          <button
                            onClick={() => onEditClaim(claim)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                            title="Edit Claim"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(claim)}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition"
                          title="Duplicate Claim"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setClaimToDelete(claim)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title={isDraft ? "Discard Draft" : "Delete Claim"}
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

      {/* Claim Breakdown Modal */}
      
      {/* ======================================================== */}
      {/* MOBILE CLAIM DETAILS MODAL (Branch Network Style) */}
      {/* Opens on clicking card thumbnail, shows all data */}
      {/* ======================================================== */}
      {selectedMobileClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in md:hidden">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-scale-in max-h-[92vh] flex flex-col">
            {/* Modal Header with Gradient */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-start justify-between shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-xs px-2.5 py-0.5 rounded-lg bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    {selectedMobileClaim.claimNumber}
                  </span>
                  {selectedMobileClaim.status === 'draft' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40">
                      <Clock className="w-3 h-3 text-amber-300" />
                      <span>Draft</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                      <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                      <span>Submitted</span>
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-white/10 text-white/90 border border-white/20">
                    {selectedMobileClaim.claimType || 'OT'}
                  </span>
                </div>
                <h2 className="text-lg font-bold tracking-tight text-white pt-1">
                  {selectedMobileClaim.month} {selectedMobileClaim.year} Claim
                </h2>
              </div>
              <button
                onClick={() => setSelectedMobileClaim(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - All Data */}
            <div className="p-4 sm:p-5 space-y-3.5 text-xs overflow-y-auto flex-1">
              {/* Claimant Particulars Card */}
              <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-2xs shrink-0">
                    {selectedMobileClaim.employeeName ? selectedMobileClaim.employeeName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-sm truncate">
                        {selectedMobileClaim.employeeName || 'Staff Member'}
                      </h3>
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {selectedMobileClaim.employeeNumber || 'PF Number'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{selectedMobileClaim.designation || 'Staff'}</span>
                      <span>&bull;</span>
                      <span>{selectedMobileClaim.department || 'Operations'}</span>
                      <span>&bull;</span>
                      <span>{selectedMobileClaim.branch || 'Head Office'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Stat Metric Cards Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Total Overtime Hours */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1 shadow-2xs">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    Total OT Hours
                  </span>
                  <div className="text-base font-black font-mono text-indigo-700">
                    {selectedMobileClaim.totalHoursFormatted}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    ({selectedMobileClaim.totalDecimalHours} decimal hrs)
                  </span>
                </div>

                {/* Days Claimed */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1 shadow-2xs">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    Days Claimed
                  </span>
                  <div className="text-base font-black text-slate-800">
                    {selectedMobileClaim.otDaysCount} Days
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Overtime sheet entries
                  </span>
                </div>

                {/* Overtime Hourly Rate */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1 shadow-2xs">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5 text-slate-500" />
                    Hourly Rate
                  </span>
                  <div className="text-sm font-bold font-mono text-slate-900">
                    Rs. {selectedMobileClaim.hourlyRate ? Number(selectedMobileClaim.hourlyRate).toFixed(2) : '0.00'}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">
                    Day's: Rs. {selectedMobileClaim.daysPay ? Number(selectedMobileClaim.daysPay).toFixed(2) : '0.00'}
                  </span>
                </div>

                {/* Total Payment Due */}
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-3 space-y-1 shadow-2xs">
                  <span className="text-emerald-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Payment Due
                  </span>
                  <div className="text-base font-black font-mono text-emerald-700 truncate">
                    Rs. {(selectedMobileClaim.totalOtPayment || (selectedMobileClaim.hourlyRate && selectedMobileClaim.totalDecimalHours ? selectedMobileClaim.hourlyRate * selectedMobileClaim.totalDecimalHours : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-emerald-600 block">
                    Total authorized payout
                  </span>
                </div>
              </div>

              {/* Financial & Column Breakdown */}
              <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-2">
                <span className="text-slate-700 text-[11px] font-bold uppercase tracking-wider block border-b border-slate-100 pb-1.5">
                  Calculation Breakdown
                </span>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between items-center">
                    <span>Column A (Weekday Regular OT):</span>
                    <span className="font-mono font-bold text-slate-900">
                      Rs. {Number(selectedMobileClaim.otPaymentDueA || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Column B (Special OT / Holiday Hourly):</span>
                    <span className="font-mono font-bold text-slate-900">
                      Rs. {Number(selectedMobileClaim.otPaymentDueB || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Non-Working Days Payment ({selectedMobileClaim.daysPayCount || 0} days):</span>
                    <span className="font-mono font-bold text-slate-900">
                      Rs. {Number(selectedMobileClaim.daysPayTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-100 font-bold text-slate-900">
                    <span>Net Total Overtime Payout:</span>
                    <span className="font-mono text-emerald-700 text-sm">
                      Rs. {(selectedMobileClaim.totalOtPayment || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Claim Metadata & Template */}
              <div className="rounded-xl border border-slate-200 p-3 bg-white space-y-1 text-slate-500 text-[11px]">
                <div className="flex justify-between items-center">
                  <span>Claim Submission Date:</span>
                  <span className="font-medium text-slate-700">{selectedMobileClaim.claimDate || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>A4 Print Template:</span>
                  <span className="font-medium text-slate-700">{resolveTemplate(selectedMobileClaim).name}</span>
                </div>
                {selectedMobileClaim.updatedAt && (
                  <div className="flex justify-between items-center">
                    <span>Last Updated:</span>
                    <span className="font-medium text-slate-700">
                      {new Date(selectedMobileClaim.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Actions Grid */}
              <div className="space-y-2 pt-1">
                <span className="text-slate-700 text-[11px] font-bold uppercase tracking-wider block">
                  Actions
                </span>

                {/* Primary Action: Resume (if Draft) or Edit (if Submitted) */}
                {selectedMobileClaim.status === 'draft' ? (
                  <button
                    onClick={() => {
                      const c = selectedMobileClaim;
                      setSelectedMobileClaim(null);
                      onEditClaim(c);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Resume Editing Draft Sheet</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const c = selectedMobileClaim;
                      setSelectedMobileClaim(null);
                      onEditClaim(c);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit Claim</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const c = selectedMobileClaim;
                      handlePreviewPdf(c);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Preview PDF</span>
                  </button>

                  <button
                    onClick={() => {
                      const c = selectedMobileClaim;
                      handleDownloadPdf(c);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Download</span>
                  </button>

                  <button
                    onClick={() => {
                      const c = selectedMobileClaim;
                      handlePrint(c);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print</span>
                  </button>

                  <button
                    onClick={() => {
                      const c = selectedMobileClaim;
                      handleDuplicate(c);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Duplicate</span>
                  </button>
                </div>

                {/* View 31-Day Timesheet Table */}
                <button
                  onClick={() => {
                    const c = selectedMobileClaim;
                    setSelectedMobileClaim(null);
                    setViewingClaim(c);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs border border-indigo-200 transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View 31-Day Daily Breakdown Table</span>
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => {
                    const c = selectedMobileClaim;
                    setSelectedMobileClaim(null);
                    setClaimToDelete(c);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{selectedMobileClaim.status === 'draft' ? 'Discard Draft Sheet' : 'Delete Claim'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400 uppercase">
                    {viewingClaim.claimNumber}
                  </span>
                  {viewingClaim.status === 'draft' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Draft
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Submitted
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  {viewingClaim.employeeName} &bull; {viewingClaim.month} {viewingClaim.year}
                </h2>
                <p className="text-xs text-slate-500">
                  {viewingClaim.designation} &bull; {viewingClaim.department} &bull; {viewingClaim.branch}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {viewingClaim.status === 'draft' && (
                  <button
                    onClick={() => {
                      const c = viewingClaim;
                      setViewingClaim(null);
                      onEditClaim(c);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Resume Draft</span>
                  </button>
                )}
                <button
                  onClick={() => handlePreviewPdf(viewingClaim)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold shadow-xs"
                >
                  Generate PDF
                </button>
                <button
                  onClick={() => setViewingClaim(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Uncompleted Draft Banner */}
            {viewingClaim.status === 'draft' && (
              <div className="my-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Uncompleted Draft Timesheet:</strong> This claim is saved as a draft. Click &apos;Resume &amp; Submit&apos; to continue entering times and complete submission.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const c = viewingClaim;
                    setViewingClaim(null);
                    onEditClaim(c);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-xs transition shrink-0 cursor-pointer"
                >
                  <Edit className="w-3 h-3" />
                  <span>Resume &amp; Submit</span>
                </button>
              </div>
            )}

            {/* Overtime Rates & Payment Due Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Hourly OT Rate
                </span>
                <span className="text-sm font-bold font-mono text-slate-800">
                  {viewingClaim.hourlyRate ? `Rs. ${Number(viewingClaim.hourlyRate).toFixed(2)}` : 'N/A'}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Day&apos;s Pay
                </span>
                <span className="text-sm font-bold font-mono text-slate-800">
                  {viewingClaim.daysPay ? `Rs. ${Number(viewingClaim.daysPay).toFixed(2)}` : 'N/A'}
                </span>
              </div>
              <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Payment Due &apos;A&apos;
                </span>
                <span className="text-sm font-bold font-mono text-emerald-800">
                  Rs. {(viewingClaim.otPaymentDueA || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-200">
                <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                  Total Payment Due
                </span>
                <span className="text-sm font-black font-mono text-indigo-700">
                  Rs. {(viewingClaim.totalOtPayment || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-2.5">Date</th>
                    <th className="py-2 px-2 text-center">Day</th>
                    <th className="py-2 px-3">Reason / Duties</th>
                    <th className="py-2 px-2 text-center">Approved by Mgr</th>
                    <th className="py-2 px-2 text-center">Start</th>
                    <th className="py-2 px-2 text-center">Left</th>
                    <th className="py-2 px-2 text-center">Break</th>
                    <th className="py-2 px-2 text-center">Total Worked</th>
                    <th className="py-2 px-2 text-center">Overtime (A)</th>
                    <th className="py-2 px-2 text-center">Special (B)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingClaim.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-medium">{row.date}</td>
                      <td className="py-2 px-2 text-center font-semibold">{row.dayOfWeek}</td>
                      <td className="py-2 px-3 text-slate-700">{row.reason || '-'}</td>
                      <td className="py-2 px-2 text-center font-medium text-slate-600">{row.approvedBy || '-'}</td>
                      <td className="py-2 px-2 text-center font-mono">{row.startTime || '-'}</td>
                      <td className="py-2 px-2 text-center font-mono">{row.endTime || '-'}</td>
                      <td className="py-2 px-2 text-center">{row.breakMinutes ? `${row.breakMinutes}m` : '-'}</td>
                      <td className="py-2 px-2 text-center font-mono text-slate-600">
                        {row.totalWorkMinutes ? `${Math.floor(row.totalWorkMinutes / 60)}h ${row.totalWorkMinutes % 60}m` : '-'}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-indigo-600 font-mono">
                        {row.totalFormatted}
                        {row.isCapped && (
                          <span className="block text-[9px] text-amber-700 font-sans">
                            Capped
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-slate-600">
                        {row.specialAssignmentHours || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Days: <strong>{viewingClaim.otDaysCount}</strong>
              </span>
              <span className="font-bold text-slate-800">
                Total Overtime: <strong className="text-indigo-600 text-sm font-black">{viewingClaim.totalHoursFormatted}</strong> ({viewingClaim.totalDecimalHours} hrs)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfUrl={previewPdfUrl}
        filename={previewFilename}
        pdfBlob={previewPdfBlob}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!claimToDelete}
        onClose={() => setClaimToDelete(null)}
        onConfirm={confirmDeleteClaim}
        title={claimToDelete?.status === 'draft' ? 'Discard Draft Timesheet' : 'Delete Overtime Timesheet'}
        message={
          claimToDelete?.status === 'draft'
            ? `Are you sure you want to discard draft claim #${claimToDelete?.claimNumber}? All uncompleted entries will be permanently removed.`
            : `Are you sure you want to permanently delete claim #${claimToDelete?.claimNumber}? All overtime calculations will be lost.`
        }
        confirmText={claimToDelete?.status === 'draft' ? 'Discard Draft' : 'Delete Claim'}
        cancelText={claimToDelete?.status === 'draft' ? 'Keep Draft' : 'Keep Claim'}
        variant="danger"
        isLoading={isDeleting}
        details={claimToDelete ? [
          { label: 'Claimant', value: claimToDelete.employeeName },
          { label: 'Month/Year', value: `${claimToDelete.month} ${claimToDelete.year}` },
          { label: 'Total Hours', value: claimToDelete.totalHoursFormatted },
          { label: 'Total Payment', value: `Rs. ${(claimToDelete.totalOtPayment || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        ] : []}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={confirmBulkDelete}
        title={`Delete ${selectedClaimIds.length} Selected Claims`}
        message={`Are you sure you want to permanently delete the ${selectedClaimIds.length} selected overtime claims? This action cannot be undone.`}
        confirmText={`Delete ${selectedClaimIds.length} Claims`}
        cancelText="Cancel"
        variant="danger"
        isLoading={isBulkDeleting}
        details={[
          { label: 'Selected Claims', value: `${selectedClaimIds.length} records` },
          { label: 'Action', value: 'Permanent deletion from database' },
        ]}
      />

      {/* Duplicate Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!claimToDuplicate}
        onClose={() => setClaimToDuplicate(null)}
        onConfirm={confirmCommitDuplicate}
        title="Duplicate Overtime Claim"
        message={`Are you sure you want to duplicate claim #${claimToDuplicate?.claimNumber}? A copy with today's date will be created.`}
        confirmText="Duplicate Claim"
        cancelText="Cancel"
        variant="info"
        isLoading={isDuplicating}
        details={claimToDuplicate ? [
          { label: 'Claimant', value: claimToDuplicate.employeeName },
          { label: 'Period', value: `${claimToDuplicate.month} ${claimToDuplicate.year}` },
          { label: 'Total Hours', value: claimToDuplicate.totalHoursFormatted },
        ] : []}
      />

      {/* Action Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-2xl border border-slate-800 flex items-center gap-2.5 text-xs animate-scale-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
