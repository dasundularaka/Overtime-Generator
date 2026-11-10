import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  FileText,
  Users,
  Sliders,
  PlusCircle,
  Download,
  Printer,
  ChevronRight,
  Sparkles,
  Calendar,
  CheckCircle2,
  Trash2,
  Copy,
  ExternalLink,
  Shield,
  UserCheck,
  AlertTriangle,
  Banknote,
  Building2,
  Search,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { ClaimRecord, TemplateConfig } from '../types';
import { getActiveTemplate } from '../utils/storage';
import { recordAuditLog } from '../utils/auditLogger';
import { generateOvertimePdf, printPdfDocument } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { ConfirmationModal } from './ConfirmationModal';
import { NavigationTab } from './Navbar';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';
import { KpiGridSkeleton, TableSkeleton } from './Skeleton';
import { Loader2 } from 'lucide-react';

interface DashboardProps {
  onNavigate: (tab: NavigationTab) => void;
  onEditClaim: (claim: ClaimRecord) => void;
  onOpenHelp?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigate,
  onEditClaim,
  onOpenHelp,
}) => {
  const { currentUser, userProfile, isSuperAdmin, isAdmin } = useAuth();
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [allClaims, setAllClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [templates, setTemplates] = useState<TemplateConfig[]>([getActiveTemplate()]);

  // Super Admin view mode and filtering state
  const [superAdminViewMode, setSuperAdminViewMode] = useState<'personal' | 'all'>('personal');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('ALL');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterYear, setFilterYear] = useState('ALL');

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

  // PDF Preview State
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [claimToDeleteRecord, setClaimToDeleteRecord] = useState<ClaimRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  // Fetch claims from Firestore: strictly fetch relevant user's own claims for the Dashboard (for all users, including Admins)
  const fetchClaims = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const myUid = currentUser.uid;
      const myProfileId = userProfile?.id;
      const myPf = (userProfile?.employeeNumber || userProfile?.pfNumber || '').toUpperCase().trim();

      const claimMap = new Map<string, ClaimRecord>();

      // 1. Query by UID
      try {
        const snapUid = await getDocs(query(collection(db, 'claims'), where('userId', '==', myUid)));
        snapUid.forEach(d => claimMap.set(d.id, d.data() as ClaimRecord));
      } catch (e) {
        console.warn('Dashboard fetch by UID error:', e);
      }

      // 2. Query by userProfile.id if different
      if (myProfileId && myProfileId !== myUid) {
        try {
          const snapProf = await getDocs(query(collection(db, 'claims'), where('userId', '==', myProfileId)));
          snapProf.forEach(d => claimMap.set(d.id, d.data() as ClaimRecord));
        } catch (e) {
          console.warn('Dashboard fetch by profile ID error:', e);
        }
      }

      // 3. Query by employeeNumber (PF Number)
      if (myPf) {
        try {
          const snapPf = await getDocs(query(collection(db, 'claims'), where('employeeNumber', '==', myPf)));
          snapPf.forEach(d => {
            const c = d.data() as ClaimRecord;
            if (c.employeeNumber?.toUpperCase().trim() === myPf) {
              claimMap.set(d.id, c);
            }
          });
        } catch (e) {
          console.warn('Dashboard fetch by PF error:', e);
        }
      }

      const list = Array.from(claimMap.values());
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setClaims(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'claims');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllClaimsForSuperAdmin = async () => {
    if (!isSuperAdmin) return;
    setLoadingAll(true);
    try {
      const snap = await getDocs(collection(db, 'claims'));
      const list: ClaimRecord[] = [];
      snap.forEach(d => list.push(d.data() as ClaimRecord));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setAllClaims(list);
    } catch (e) {
      console.warn('Super admin fetch all claims note:', e);
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [currentUser, userProfile]);

  useEffect(() => {
    if (isSuperAdmin && superAdminViewMode === 'all') {
      fetchAllClaimsForSuperAdmin();
    }
  }, [isSuperAdmin, superAdminViewMode]);

  // Derived filter options for Super Admin
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    allClaims.forEach(c => {
      if (c.branch) set.add(c.branch);
    });
    return Array.from(set).sort();
  }, [allClaims]);

  const availableDepts = useMemo(() => {
    const set = new Set<string>();
    allClaims.forEach(c => {
      if (c.department) set.add(c.department);
    });
    return Array.from(set).sort();
  }, [allClaims]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    const currentYear = new Date().getFullYear();
    set.add(currentYear);
    allClaims.forEach(c => {
      if (c.year) set.add(Number(c.year));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [allClaims]);

  // Filtered active claims for display
  const activeDisplayClaims = useMemo(() => {
    if (isSuperAdmin && superAdminViewMode === 'all') {
      return allClaims.filter(c => {
        if (filterSearch.trim()) {
          const q = filterSearch.toLowerCase().trim();
          const matchesName = (c.employeeName || '').toLowerCase().includes(q);
          const matchesPf = (c.employeeNumber || '').toLowerCase().includes(q);
          const matchesBranch = (c.branch || '').toLowerCase().includes(q);
          const matchesDept = (c.department || '').toLowerCase().includes(q);
          if (!matchesName && !matchesPf && !matchesBranch && !matchesDept) return false;
        }
        if (filterBranch !== 'ALL' && c.branch !== filterBranch) return false;
        if (filterDept !== 'ALL' && c.department !== filterDept) return false;
        if (filterMonth !== 'ALL' && c.month !== filterMonth) return false;
        if (filterYear !== 'ALL' && String(c.year) !== filterYear) return false;
        return true;
      });
    }
    return claims;
  }, [isSuperAdmin, superAdminViewMode, allClaims, claims, filterSearch, filterBranch, filterDept, filterMonth, filterYear]);

  // Submitted Claims (Drafts excluded from Recent Claims and Totals)
  const submittedClaims = useMemo(() => {
    return activeDisplayClaims.filter(c => c.status !== 'draft');
  }, [activeDisplayClaims]);

  // Overall Statistics - Only submissions calculate total payments and other stats
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let totalEarnings = 0;
    for (const c of submittedClaims) {
      totalMinutes += c.totalMinutes || 0;
      if (c.totalOtPayment) {
        totalEarnings += c.totalOtPayment;
      } else if (c.hourlyRate && c.totalDecimalHours) {
        totalEarnings += c.hourlyRate * c.totalDecimalHours;
      }
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const totalRemMinutes = totalMinutes % 60;
    const totalHoursFormatted = `${String(totalHours).padStart(2, '0')}:${String(totalRemMinutes).padStart(2, '0')}`;
    const totalDecimalHours = (totalMinutes / 60).toFixed(1);

    return {
      totalClaimsCount: submittedClaims.length,
      totalHoursFormatted,
      totalDecimalHours,
      totalEarnings,
    };
  }, [submittedClaims]);

  const handleDownloadPdf = async (claim: ClaimRecord) => {
    if (generatingPdfId) return;
    setGeneratingPdfId(claim.id);
    try {
      const templateToUse = resolveTemplate(claim);
      const { url, filename } = await generateOvertimePdf(claim, templateToUse);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // PDF download failed silently or retry
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const handlePreview = async (claim: ClaimRecord) => {
    if (generatingPdfId) return;
    setGeneratingPdfId(claim.id);
    try {
      const templateToUse = resolveTemplate(claim);
      const { blob, url, filename } = await generateOvertimePdf(claim, templateToUse);
      setPreviewPdfUrl(url);
      setPreviewPdfBlob(blob);
      setPreviewFilename(filename);
      setIsPreviewOpen(true);
    } catch {
      // preview error
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const handlePrint = async (claim: ClaimRecord) => {
    if (generatingPdfId) return;
    setGeneratingPdfId(claim.id);
    try {
      const templateToUse = resolveTemplate(claim);
      const { url } = await generateOvertimePdf(claim, templateToUse);
      printPdfDocument(url);
    } catch {
      // print error
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const confirmDeleteClaim = async () => {
    if (!claimToDeleteRecord || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'claims', claimToDeleteRecord.id));

      await recordAuditLog({
        action: 'CLAIM_DELETE',
        actionLabel: 'Deleted Overtime Claim Timesheet',
        targetType: 'claim',
        targetId: claimToDeleteRecord.id,
        targetDescription: `${claimToDeleteRecord.claimNumber} (${claimToDeleteRecord.employeeName} - ${claimToDeleteRecord.month}/${claimToDeleteRecord.year})`,
        beforeState: {
          claimNumber: claimToDeleteRecord.claimNumber,
          employeeName: claimToDeleteRecord.employeeName,
          month: claimToDeleteRecord.month,
          year: claimToDeleteRecord.year,
          totalHoursFormatted: claimToDeleteRecord.totalHoursFormatted,
          totalOtPayment: claimToDeleteRecord.totalOtPayment,
        },
        details: {
          month: claimToDeleteRecord.month,
          year: claimToDeleteRecord.year,
          totalHours: claimToDeleteRecord.totalHoursFormatted,
          totalOtPayment: claimToDeleteRecord.totalOtPayment,
        },
      });

      setClaimToDeleteRecord(null);
      fetchClaims();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `claims/${claimToDeleteRecord.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const userCap = userProfile?.maxOtHoursPerDay !== undefined ? userProfile.maxOtHoursPerDay : 2.0;

  return (
    <div className="space-y-6 pb-16">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Shift: 8:00 AM – 4:45 PM &bull; 15-Min Step Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {userProfile?.name || 'User'}!
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
              General shift is 8:00 AM to 4:45 PM. Overtime is automatically generated in 15-minute intervals only for time worked after 4:45 PM, capped at your assigned limit ({userCap} hrs max/day).
            </p>

            {/* Shift Rules Tags */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-300">
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                Shift: 08:00 - 16:45
              </span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                OT Starts After 4:45 PM
              </span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                15-Min Blocks (e.g. 15m, 30m, 45m)
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-500/40">
                Daily Cap: {userCap}h
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0">
            <button
              onClick={() => onNavigate('branches')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-100 px-5 py-3 text-xs font-semibold border border-slate-700 shadow-md transition cursor-pointer"
              title="Access corporate bank branch network directory"
            >
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Branch Network</span>
            </button>
          </div>
        </div>
      </div>

      {/* Super Admin Dashboard Scope & Filter Bar */}
      {isSuperAdmin && (
        <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Super Admin Dashboard Scope
                </h3>
                <p className="text-[11px] text-slate-500">
                  Switch between personal overtime or inspect all staff company records with live filters.
                </p>
              </div>
            </div>

            {/* Scope Switcher */}
            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSuperAdminViewMode('personal')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  superAdminViewMode === 'personal'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                My Personal Details
              </button>
              <button
                type="button"
                onClick={() => setSuperAdminViewMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  superAdminViewMode === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Users Data (Filterable)
              </button>
            </div>
          </div>

          {/* Filtering Controls (Active only in All Users mode) */}
          {superAdminViewMode === 'all' && (
            <div className="space-y-3 pt-1 animate-scale-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                    placeholder="Search name or PF..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Branch Select */}
                <select
                  value={filterBranch}
                  onChange={e => setFilterBranch(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:border-indigo-500"
                >
                  <option value="ALL">All Branches</option>
                  {availableBranches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                {/* Department Select */}
                <select
                  value={filterDept}
                  onChange={e => setFilterDept(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:border-indigo-500"
                >
                  <option value="ALL">All Departments</option>
                  {availableDepts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                {/* Month Select */}
                <select
                  value={filterMonth}
                  onChange={e => setFilterMonth(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:border-indigo-500"
                >
                  <option value="ALL">All Months</option>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                {/* Year Select */}
                <select
                  value={filterYear}
                  onChange={e => setFilterYear(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:border-indigo-500"
                >
                  <option value="ALL">All Years</option>
                  {availableYears.map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Status and reset */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-0.5">
                <span>
                  Showing <strong className="text-slate-900 font-bold">{submittedClaims.length}</strong> matching submitted claims
                  {loadingAll && ' (Syncing...)'}
                </span>

                {(filterSearch || filterBranch !== 'ALL' || filterDept !== 'ALL' || filterMonth !== 'ALL' || filterYear !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterSearch('');
                      setFilterBranch('ALL');
                      setFilterDept('ALL');
                      setFilterMonth('ALL');
                      setFilterYear('ALL');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metric KPI Cards */}
      {loading ? (
        <KpiGridSkeleton count={5} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Total Overtime Hours */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {isSuperAdmin && superAdminViewMode === 'all' ? 'Total OT (Filtered Staff)' : 'My Total Overtime'}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {stats.totalHoursFormatted}
            </span>
            <span className="text-xs font-medium text-slate-500">
              ({stats.totalDecimalHours} hrs)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Calculated after 4:45 PM in 15m steps
          </p>
        </div>

        {/* Total OT Payment / Earnings */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {isSuperAdmin && superAdminViewMode === 'all' ? 'Total Pay (Filtered Staff)' : 'My Total OT Pay'}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-700 tracking-tight">
              Rs. {stats.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Form 10756 Remuneration Due
          </p>
        </div>

        {/* Claims Processed */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {isSuperAdmin && superAdminViewMode === 'all' ? 'Filtered Staff Claims' : 'My Claims'}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {stats.totalClaimsCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Ready for official A4 reprint anytime
          </p>
        </div>

        {/* Assigned Overtime Limit */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Assigned Daily Cap
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-emerald-700 tracking-tight">
              {userCap}h
            </span>
            <span className="text-xs font-medium text-slate-500">max/day</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {isAdmin ? 'Admins can edit in User Admin' : 'Configured by Administrator'}
          </p>
        </div>

        {/* Role & Claim Type */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Role &amp; Claim Type
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold capitalize ${isSuperAdmin ? 'text-amber-600' : 'text-slate-900'}`}>
                {isSuperAdmin ? 'Super Admin' : userProfile?.role || 'User'}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                {userProfile?.claimType === 'OP' ? 'OP (Out of Pocket)' : 'OT (Overtime)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {isSuperAdmin ? 'System Owner & Administrator' : userProfile?.department}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Recent Claims Section */}
      <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isSuperAdmin && superAdminViewMode === 'all' ? 'All Staff Submitted Claims (Filtered)' : 'My Recent Overtime Claims'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isSuperAdmin && superAdminViewMode === 'all'
                ? 'Review, inspect, and re-download official A4 PDFs of staff submissions.'
                : 'Review, edit, or re-download official A4 PDFs of your past submissions.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => onNavigate('history')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition cursor-pointer"
                title="View and inspect all staff members submitted OT sheets"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View Staff Submitted OT Sheets</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => onNavigate('history')}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 px-2 py-1"
            >
              <span>My Full History</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <TableSkeleton
              rows={5}
              cols={7}
              colWidths={['w-24', 'w-24', 'w-20', 'w-16', 'w-20', 'w-20', 'w-24']}
            />
          </div>
        ) : submittedClaims.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No claims submitted yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Enter your daily starting and ending times to calculate overtime and generate a print-ready A4 form.
            </p>
            <button
              onClick={() => onNavigate('new-claim')}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Claim</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Claimant</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-center">Days</th>
                  <th className="py-3 px-4 text-center">Total Hours</th>
                  <th className="py-3 px-4 text-right">Payment Due</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {submittedClaims.slice(0, 5).map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{claim.employeeName}</div>
                      <div className="text-[11px] text-slate-400">
                        {claim.employeeNumber} &bull; {claim.department}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-800">
                        {claim.month} {claim.year}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {claim.status === 'draft' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-300">
                          <Clock className="w-2.5 h-2.5 text-amber-600" />
                          <span>Draft</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
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
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
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
                      {claim.claimDate || claim.createdAt?.split('T')[0]}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handlePreview(claim)}
                          disabled={generatingPdfId !== null || isDeleting}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Preview A4 PDF"
                        >
                          {generatingPdfId === claim.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handlePrint(claim)}
                          disabled={generatingPdfId !== null || isDeleting}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Print Document"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(claim)}
                          disabled={generatingPdfId !== null || isDeleting}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEditClaim(claim)}
                          disabled={isDeleting}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Open & Edit Claim"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setClaimToDeleteRecord(claim)}
                          disabled={isDeleting}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Delete Claim"
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
        )}
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfUrl={previewPdfUrl}
        filename={previewFilename}
        pdfBlob={previewPdfBlob}
      />

      {/* Confirmation Modal for Claim Deletion */}
      <ConfirmationModal
        isOpen={!!claimToDeleteRecord}
        onClose={() => setClaimToDeleteRecord(null)}
        onConfirm={confirmDeleteClaim}
        title="Delete Overtime Claim"
        message={`Are you sure you want to permanently delete claim #${claimToDeleteRecord?.claimNumber}? All overtime calculation records for this claim will be removed.`}
        confirmText="Delete Claim"
        cancelText="Keep Claim"
        variant="danger"
        isLoading={isDeleting}
        details={claimToDeleteRecord ? [
          { label: 'Claimant Name', value: claimToDeleteRecord.employeeName },
          { label: 'Month & Year', value: `${claimToDeleteRecord.month} ${claimToDeleteRecord.year}` },
          { label: 'Total OT Hours', value: claimToDeleteRecord.totalHoursFormatted },
          { label: 'Overtime Payment', value: `Rs. ${(claimToDeleteRecord.totalOtPayment || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        ] : []}
      />
    </div>
  );
};
