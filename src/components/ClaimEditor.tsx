import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Calendar,
  Clock,
  Printer,
  Eye,
  Download,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Layers,
  ChevronDown,
  ShieldAlert,
  Info,
  FileText,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import {
  ClaimRecord,
  OvertimeRow,
  ClaimType,
} from '../types';
import {
  calculateShiftOvertime,
  formatMinutesToTime,
  getDayOfWeek,
  generateMonthDates,
  isWeekendDay,
  MONTH_NAMES,
  GENERAL_SHIFT_START,
  GENERAL_SHIFT_END,
} from '../utils/timeCalculations';
import {
  getActiveTemplate,
  getSettings,
  saveClaim,
} from '../utils/storage';
import { generateOvertimePdf, printPdfDocument } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';
import { TemplateConfig } from '../types';

interface ClaimEditorProps {
  initialClaim?: ClaimRecord | null;
  onClaimSaved?: (claim: ClaimRecord) => void;
  onNavigateToDesigner?: () => void;
}

export const ClaimEditor: React.FC<ClaimEditorProps> = ({
  initialClaim,
  onClaimSaved,
  onNavigateToDesigner,
}) => {
  const { currentUser, userProfile, isAdmin } = useAuth();
  const settings = useMemo(() => getSettings(), []);

  // Templates from Cloud Firestore
  const [availableTemplates, setAvailableTemplates] = useState<TemplateConfig[]>([getActiveTemplate()]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialClaim?.templateId || getSettings().activeTemplateId || 'standard-official-template-v1'
  );

  useEffect(() => {
    const unsub = subscribeToTemplates(templates => {
      if (templates.length > 0) {
        setAvailableTemplates(templates);
        if (!selectedTemplateId || !templates.some(t => t.id === selectedTemplateId)) {
          const def = templates.find(t => t.isDefault) || templates[0];
          if (def) setSelectedTemplateId(def.id);
        }
      }
    });
    return () => unsub();
  }, []);

  const activeTemplate = useMemo(() => {
    return (
      availableTemplates.find(t => t.id === selectedTemplateId) ||
      availableTemplates.find(t => t.isDefault) ||
      availableTemplates[0] ||
      getActiveTemplate()
    );
  }, [availableTemplates, selectedTemplateId]);

  // For Admin: list of selectable users
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(
    initialClaim?.userId || currentUser?.uid || ''
  );

  // Form State
  const [employeeName, setEmployeeName] = useState<string>('');
  const [employeeNumber, setEmployeeNumber] = useState<string>('');
  const [designation, setDesignation] = useState<string>('');
  const [branch, setBranch] = useState<string>('Head Office');
  const [department, setDepartment] = useState<string>('IT & Infrastructure Operations');
  const [claimType, setClaimType] = useState<ClaimType>('OT');
  const [maxOtLimitHours, setMaxOtLimitHours] = useState<number>(2.0);

  const currentDate = new Date();
  const [claimMonth, setClaimMonth] = useState<string>(
    initialClaim?.month || MONTH_NAMES[currentDate.getMonth()]
  );
  const [claimYear, setClaimYear] = useState<number>(
    initialClaim?.year || currentDate.getFullYear()
  );
  const [claimDate, setClaimDate] = useState<string>(
    initialClaim?.claimDate || new Date().toISOString().split('T')[0]
  );

  // Rows State
  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [otDisplayFormat, setOtDisplayFormat] = useState<'hhmm' | 'decimal'>('hhmm');

  // PDF Preview State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [claimSavedSuccess, setClaimSavedSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch users if admin
  useEffect(() => {
    if (isAdmin) {
      getDocs(collection(db, 'users'))
        .then(snap => {
          const list: any[] = [];
          snap.forEach(d => list.push(d.data()));
          setAllUsers(list);
        })
        .catch(err => {
          console.warn('Could not fetch all users', err);
        });
    }
  }, [isAdmin]);

  // Sync profile details into form
  useEffect(() => {
    if (initialClaim) {
      setSelectedUserId(initialClaim.userId);
      setEmployeeName(initialClaim.employeeName);
      setEmployeeNumber(initialClaim.employeeNumber);
      setDesignation(initialClaim.designation);
      setBranch(initialClaim.branch);
      setDepartment(initialClaim.department);
      setClaimType(initialClaim.claimType || 'OT');
      setClaimMonth(initialClaim.month);
      setClaimYear(initialClaim.year);
      setClaimDate(initialClaim.claimDate);
      setRows(initialClaim.rows || []);
      return;
    }

    // Default to current user profile or chosen user
    const targetProfile =
      allUsers.find(u => u.id === selectedUserId) || userProfile;

    if (targetProfile) {
      setEmployeeName(targetProfile.name || '');
      setEmployeeNumber(targetProfile.employeeNumber || '');
      setDesignation(targetProfile.designation || '');
      setBranch(targetProfile.branch || 'Head Office');
      setDepartment(targetProfile.department || 'IT & Infrastructure Operations');
      setClaimType(targetProfile.claimType || 'OT');
      setMaxOtLimitHours(
        targetProfile.maxOtHoursPerDay !== undefined ? targetProfile.maxOtHoursPerDay : 2.0
      );
    }

    // Initialize 3 default shift rows
    const monthIndex = MONTH_NAMES.indexOf(claimMonth);
    const mStr = String(monthIndex + 1).padStart(2, '0');
    setRows([
      createBlankRow(`${claimYear}-${mStr}-01`),
      createBlankRow(`${claimYear}-${mStr}-02`),
      createBlankRow(`${claimYear}-${mStr}-03`),
    ]);
  }, [initialClaim, userProfile, selectedUserId, allUsers]);

  // Create clean blank row with default General Shift 08:00
  function createBlankRow(defaultDate: string = ''): OvertimeRow {
    const isWk = isWeekendDay(defaultDate);
    return {
      id: 'row_' + Math.random().toString(36).substring(2, 9),
      date: defaultDate,
      dayOfWeek: getDayOfWeek(defaultDate),
      startTime: GENERAL_SHIFT_START, // 8:00 AM
      endTime: '',
      breakMinutes: 0,
      isOvernight: false,
      isWeekend: isWk,
      totalWorkMinutes: 0,
      rawOtMinutes: 0,
      totalMinutes: 0,
      totalFormatted: '00:00',
      reason: '',
    };
  }

  // Row update with General Shift and 15-minute generation
  const updateRowField = (index: number, field: keyof OvertimeRow, value: any) => {
    setRows(prevRows => {
      const updated = [...prevRows];
      const target = { ...updated[index], [field]: value };

      if (field === 'date') {
        target.dayOfWeek = getDayOfWeek(value);
        target.isWeekend = isWeekendDay(value);
      }

      // Calculate shift overtime according to company rules
      const calc = calculateShiftOvertime(
        target.startTime,
        target.endTime,
        Number(target.breakMinutes) || 0,
        maxOtLimitHours,
        target.isWeekend
      );

      target.totalWorkMinutes = calc.totalWorkMinutes;
      target.rawOtMinutes = calc.rawOtMinutes;
      target.totalMinutes = calc.totalMinutes;
      target.totalFormatted = formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
      target.isOvernight = calc.isOvernight;
      target.isCapped = calc.isCapped;
      target.uncappedMinutes = calc.uncappedMinutes;

      updated[index] = target;
      return updated;
    });
  };

  // Re-calculate all rows when user OT limit changes
  useEffect(() => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (!row.startTime || !row.endTime) return row;
        const calc = calculateShiftOvertime(
          row.startTime,
          row.endTime,
          Number(row.breakMinutes) || 0,
          maxOtLimitHours,
          row.isWeekend
        );
        return {
          ...row,
          totalWorkMinutes: calc.totalWorkMinutes,
          rawOtMinutes: calc.rawOtMinutes,
          totalMinutes: calc.totalMinutes,
          totalFormatted: formatMinutesToTime(calc.totalMinutes, otDisplayFormat),
          isOvernight: calc.isOvernight,
          isCapped: calc.isCapped,
          uncappedMinutes: calc.uncappedMinutes,
        };
      })
    );
  }, [maxOtLimitHours, otDisplayFormat]);

  // Auto-Fill Month
  const handleAutoFillMonth = () => {
    const monthIndex = MONTH_NAMES.indexOf(claimMonth);
    if (monthIndex < 0) return;

    const monthDates = generateMonthDates(claimYear, monthIndex);
    const existingDateMap = new Map(rows.map(r => [r.date, r]));

    const newRows: OvertimeRow[] = monthDates.map(({ date, day }) => {
      const existing = existingDateMap.get(date);
      if (existing) return existing;
      const isWk = day === 'Sat' || day === 'Sun';
      return {
        id: 'row_' + Math.random().toString(36).substring(2, 9),
        date,
        dayOfWeek: day,
        startTime: isWk ? '' : GENERAL_SHIFT_START,
        endTime: '',
        breakMinutes: 0,
        isOvernight: false,
        isWeekend: isWk,
        totalWorkMinutes: 0,
        rawOtMinutes: 0,
        totalMinutes: 0,
        totalFormatted: '00:00',
        reason: '',
      };
    });

    setRows(newRows);
  };

  const handleAddRow = () => {
    const lastRow = rows[rows.length - 1];
    let nextDate = '';
    if (lastRow && lastRow.date) {
      const [y, m, d] = lastRow.date.split('-').map(Number);
      const nextD = new Date(y, m - 1, d + 1);
      nextDate = nextD.toISOString().split('T')[0];
    }
    setRows([...rows, createBlankRow(nextDate)]);
  };

  const handleDuplicateRow = (index: number) => {
    const target = rows[index];
    const duplicated: OvertimeRow = {
      ...target,
      id: 'row_' + Math.random().toString(36).substring(2, 9),
    };
    const updated = [...rows];
    updated.splice(index + 1, 0, duplicated);
    setRows(updated);
  };

  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) {
      setRows([createBlankRow()]);
      return;
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  // Totals
  const summary = useMemo(() => {
    let totalMin = 0;
    let otDays = 0;
    let cappedCount = 0;

    for (const r of rows) {
      if (r.totalMinutes > 0) {
        totalMin += r.totalMinutes;
        otDays += 1;
      }
      if (r.isCapped) {
        cappedCount += 1;
      }
    }

    const totalHoursFormatted = formatMinutesToTime(totalMin, 'hhmm');
    const totalDecimalHours = parseFloat((totalMin / 60).toFixed(2));

    return {
      totalMinutes: totalMin,
      totalHoursFormatted,
      totalDecimalHours,
      otDaysCount: otDays,
      cappedCount,
    };
  }, [rows]);

  const validateForm = (): boolean => {
    setValidationError(null);

    if (!employeeName.trim()) {
      setValidationError('Please enter employee name.');
      return false;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.startTime && !r.endTime) {
        setValidationError(`Row ${i + 1}: Ending time cannot be empty when starting time is provided.`);
        return false;
      }
      if (!r.startTime && r.endTime) {
        setValidationError(`Row ${i + 1}: Starting time cannot be empty when ending time is provided.`);
        return false;
      }
    }

    if (summary.totalMinutes <= 0) {
      setValidationError('No overtime generated. Note: General shift ends at 4:45 PM. Overtime is only generated in 15-minute increments for time worked after 4:45 PM.');
      return false;
    }

    return true;
  };

  const buildClaimRecord = (): ClaimRecord => {
    const claimId = initialClaim?.id || 'clm_' + Date.now();
    return {
      id: claimId,
      userId: selectedUserId || currentUser?.uid || 'user_1',
      claimNumber:
        initialClaim?.claimNumber ||
        `CLM-${claimYear}-${String(MONTH_NAMES.indexOf(claimMonth) + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      employeeName,
      employeeNumber,
      designation,
      branch,
      department,
      claimType,
      month: claimMonth,
      year: claimYear,
      claimDate,
      rows: rows.filter(r => r.totalMinutes > 0 || r.startTime || r.endTime),
      totalMinutes: summary.totalMinutes,
      totalHoursFormatted: summary.totalHoursFormatted,
      totalDecimalHours: summary.totalDecimalHours,
      otDaysCount: summary.otDaysCount,
      status: 'submitted',
      templateId: activeTemplate.id,
      createdAt: initialClaim?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // Save to Firestore
  const handleSaveClaim = async () => {
    if (!validateForm()) return;
    const claim = buildClaimRecord();

    try {
      saveClaim(claim);
      await setDoc(doc(db, 'claims', claim.id), claim);
      setClaimSavedSuccess(true);
      if (onClaimSaved) onClaimSaved(claim);
      setTimeout(() => setClaimSavedSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `claims/${claim.id}`);
    }
  };

  // Preview PDF
  const handlePreviewPdf = async () => {
    if (!validateForm()) return;

    setIsGeneratingPdf(true);
    try {
      const claim = buildClaimRecord();
      const { url, filename } = await generateOvertimePdf(
        claim,
        activeTemplate,
        settings.globalPrinterOffsetX,
        settings.globalPrinterOffsetY
      );

      setPreviewPdfUrl(url);
      setPreviewFilename(filename);
      setIsPreviewOpen(true);
    } catch (err: any) {
      setValidationError('PDF generation error: ' + err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Direct Download PDF
  const handleDownloadPdf = async () => {
    if (!validateForm()) return;

    setIsGeneratingPdf(true);
    try {
      const claim = buildClaimRecord();
      const { url, filename } = await generateOvertimePdf(
        claim,
        activeTemplate,
        settings.globalPrinterOffsetX,
        settings.globalPrinterOffsetY
      );

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Also save to Firestore database
      await setDoc(doc(db, 'claims', claim.id), claim);
      setClaimSavedSuccess(true);
    } catch (err) {
      setValidationError('Failed to generate PDF download.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Card */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Timesheet &amp; Overtime Entry
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Shift: 8:00 AM – 4:45 PM
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                15-Min Increments
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Enter your daily starting and ending times. The system calculates total work duration and generates overtime strictly for hours after 4:45 PM, capped at your assigned limit ({maxOtLimitHours} hrs max).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePreviewPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 transition"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              <span>Preview PDF</span>
            </button>

            <button
              onClick={handleSaveClaim}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Save to Database</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? 'Generating...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        {/* Validation Error Alert */}
        {validationError && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{validationError}</span>
            </div>
            <button onClick={() => setValidationError(null)} className="font-bold text-rose-600">
              Dismiss
            </button>
          </div>
        )}

        {/* Success Alert */}
        {claimSavedSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Overtime claim saved to database successfully!</span>
          </div>
        )}

        {/* General Shift Policy Info Notice */}
        <div className="mt-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Shift Policy:</strong> General shift runs from <strong>08:00 AM to 04:45 PM</strong>. Overtime begins generating strictly after 04:45 PM in <strong>15-minute blocks</strong>.
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-blue-800">
            <span>Your Assigned Cap: {maxOtLimitHours} hrs/day</span>
          </div>
        </div>

        {/* Template Selector Banner */}
        <div className="mt-3 p-3 rounded-xl bg-slate-100/80 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Print Form Template</span>
              <span className="text-[11px] text-slate-500">Official company layout configured in Template Designer</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500"
            >
              {availableTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isDefault ? '★ (Default)' : ''}
                </option>
              ))}
            </select>

            {isAdmin && onNavigateToDesigner && (
              <button
                type="button"
                onClick={onNavigateToDesigner}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
              >
                Customize
              </button>
            )}
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Admin User Picker (Only visible to admins) */}
          {isAdmin && allUsers.length > 0 && (
            <div className="lg:col-span-2 bg-purple-50/60 p-2.5 rounded-xl border border-purple-200">
              <label className="block font-bold text-purple-900 mb-1">
                Admin: Select Employee Account
              </label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full rounded-lg border border-purple-300 bg-white py-1.5 px-2.5 text-xs text-slate-800 font-semibold"
              >
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) &bull; Cap: {u.maxOtHoursPerDay || 2.0}h &bull; Type: {u.claimType || 'OT'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-600 mb-1">Claimant Name *</label>
            <input
              type="text"
              value={employeeName}
              onChange={e => setEmployeeName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Employee Number</label>
            <input
              type="text"
              value={employeeNumber}
              onChange={e => setEmployeeNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Designation</label>
            <input
              type="text"
              value={designation}
              onChange={e => setDesignation(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Department</label>
            <input
              type="text"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800"
            />
          </div>

          {/* Claim Type (OT / OP) */}
          <div>
            <label className="block font-bold text-slate-600 mb-1">Claim Type</label>
            <select
              value={claimType}
              onChange={e => setClaimType(e.target.value as ClaimType)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-bold"
            >
              <option value="OT">OT (Overtime Claim)</option>
              <option value="OP">OP (Operational/Off-duty Pay)</option>
            </select>
          </div>

          {/* Month & Year */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block font-bold text-slate-600 mb-1">Month</label>
              <select
                value={claimMonth}
                onChange={e => setClaimMonth(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-slate-800"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="block font-bold text-slate-600 mb-1">Year</label>
              <input
                type="number"
                value={claimYear}
                onChange={e => setClaimYear(parseInt(e.target.value, 10) || 2026)}
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-slate-800 font-mono text-center"
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Overtime */}
        <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Overtime
            </span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {summary.totalHoursFormatted}
            </span>
            <span className="text-xs font-medium text-slate-500">
              ({summary.totalDecimalHours}h)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Calculated after 4:45 PM in 15m steps
          </p>
        </div>

        {/* Days Claimed */}
        <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Days Claimed
            </span>
            <Calendar className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {summary.otDaysCount}
            </span>
            <span className="text-xs font-medium text-slate-500">Days</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {summary.cappedCount > 0 ? `${summary.cappedCount} days capped by limit` : 'Within assigned limits'}
          </p>
        </div>

        {/* Assigned Cap */}
        <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Assigned Limit
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-700 tracking-tight">
              {maxOtLimitHours}h
            </span>
            <span className="text-xs font-medium text-slate-500">max/day</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Admin can adjust in User Management
          </p>
        </div>

        {/* Auto Fill Month Button */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 p-4 border border-indigo-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Auto-Fill Month</span>
            </div>
            <p className="text-[11px] text-indigo-700/80 mt-1">
              Generate dates for {claimMonth} {claimYear}.
            </p>
          </div>
          <button
            onClick={handleAutoFillMonth}
            className="mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          >
            Auto Fill Month
          </button>
        </div>
      </div>

      {/* Timesheet Daily Entries Table */}
      <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Daily Timesheet Entries
            </h2>
            <span className="text-xs text-slate-500">
              ({rows.length} rows)
            </span>
          </div>

          <button
            onClick={handleAddRow}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3 w-36">Date</th>
                <th className="py-2.5 px-3 w-20 text-center">Day</th>
                <th className="py-2.5 px-3 w-32">Starting Time</th>
                <th className="py-2.5 px-3 w-32">Ending Time</th>
                <th className="py-2.5 px-3 w-28 text-center">Work Duration</th>
                <th className="py-2.5 px-3 w-24 text-center">Break</th>
                <th className="py-2.5 px-3 w-32 text-center">Generated OT</th>
                <th className="py-2.5 px-3">Reason / Nature of Duties</th>
                <th className="py-2.5 px-3 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {rows.map((row, index) => {
                const hasOt = row.totalMinutes > 0;
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      hasOt ? 'bg-indigo-50/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* Date */}
                    <td className="py-2.5 px-3">
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => updateRowField(index, 'date', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                      />
                    </td>

                    {/* Day & Weekend Indicator */}
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          row.isWeekend
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {row.dayOfWeek || '-'}
                      </span>
                    </td>

                    {/* Starting Time */}
                    <td className="py-2.5 px-3">
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={e => updateRowField(index, 'startTime', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                      />
                    </td>

                    {/* Ending Time */}
                    <td className="py-2.5 px-3">
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={e => updateRowField(index, 'endTime', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                      />
                    </td>

                    {/* Working Time Difference (start to end) */}
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                      {row.totalWorkMinutes > 0 ? (
                        <span>{formatMinutesToTime(row.totalWorkMinutes, 'hhmm')}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* Break */}
                    <td className="py-2.5 px-3 text-center">
                      <select
                        value={row.breakMinutes || 0}
                        onChange={e => updateRowField(index, 'breakMinutes', parseInt(e.target.value, 10))}
                        className="w-16 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-center"
                      >
                        <option value="0">0m</option>
                        <option value="15">15m</option>
                        <option value="30">30m</option>
                        <option value="45">45m</option>
                        <option value="60">60m</option>
                      </select>
                    </td>

                    {/* Generated Overtime (15-min blocks + Capped indicator) */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <span
                          className={`font-mono text-xs font-bold ${
                            hasOt ? 'text-indigo-600' : 'text-slate-300'
                          }`}
                        >
                          {row.totalFormatted}
                        </span>
                        {row.isCapped && (
                          <span
                            className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 mt-0.5"
                            title={`Capped at ${maxOtLimitHours}h limit (uncapped was ${formatMinutesToTime(row.uncappedMinutes || 0, 'hhmm')})`}
                          >
                            Capped {maxOtLimitHours}h
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Reason */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={row.reason}
                        onChange={e => updateRowField(index, 'reason', e.target.value)}
                        placeholder="e.g. Scheduled server migration past 4:45 PM"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-300"
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleDuplicateRow(index)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                          title="Duplicate row"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(index)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <button
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>Add Row</span>
          </button>

          <div className="flex items-center gap-4 text-slate-700">
            <span>
              Total Overtime Days: <strong>{summary.otDaysCount}</strong>
            </span>
            <div className="h-4 w-px bg-slate-300" />
            <span>
              Total Overtime Hours:{' '}
              <strong className="text-indigo-600 text-sm font-black">
                {summary.totalHoursFormatted}
              </strong>{' '}
              ({summary.totalDecimalHours} hrs)
            </span>
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfUrl={previewPdfUrl}
        filename={previewFilename}
        onSaveClaim={handleSaveClaim}
        isSaved={claimSavedSuccess}
      />
    </div>
  );
};
