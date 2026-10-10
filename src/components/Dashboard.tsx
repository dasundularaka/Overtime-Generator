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

interface DashboardProps {
  onNavigate: (tab: NavigationTab) => void;
  onEditClaim: (claim: ClaimRecord) => void;
  onOpenHelp: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigate,
  onEditClaim,
  onOpenHelp,
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

  // PDF Preview State
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [claimToDeleteRecord, setClaimToDeleteRecord] = useState<ClaimRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch claims from Firestore based on role (Users cannot see others details)
  const fetchClaims = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      let q;
      if (isAdmin) {
        q = collection(db, 'claims');
      } else {
        q = query(collection(db, 'claims'), where('userId', '==', currentUser.uid));
      }
      const snap = await getDocs(q);
      const list: ClaimRecord[] = [];
      snap.forEach(d => list.push(d.data() as ClaimRecord));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setClaims(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [currentUser, isAdmin]);

  // Overall Statistics
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let totalEarnings = 0;
    for (const c of claims) {
      totalMinutes += c.totalMinutes || 0;
      if (c.totalOtPayment) totalEarnings += c.totalOtPayment;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const totalRemMinutes = totalMinutes % 60;
    const totalHoursFormatted = `${String(totalHours).padStart(2, '0')}:${String(totalRemMinutes).padStart(2, '0')}`;
    const totalDecimalHours = (totalMinutes / 60).toFixed(1);

    return {
      totalClaimsCount: claims.length,
      totalHoursFormatted,
      totalDecimalHours,
      totalEarnings,
    };
  }, [claims]);

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
    } catch {
      // PDF download failed silently or retry
    }
  };

  const handlePreview = async (claim: ClaimRecord) => {
    try {
      const templateToUse = resolveTemplate(claim);
      const { url, filename } = await generateOvertimePdf(claim, templateToUse);
      setPreviewPdfUrl(url);
      setPreviewFilename(filename);
      setIsPreviewOpen(true);
    } catch {
      // preview error
    }
  };

  const handlePrint = async (claim: ClaimRecord) => {
    try {
      const templateToUse = resolveTemplate(claim);
      const { url } = await generateOvertimePdf(claim, templateToUse);
      printPdfDocument(url);
    } catch {
      // print error
    }
  };

  const confirmDeleteClaim = async () => {
    if (!claimToDeleteRecord) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'claims', claimToDeleteRecord.id));

      await recordAuditLog({
        action: 'CLAIM_DELETE',
        actionLabel: 'Deleted overtime claim',
        targetType: 'claim',
        targetId: claimToDeleteRecord.id,
        targetDescription: `${claimToDeleteRecord.claimNumber} (${claimToDeleteRecord.employeeName} - ${claimToDeleteRecord.month}/${claimToDeleteRecord.year})`,
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
              onClick={() => onNavigate('new-claim')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 text-xs font-bold shadow-lg transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Submit Timesheet</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => onNavigate('users')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 px-4 py-2.5 text-xs font-semibold border border-purple-500/40 transition"
              >
                <UserCheck className="w-4 h-4" />
                <span>Assign User OT Limits</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Overtime Hours */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {isAdmin ? 'Total Company OT' : 'My Total Overtime'}
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
              {isAdmin ? 'Total OT Payment' : 'My Total OT Pay'}
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
              {isAdmin ? 'All Submitted Claims' : 'My Claims'}
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
              <span className="text-base font-bold text-slate-900 capitalize">
                {userProfile?.role || 'User'}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                {userProfile?.claimType === 'OP' ? 'OP (Out of Pocket)' : 'OT (Overtime)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {userProfile?.department}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Claims Section */}
      <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAdmin ? 'Recent Company Overtime Claims' : 'My Recent Overtime Claims'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review, edit, or re-download official A4 PDFs of past submissions.
            </p>
          </div>

          <button
            onClick={() => onNavigate('history')}
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <span>View All History</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading claims...</div>
        ) : claims.length === 0 ? (
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
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-center">Days</th>
                  <th className="py-3 px-4 text-center">Total Hours</th>
                  <th className="py-3 px-4 text-right">Payment Due</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {claims.slice(0, 5).map(claim => (
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
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="Preview A4 PDF"
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
                        <button
                          onClick={() => onEditClaim(claim)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                          title="Open & Edit Claim"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setClaimToDeleteRecord(claim)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
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
