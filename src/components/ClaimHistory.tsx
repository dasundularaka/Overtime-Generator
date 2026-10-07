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
import { ClaimRecord, TemplateConfig } from '../types';
import { getActiveTemplate } from '../utils/storage';
import { generateOvertimePdf, printPdfDocument } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { ConfirmationModal } from './ConfirmationModal';
import { MONTH_NAMES } from '../utils/timeCalculations';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';
import { Banknote, CheckCircle2 } from 'lucide-react';

interface ClaimHistoryProps {
  onEditClaim: (claim: ClaimRecord) => void;
  onNavigateToNewClaim: () => void;
}

export const ClaimHistory: React.FC<ClaimHistoryProps> = ({
  onEditClaim,
  onNavigateToNewClaim,
}) => {
  const { currentUser, isAdmin } = useAuth();
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

  // Preview Modal
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [viewingClaim, setViewingClaim] = useState<ClaimRecord | null>(null);

  // Confirmation Modal & Action Feedback
  const [claimToDelete, setClaimToDelete] = useState<ClaimRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [claimToDuplicate, setClaimToDuplicate] = useState<ClaimRecord | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch claims from Firestore (Admins see all; Users see only their own)
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
      snap.forEach(d => {
        list.push(d.data() as ClaimRecord);
      });
      // Sort newest first
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

  const handlePreviewPdf = async (claim: ClaimRecord) => {
    try {
      const templateToUse = resolveTemplate(claim);
      const { url, filename } = await generateOvertimePdf(claim, templateToUse);
      setPreviewPdfUrl(url);
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
      await setDoc(doc(db, 'claims', newId), duplicated);
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

  const filtered = claims.filter(c => {
    const matchesSearch =
      c.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.employeeNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.claimNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMonth = selectedMonth === 'ALL' || c.month === selectedMonth;
    const matchesYear = selectedYear === 'ALL' || String(c.year) === selectedYear;

    return matchesSearch && matchesMonth && matchesYear;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {isAdmin ? 'All Submitted Claims (Admin View)' : 'My Overtime Claims'}
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {claims.length} Records
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isAdmin
                ? 'Review company-wide claims, download official A4 PDFs, and inspect timesheets.'
                : 'Your personal claims history. Access previous submissions and re-print forms.'}
            </p>
          </div>

          <button
            onClick={onNavigateToNewClaim}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
          >
            <span>Create New Claim</span>
          </button>
        </div>

        {/* Filters */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
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
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Claim Ref</th>
                  <th className="py-3 px-4">Claimant</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-center">Days</th>
                  <th className="py-3 px-4 text-center">Total OT Hours</th>
                  <th className="py-3 px-4 text-right">Payment Due</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-50/80 transition-colors">
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
                        <button
                          onClick={() => onEditClaim(claim)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                          title="Edit Claim"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
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

      {/* Claim Breakdown Modal */}
      {viewingClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <span className="font-mono text-xs font-bold text-slate-400 uppercase">
                  {viewingClaim.claimNumber}
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  {viewingClaim.employeeName} &bull; {viewingClaim.month} {viewingClaim.year}
                </h2>
                <p className="text-xs text-slate-500">
                  {viewingClaim.designation} &bull; {viewingClaim.department} &bull; {viewingClaim.branch}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePreviewPdf(viewingClaim)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs"
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
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!claimToDelete}
        onClose={() => setClaimToDelete(null)}
        onConfirm={confirmDeleteClaim}
        title="Delete Overtime Timesheet"
        message={`Are you sure you want to permanently delete claim #${claimToDelete?.claimNumber}? All overtime calculations will be lost.`}
        confirmText="Delete Claim"
        cancelText="Keep Claim"
        variant="danger"
        isLoading={isDeleting}
        details={claimToDelete ? [
          { label: 'Claimant', value: claimToDelete.employeeName },
          { label: 'Month/Year', value: `${claimToDelete.month} ${claimToDelete.year}` },
          { label: 'Total Hours', value: claimToDelete.totalHoursFormatted },
          { label: 'Total Payment', value: `Rs. ${(claimToDelete.totalOtPayment || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        ] : []}
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
