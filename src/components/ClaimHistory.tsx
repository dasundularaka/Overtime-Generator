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
import { MONTH_NAMES } from '../utils/timeCalculations';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';

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
      alert('Failed to generate preview PDF: ' + err.message);
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
      alert('Failed to download PDF: ' + err.message);
    }
  };

  const handlePrint = async (claim: ClaimRecord) => {
    try {
      const templateToUse = resolveTemplate(claim);
      const { url } = await generateOvertimePdf(claim, templateToUse);
      printPdfDocument(url);
    } catch (err: any) {
      alert('Failed to print document: ' + err.message);
    }
  };

  const handleDuplicate = async (claim: ClaimRecord) => {
    const newId = 'clm_' + Date.now();
    const duplicated: ClaimRecord = {
      ...claim,
      id: newId,
      claimNumber: `CLM-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      claimDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'claims', newId), duplicated);
      fetchClaims();
      alert('Claim duplicated successfully!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `claims/${newId}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this overtime claim permanently?')) {
      try {
        await deleteDoc(doc(db, 'claims', id));
        fetchClaims();
        if (viewingClaim?.id === id) {
          setViewingClaim(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `claims/${id}`);
      }
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
                      <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                        {claim.claimType || 'OT'}
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
                          onClick={() => handleDelete(claim.id)}
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
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
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

            <div className="mt-4 flex-1 overflow-y-auto pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-center">Day</th>
                    <th className="py-2 px-3 text-center">Start</th>
                    <th className="py-2 px-3 text-center">End</th>
                    <th className="py-2 px-3 text-center">Work Diff</th>
                    <th className="py-2 px-3 text-center">Break</th>
                    <th className="py-2 px-3 text-center">Generated OT</th>
                    <th className="py-2 px-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingClaim.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium">{row.date}</td>
                      <td className="py-2 px-3 text-center font-semibold">{row.dayOfWeek}</td>
                      <td className="py-2 px-3 text-center font-mono">{row.startTime || '-'}</td>
                      <td className="py-2 px-3 text-center font-mono">{row.endTime || '-'}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-500">
                        {row.totalWorkMinutes ? `${Math.floor(row.totalWorkMinutes / 60)}h ${row.totalWorkMinutes % 60}m` : '-'}
                      </td>
                      <td className="py-2 px-3 text-center">{row.breakMinutes ? `${row.breakMinutes}m` : '-'}</td>
                      <td className="py-2 px-3 text-center font-bold text-indigo-600 font-mono">
                        {row.totalFormatted}
                        {row.isCapped && (
                          <span className="block text-[9px] text-amber-700 font-sans">
                            Capped
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{row.reason}</td>
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
    </div>
  );
};
