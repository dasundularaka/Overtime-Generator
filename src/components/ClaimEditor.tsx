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
  Lock,
  Banknote,
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
import { sanitizeFirestoreData } from '../utils/firestoreUtils';
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
import { ConfirmationModal } from './ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';
import { subscribeToHolidays } from '../services/holidayService';
import { TemplateConfig, Holiday } from '../types';

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

  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'table'>('cards');

  // Determine templates the user is allowed to use based on admin assignment
  const userAllowedTemplates = useMemo(() => {
    // If admin, all templates are accessible
    if (isAdmin) return availableTemplates;

    // If regular user has assigned templates configured by admin, strictly restrict to those
    if (userProfile?.assignedTemplateIds && userProfile.assignedTemplateIds.length > 0) {
      const allowed = availableTemplates.filter(t => userProfile.assignedTemplateIds!.includes(t.id));
      return allowed;
    }

    // Non-admin users must NEVER see unassigned templates: return empty if not assigned!
    return [];
  }, [availableTemplates, isAdmin, userProfile?.assignedTemplateIds]);

  // Ensure selected template is within permitted list
  useEffect(() => {
    if (userAllowedTemplates.length > 0) {
      if (!selectedTemplateId || !userAllowedTemplates.some(t => t.id === selectedTemplateId)) {
        setSelectedTemplateId(userAllowedTemplates[0].id);
      }
    }
  }, [userAllowedTemplates, selectedTemplateId]);

  const activeTemplate = useMemo(() => {
    return (
      userAllowedTemplates.find(t => t.id === selectedTemplateId) ||
      userAllowedTemplates.find(t => t.isDefault) ||
      userAllowedTemplates[0] ||
      getActiveTemplate()
    );
  }, [userAllowedTemplates, selectedTemplateId]);

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

  // Rates & Payment State
  const [totalRemuneration, setTotalRemuneration] = useState<number | ''>(
    initialClaim?.totalRemuneration !== undefined ? initialClaim.totalRemuneration : ''
  );
  const [hourlyRate, setHourlyRate] = useState<number | ''>(
    initialClaim?.hourlyRate !== undefined ? initialClaim.hourlyRate : ''
  );
  const [daysPay, setDaysPay] = useState<number | ''>(
    initialClaim?.daysPay !== undefined ? initialClaim.daysPay : ''
  );
  const [otPaymentDueB, setOtPaymentDueB] = useState<number | ''>(
    initialClaim?.otPaymentDueB !== undefined ? initialClaim.otPaymentDueB : ''
  );
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmSaveClaimOpen, setIsConfirmSaveClaimOpen] = useState(false);
  const [isSavingClaim, setIsSavingClaim] = useState(false);

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

  // Sunday / Holiday Review State
  const [isSundayReviewModalOpen, setIsSundayReviewModalOpen] = useState(false);
  const [sundayRowsToReview, setSundayRowsToReview] = useState<OvertimeRow[]>([]);
  const [hasReviewedSunday, setHasReviewedSunday] = useState(false);
  const [sundayReviewTrigger, setSundayReviewTrigger] = useState<'preview' | 'download' | 'save' | null>(null);

  // Download Confirmation & No-OT Days Removal State
  const [isConfirmDownloadOpen, setIsConfirmDownloadOpen] = useState(false);
  const [isNoOtModalOpen, setIsNoOtModalOpen] = useState(false);
  const [noOtRowsDetected, setNoOtRowsDetected] = useState<OvertimeRow[]>([]);

  // Holidays Calendar Sync State
  const [calendarHolidays, setCalendarHolidays] = useState<Holiday[]>([]);

  useEffect(() => {
    const unsub = subscribeToHolidays((list) => {
      setCalendarHolidays(list);
    });
    return () => unsub();
  }, []);

  const holidayMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of calendarHolidays) {
      map.set(h.date, h);
    }
    return map;
  }, [calendarHolidays]);

  // Helper: Detect other days (Saturdays, Sundays, and public/bank holidays)
  const isOtherDayRow = (r: OvertimeRow): boolean => {
    const dow = r.dayOfWeek || getDayOfWeek(r.date);
    return dow === 'Sat' || dow === 'Sun' || !!r.isHoliday || holidayMap.has(r.date);
  };

  // Helper: Detect regular weekday working days (Mon-Fri, non-holiday)
  const isWeekdayWorkingDay = (r: OvertimeRow): boolean => {
    const dow = r.dayOfWeek || getDayOfWeek(r.date);
    return dow !== 'Sat' && dow !== 'Sun' && !r.isHoliday && !holidayMap.has(r.date);
  };

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
      setTotalRemuneration(initialClaim.totalRemuneration !== undefined ? initialClaim.totalRemuneration : '');
      setHourlyRate(initialClaim.hourlyRate !== undefined ? initialClaim.hourlyRate : '');
      setDaysPay(initialClaim.daysPay !== undefined ? initialClaim.daysPay : '');
      setOtPaymentDueB(initialClaim.otPaymentDueB !== undefined ? initialClaim.otPaymentDueB : '');
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
      setHourlyRate(targetProfile.hourlyRate !== undefined ? targetProfile.hourlyRate : '');
      setDaysPay(targetProfile.daysPay !== undefined ? targetProfile.daysPay : '');
      setTotalRemuneration(targetProfile.totalRemuneration !== undefined ? targetProfile.totalRemuneration : '');
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
        if (holidayMap.has(value) || target.dayOfWeek === 'Sun') {
          target.isHoliday = true;
          target.holidayName = holidayMap.get(value)?.name || 'Sunday';
          target.startTime = '';
          target.endTime = '';
        }
      }

      if (field === 'isHoliday' && value) {
        target.startTime = '';
        target.endTime = '';
      }

      const isHoliday = !!target.isHoliday || holidayMap.has(target.date);
      const isOther = target.dayOfWeek === 'Sat' || target.dayOfWeek === 'Sun' || isHoliday;

      // Calculate shift overtime according to company rules
      // For other days (Saturdays, non-working days), isOtherDay is true:
      // No late conditions apply, no hourly overtime rate allocated, earns Day's Payment!
      const calc = calculateShiftOvertime(
        target.startTime,
        target.endTime,
        Number(target.breakMinutes) || 0,
        maxOtLimitHours,
        isOther
      );

      target.totalWorkMinutes = calc.totalWorkMinutes;
      target.rawOtMinutes = calc.rawOtMinutes;
      target.totalMinutes = calc.totalMinutes;
      target.totalFormatted = isOther ? '' : formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
      target.isOvernight = calc.isOvernight;
      target.isCapped = calc.isCapped;
      target.uncappedMinutes = calc.uncappedMinutes;
      target.lateDeductionMinutes = calc.lateDeductionMinutes;
      target.isLateDisqualified = calc.isLateDisqualified;
      target.lateNote = calc.lateNote;
      target.isDaysPayment = isOther && calc.totalWorkMinutes > 0;

      updated[index] = target;
      return updated;
    });
  };

  // Re-calculate all rows when user OT limit changes
  useEffect(() => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (!row.startTime || !row.endTime) return row;
        const isHoliday = !!row.isHoliday || holidayMap.has(row.date);
        const isOther = row.dayOfWeek === 'Sat' || row.dayOfWeek === 'Sun' || isHoliday;
        const calc = calculateShiftOvertime(
          row.startTime,
          row.endTime,
          Number(row.breakMinutes) || 0,
          maxOtLimitHours,
          isOther
        );
        return {
          ...row,
          totalWorkMinutes: calc.totalWorkMinutes,
          rawOtMinutes: calc.rawOtMinutes,
          totalMinutes: calc.totalMinutes,
          totalFormatted: isOther ? '' : formatMinutesToTime(calc.totalMinutes, otDisplayFormat),
          isOvernight: calc.isOvernight,
          isCapped: calc.isCapped,
          uncappedMinutes: calc.uncappedMinutes,
          lateDeductionMinutes: calc.lateDeductionMinutes,
          isLateDisqualified: calc.isLateDisqualified,
          lateNote: calc.lateNote,
          isDaysPayment: isOther && calc.totalWorkMinutes > 0,
        };
      })
    );
  }, [maxOtLimitHours, otDisplayFormat, holidayMap]);

  // Auto-Fill Month: Automatically removes holidays and Sundays
  const handleAutoFillMonth = () => {
    const monthIndex = MONTH_NAMES.indexOf(claimMonth);
    if (monthIndex < 0) return;

    const holidayDatesSet = new Set(calendarHolidays.map(h => h.date));
    const monthDates = generateMonthDates(claimYear, monthIndex, holidayDatesSet, true);
    const existingDateMap = new Map(rows.map(r => [r.date, r]));

    const newRows: OvertimeRow[] = monthDates.map(({ date, day }) => {
      const existing = existingDateMap.get(date);
      if (existing) return existing;
      const isSat = day === 'Sat';
      return {
        id: 'row_' + Math.random().toString(36).substring(2, 9),
        date,
        dayOfWeek: day,
        startTime: isSat ? '' : GENERAL_SHIFT_START,
        endTime: '',
        breakMinutes: 0,
        isOvernight: false,
        isWeekend: isSat,
        totalWorkMinutes: 0,
        rawOtMinutes: 0,
        totalMinutes: 0,
        totalFormatted: '00:00',
        reason: isSat ? "Saturday Duty (Day's Pay)" : '',
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

  // Totals & Calculations
  // Working days of weekdays (Mon-Fri, non-holiday) receive overtime hourly rate.
  // Other days (Saturdays, non-working days) receive Day's Payment rate.
  const weekdayWorkingRows = useMemo(() => {
    return rows.filter(r => isWeekdayWorkingDay(r) && r.totalMinutes > 0);
  }, [rows, holidayMap]);

  const weekdayOtMinutes = useMemo(() => {
    return weekdayWorkingRows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [weekdayWorkingRows]);

  const weekdayDecimalHours = useMemo(() => {
    return parseFloat((weekdayOtMinutes / 60).toFixed(2));
  }, [weekdayOtMinutes]);

  const otPaymentDueA = useMemo(() => {
    if (hourlyRate === '' || isNaN(Number(hourlyRate))) return 0;
    return Math.round(weekdayDecimalHours * Number(hourlyRate) * 100) / 100;
  }, [weekdayDecimalHours, hourlyRate]);

  // Other days (Saturdays, Sundays, non-working days, holidays)
  // Condition: Saturday requires minimum 6 hours (360 mins) to earn a Day's Payment; Sundays and holidays earn Day's payment if worked.
  const otherDaysWorkedRows = useMemo(() => {
    return rows.filter(r => {
      if (!isOtherDayRow(r)) return false;
      const isSat = r.dayOfWeek === 'Sat' || getDayOfWeek(r.date) === 'Sat';
      if (isSat) {
        return (r.totalWorkMinutes || 0) >= 360;
      }
      return (r.totalWorkMinutes || 0) > 0;
    });
  }, [rows, holidayMap]);

  const daysPayCount = otherDaysWorkedRows.length;

  const daysPayTotal = useMemo(() => {
    if (daysPay === '' || isNaN(Number(daysPay))) return 0;
    return Math.round(daysPayCount * Number(daysPay) * 100) / 100;
  }, [daysPayCount, daysPay]);

  const totalOtPayment = useMemo(() => {
    const b = otPaymentDueB !== '' ? Number(otPaymentDueB) : 0;
    return Math.round((otPaymentDueA + daysPayTotal + (isNaN(b) ? 0 : b)) * 100) / 100;
  }, [otPaymentDueA, daysPayTotal, otPaymentDueB]);

  const summary = useMemo(() => {
    const totalMin = weekdayOtMinutes;
    const otDays = weekdayWorkingRows.length;
    const cappedCount = weekdayWorkingRows.filter(r => r.isCapped).length;
    const totalHoursFormatted = formatMinutesToTime(totalMin, 'hhmm');
    const totalDecimalHours = weekdayDecimalHours;

    return {
      totalMinutes: totalMin,
      totalHoursFormatted,
      totalDecimalHours,
      otDaysCount: otDays,
      cappedCount,
      daysPayCount,
      daysPayTotal,
    };
  }, [weekdayOtMinutes, weekdayWorkingRows, weekdayDecimalHours, daysPayCount, daysPayTotal]);

  const handleRemunerationChange = (val: string) => {
    if (val === '') {
      setTotalRemuneration('');
      return;
    }
    const num = parseFloat(val);
    setTotalRemuneration(isNaN(num) ? '' : num);
    if (!isNaN(num) && num > 0) {
      // Standard Banking / Commercial Form 10756 Overtime Formula:
      // Day's Pay = Remuneration / 22 working days
      // Hourly OT Rate = Day's Pay / 8 hours
      const calculatedDayPay = Math.round((num / 22) * 100) / 100;
      const calculatedHourlyRate = Math.round((calculatedDayPay / 8) * 100) / 100;
      if (daysPay === '') setDaysPay(calculatedDayPay);
      if (hourlyRate === '') setHourlyRate(calculatedHourlyRate);
    }
  };

  const validateForm = (): boolean => {
    setValidationError(null);

    if (!employeeName.trim()) {
      setValidationError('Please enter employee name.');
      return false;
    }

    // Check pair completeness
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.startTime && !r.endTime) {
        setValidationError(`Row ${i + 1} (${r.date || 'entry'}): Ending time cannot be empty when starting time is provided.`);
        return false;
      }
      if (!r.startTime && r.endTime) {
        setValidationError(`Row ${i + 1} (${r.date || 'entry'}): Starting time cannot be empty when ending time is provided.`);
        return false;
      }
    }

    // Check Saturday condition: Saturday duty requires minimum 6.00 hrs (360 mins) of working time
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const isSat = r.dayOfWeek === 'Sat' || getDayOfWeek(r.date) === 'Sat';
      if (isSat && (r.startTime || r.endTime || r.totalWorkMinutes > 0)) {
        if (r.totalWorkMinutes < 360) {
          setValidationError(
            `Saturday requirement: Row ${i + 1} (${r.date || 'Saturday'}) has only ${formatMinutesToTime(r.totalWorkMinutes, 'hhmm')} working time. Saturday duty requires a minimum of 6.00 hours (360 mins) of working time to generate an overtime claim sheet.`
          );
          return false;
        }
      }
    }

    if (summary.totalMinutes <= 0 && daysPayCount <= 0) {
      setValidationError(
        'No claimable overtime or days payment recorded. Please enter valid working hours for weekdays or non-working days.'
      );
      return false;
    }

    return true;
  };

  const checkSundayOrHolidayReview = (trigger: 'preview' | 'download' | 'save'): boolean => {
    if (hasReviewedSunday) return true;
    const sundayOrHolidayRows = rows.filter(r => {
      const isSun = r.dayOfWeek === 'Sun' || getDayOfWeek(r.date) === 'Sun';
      const isHol = !!r.isHoliday || holidayMap.has(r.date) || /holiday|poya|mercantile|off\s*day|leave/i.test(r.reason || '');
      return (isSun || isHol) && (r.startTime || r.endTime || r.totalWorkMinutes > 0);
    });
    if (sundayOrHolidayRows.length > 0) {
      setSundayRowsToReview(sundayOrHolidayRows);
      setSundayReviewTrigger(trigger);
      setIsSundayReviewModalOpen(true);
      return false;
    }
    return true;
  };

  const handleConfirmSundayReview = () => {
    setHasReviewedSunday(true);
    setIsSundayReviewModalOpen(false);
    if (sundayReviewTrigger === 'preview') {
      executePreviewPdf();
    } else if (sundayReviewTrigger === 'download') {
      setIsConfirmDownloadOpen(true);
    } else if (sundayReviewTrigger === 'save') {
      setIsConfirmSaveClaimOpen(true);
    }
  };

  const buildClaimRecord = (customRows?: OvertimeRow[]): ClaimRecord => {
    const claimId = initialClaim?.id || 'clm_' + Date.now();
    const activeRows = (customRows || rows).filter(r => r.totalMinutes > 0 || r.totalWorkMinutes > 0 || r.startTime || r.endTime);
    const totalMinutes = activeRows.filter(r => isWeekdayWorkingDay(r)).reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
    const otDaysCount = activeRows.filter(r => isWeekdayWorkingDay(r) && r.totalMinutes > 0).length;
    const totalDecimalHours = parseFloat((totalMinutes / 60).toFixed(2));
    const totalHoursFormatted = formatMinutesToTime(totalMinutes, otDisplayFormat);

    const calculatedPaymentA =
      hourlyRate !== '' && !isNaN(Number(hourlyRate))
        ? Math.round(totalDecimalHours * Number(hourlyRate) * 100) / 100
        : 0;

    const currentDaysPayCount = activeRows.filter(r => isOtherDayRow(r) && r.totalWorkMinutes > 0).length;
    const currentDaysPayTotal =
      daysPay !== '' && !isNaN(Number(daysPay))
        ? Math.round(currentDaysPayCount * Number(daysPay) * 100) / 100
        : 0;

    const b = otPaymentDueB !== '' ? Number(otPaymentDueB) : 0;
    const calculatedTotalPayment = Math.round((calculatedPaymentA + currentDaysPayTotal + (isNaN(b) ? 0 : b)) * 100) / 100;

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
      rows: activeRows,
      totalMinutes,
      totalHoursFormatted,
      totalDecimalHours,
      otDaysCount,
      totalRemuneration: totalRemuneration !== '' ? Number(totalRemuneration) : undefined,
      hourlyRate: hourlyRate !== '' ? Number(hourlyRate) : undefined,
      daysPay: daysPay !== '' ? Number(daysPay) : undefined,
      daysPayCount: currentDaysPayCount,
      daysPayTotal: currentDaysPayTotal,
      otPaymentDueA: calculatedPaymentA,
      otPaymentDueB: otPaymentDueB !== '' ? Number(otPaymentDueB) : 0,
      totalOtPayment: calculatedTotalPayment,
      status: 'submitted',
      templateId: activeTemplate.id,
      createdAt: initialClaim?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // Trigger confirmation dialog for Save / Submit Claim
  const handleSaveClaim = () => {
    if (!validateForm()) return;
    if (!checkSundayOrHolidayReview('save')) return;
    setIsConfirmSaveClaimOpen(true);
  };

  // Commit Save Claim to Firestore after user confirmation
  const confirmCommitSaveClaim = async () => {
    setIsSavingClaim(true);
    const claim = buildClaimRecord();

    try {
      saveClaim(claim);
      await setDoc(doc(db, 'claims', claim.id), sanitizeFirestoreData(claim));
      setClaimSavedSuccess(true);
      setIsConfirmSaveClaimOpen(false);
      if (onClaimSaved) onClaimSaved(claim);
      setTimeout(() => setClaimSavedSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `claims/${claim.id}`);
      setIsConfirmSaveClaimOpen(false);
    } finally {
      setIsSavingClaim(false);
    }
  };

  // Executes PDF generation and opens preview
  const executePreviewPdf = async () => {
    setIsGeneratingPdf(true);
    setValidationError(null);
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

  // Preview PDF handler
  const handlePreviewPdf = async () => {
    if (!validateForm()) return;
    if (!checkSundayOrHolidayReview('preview')) return;
    executePreviewPdf();
  };

  // Triggered by "Download PDF" button to start confirmation sequence
  const handleInitiateDownload = () => {
    if (!validateForm()) return;
    if (!checkSundayOrHolidayReview('download')) return;
    setIsConfirmDownloadOpen(true);
  };

  // Step 1: User confirmed download intent; check for No-OT days (< 15 min OT)
  // ONLY for valid working days (weekdays, non-holiday), NOT Saturdays or other holidays!
  const handleConfirmDownloadStep1 = () => {
    setIsConfirmDownloadOpen(false);

    // Check for valid weekday working days with entered hours that yielded no claimable OT (< 15 mins)
    const noOtDays = rows.filter(r => {
      const isWeekday = isWeekdayWorkingDay(r);
      return isWeekday && (r.startTime || r.endTime || r.totalWorkMinutes > 0) && r.totalMinutes < 15;
    });

    if (noOtDays.length > 0) {
      setNoOtRowsDetected(noOtDays);
      setIsNoOtModalOpen(true);
      return;
    }

    // No zero-OT days, proceed directly
    executeGenerateAndDownload(rows);
  };

  // Step 2: User confirmed removing No-OT days
  const handleConfirmRemoveNoOtAndDownload = () => {
    setIsNoOtModalOpen(false);
    // Remove only the No-OT valid weekday working days; retain other days (Saturdays, holidays with Day's Pay) and valid OT rows
    const validRows = rows.filter(r => {
      const isWeekday = isWeekdayWorkingDay(r);
      const isNoOtWeekday = isWeekday && (r.startTime || r.endTime || r.totalWorkMinutes > 0) && r.totalMinutes < 15;
      return !isNoOtWeekday;
    });
    const finalRows = validRows.length > 0 ? validRows : [createBlankRow()];
    setRows(finalRows);
    executeGenerateAndDownload(finalRows);
  };

  // Generates PDF and downloads file
  const executeGenerateAndDownload = async (claimRows: OvertimeRow[]) => {
    setIsGeneratingPdf(true);
    try {
      const claim = buildClaimRecord(claimRows);
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
      await setDoc(doc(db, 'claims', claim.id), sanitizeFirestoreData(claim));
      setClaimSavedSuccess(true);
      if (onClaimSaved) onClaimSaved(claim);
      setTimeout(() => setClaimSavedSuccess(false), 3000);
    } catch (err: any) {
      setValidationError('Failed to generate PDF download: ' + err.message);
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
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Enter your daily starting and ending times to calculate overtime claims and generate print-ready sheets.
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
              onClick={handleInitiateDownload}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-60"
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

        {/* Template Selector (Clean inline control, never displayed like a banner) */}
        {!isAdmin && userAllowedTemplates.length === 0 ? (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold">No Template Assigned:</span> Your administrator has not assigned an overtime claim template to your profile yet. Please contact your system administrator to assign an official template before submitting claims.
            </div>
          </div>
        ) : (
          <div className="mt-3 p-2.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span className="font-semibold text-slate-700">Official Form Layout:</span>
              {!isAdmin ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-medium border border-slate-200">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>{activeTemplate?.name || 'Assigned Template'}</span>
                </span>
              ) : (
                <select
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                >
                  {userAllowedTemplates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isDefault ? '★ (Default)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {isAdmin && onNavigateToDesigner && (
              <button
                type="button"
                onClick={onNavigateToDesigner}
                className="self-end sm:self-auto px-2.5 py-1 rounded-lg text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
              >
                Customize in Designer
              </button>
            )}
          </div>
        )}

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

          {/* Department Custom Text */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-slate-700">Department</label>
              <span className="text-[10px] text-indigo-600 font-semibold">Custom Text</span>
            </div>
            <input
              type="text"
              list="claim-department-suggestions"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="e.g. IT Operations & Infrastructure"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
            <datalist id="claim-department-suggestions">
              <option value="IT Operations & Infrastructure" />
              <option value="Corporate Banking Division" />
              <option value="Credit & Risk Management" />
              <option value="Treasury & Foreign Exchange" />
              <option value="Retail Banking & Branches" />
              <option value="Finance & Accounts" />
              <option value="Human Resources Division" />
            </datalist>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {['IT Operations', 'Corporate Banking', 'Treasury', 'Finance'].map(dep => (
                <button
                  key={dep}
                  type="button"
                  onClick={() => setDepartment(dep)}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-medium transition"
                  title={`Set Department to "${dep}"`}
                >
                  +{dep}
                </button>
              ))}
            </div>
          </div>

          {/* Branch Custom Text */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-slate-700">Branch</label>
              <span className="text-[10px] text-indigo-600 font-semibold">Custom Text</span>
            </div>
            <input
              type="text"
              list="claim-branch-suggestions"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="e.g. BOC Colombo Main Branch"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
            <datalist id="claim-branch-suggestions">
              <option value="BOC Colombo Main Branch" />
              <option value="Corporate Branch" />
              <option value="Head Office - Colombo" />
              <option value="Kandy Super Grade Branch" />
              <option value="Galle Fort Branch" />
              <option value="Kurunegala City Branch" />
              <option value="Jaffna Main Branch" />
            </datalist>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {['Colombo Main', 'Head Office', 'Corporate', 'Kandy'].map(br => (
                <button
                  key={br}
                  type="button"
                  onClick={() => setBranch(br)}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-medium transition"
                  title={`Set Branch to "${br}"`}
                >
                  +{br}
                </button>
              ))}
            </div>
          </div>

          {/* Claim Type (OT = Overtime, OP = Out of Pocket) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Claim Type <span className="font-semibold text-[10px] text-indigo-600">(OT = Overtime, OP = Out of Pocket)</span>
            </label>
            <select
              value={claimType}
              onChange={e => setClaimType(e.target.value as ClaimType)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-bold shadow-2xs focus:ring-2 focus:ring-indigo-500"
            >
              <option value="OT">OT — Overtime Claim</option>
              <option value="OP">OP — Out of Pocket Expense</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              {claimType === 'OT'
                ? 'OT (Overtime): Computes time after 4:45 PM in 15-min intervals'
                : 'OP (Out of Pocket): Company reimbursable expenditure'}
            </p>
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

      {/* Hourly OT Rate & Days Payment of OT Section (Official Form 10756 Remuneration & Pay) */}
      <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Hourly OT Rate &amp; Days Payment of OT
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                  Form 10756 Remuneration
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Calculates and prints onto the bottom summary box: Hourly Rate, Day&apos;s Pay, and Overtime Payments Due &apos;A&apos; and &apos;B&apos;.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Overtime Payment Due:
            </span>
            <span className="text-base font-black font-mono text-indigo-700">
              Rs. {totalOtPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5 text-xs">
          {/* Total Remuneration */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Total Remuneration (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              value={totalRemuneration}
              onChange={e => handleRemunerationChange(e.target.value)}
              placeholder="e.g. 85000.00"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Salary Book
            </span>
          </div>

          {/* Hourly OT Rate (Weekday working days) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-slate-700">Hourly OT Rate (Rs.)</label>
              <span className="text-[10px] text-indigo-600 font-semibold">Weekday OT</span>
            </div>
            <input
              type="number"
              step="0.01"
              value={hourlyRate}
              onChange={e => setHourlyRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="e.g. 482.95"
              className="w-full rounded-xl border border-indigo-300 bg-indigo-50/20 px-3 py-2 text-slate-900 font-mono font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Applied to weekday working hours
            </span>
          </div>

          {/* Overtime Payment Due 'A' */}
          <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              Weekday OT Due &apos;A&apos;
            </span>
            <div className="text-base font-extrabold font-mono text-emerald-800 mt-1">
              Rs. {otPaymentDueA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-emerald-700/80 mt-0.5 block">
              {weekdayDecimalHours}h weekday OT @ {hourlyRate !== '' ? Number(hourlyRate).toFixed(2) : '0.00'}/h
            </span>
          </div>

          {/* Days Payment Rate */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-slate-700">Days Payment Rate (Rs.)</label>
              <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1 rounded">Day&apos;s Pay</span>
            </div>
            <input
              type="number"
              step="0.01"
              value={daysPay}
              onChange={e => setDaysPay(e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="e.g. 3863.64"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Rate for Saturdays &amp; other days
            </span>
          </div>

          {/* Days Payment Total */}
          <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200">
            <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
              Other Days Payment
            </span>
            <div className="text-base font-extrabold font-mono text-amber-900 mt-1">
              Rs. {daysPayTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-amber-800/80 mt-0.5 block">
              {daysPayCount} day(s) worked @ {daysPay !== '' ? Number(daysPay).toFixed(2) : '0.00'}/day
            </span>
          </div>

          {/* Special Assignment Payment 'B' */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Special Assignment &apos;B&apos; (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              value={otPaymentDueB}
              onChange={e => setOtPaymentDueB(e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Payment Due &apos;B&apos; Rs.
            </span>
          </div>
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

          <div className="flex items-center gap-2">
            {/* View Mode Toggle (Mobile) */}
            <div className="flex md:hidden items-center rounded-xl bg-slate-200/80 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMobileViewMode('cards')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  mobileViewMode === 'cards' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setMobileViewMode('table')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  mobileViewMode === 'table' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Table
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsConfirmResetOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition cursor-pointer"
              title="Clear all rows and reset timesheet"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Entries</span>
            </button>

            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>
          </div>
        </div>

        {/* Mobile Cards List View (Active on phones) */}
        {mobileViewMode === 'cards' && (
          <div className="block md:hidden divide-y divide-slate-100">
            {rows.map((row, index) => {
              const hasOt = row.totalMinutes > 0;
              const isSat = row.dayOfWeek === 'Sat' || getDayOfWeek(row.date) === 'Sat';
              const isSun = row.dayOfWeek === 'Sun' || getDayOfWeek(row.date) === 'Sun';
              const isHol = !!row.isHoliday || holidayMap.has(row.date) || isSun || /holiday|poya|mercantile|off\s*day|leave/i.test(row.reason || '');
              const isOther = isSat || isSun || isHol;

              return (
                <div key={row.id} className="p-3.5 space-y-2.5 bg-white">
                  {/* Card Header: #, Date, Day, Holiday button, Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">#{index + 1}</span>
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => updateRowField(index, 'date', e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 font-medium"
                      />
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          row.isHoliday || isHol
                            ? 'bg-rose-100 text-rose-800'
                            : isSun
                            ? 'bg-purple-100 text-purple-800'
                            : isSat
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {row.isHoliday ? 'Holiday' : row.dayOfWeek || '-'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isSun && (
                        <button
                          type="button"
                          onClick={() => updateRowField(index, 'isHoliday', !row.isHoliday)}
                          className={`text-[10px] px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                            row.isHoliday
                              ? 'bg-rose-200 text-rose-900 border border-rose-300'
                              : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                          }`}
                        >
                          {row.isHoliday ? 'Holiday ✓' : '+ Hol'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Duties / Reason input */}
                  <div>
                    <input
                      type="text"
                      value={row.reason}
                      onChange={e => updateRowField(index, 'reason', e.target.value)}
                      placeholder={isOther ? (isHol ? "Holiday / Off Day" : "Weekend Duty...") : "Duties performed..."}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-300"
                    />
                  </div>

                  {/* Time Inputs: Start, End, Break */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Start</label>
                      <input
                        type="time"
                        disabled={isHol}
                        value={isHol ? '' : row.startTime}
                        onChange={e => updateRowField(index, 'startTime', e.target.value)}
                        className={`w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs ${
                          isHol ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-800'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">End</label>
                      <input
                        type="time"
                        disabled={isHol}
                        value={isHol ? '' : row.endTime}
                        onChange={e => updateRowField(index, 'endTime', e.target.value)}
                        className={`w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs ${
                          isHol ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-800'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Break</label>
                      <select
                        disabled={isHol}
                        value={row.breakMinutes || 0}
                        onChange={e => updateRowField(index, 'breakMinutes', parseInt(e.target.value, 10))}
                        className={`w-full rounded-lg border border-slate-200 px-1 py-1.5 text-xs text-center ${
                          isHol ? 'bg-slate-100 text-slate-400' : 'bg-white'
                        }`}
                      >
                        <option value="0">0m</option>
                        <option value="15">15m</option>
                        <option value="30">30m</option>
                        <option value="45">45m</option>
                        <option value="60">60m</option>
                      </select>
                    </div>
                  </div>

                  {/* Outcome summary bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Result:</span>
                      {isOther ? (
                        row.totalWorkMinutes > 0 ? (
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isSat && row.totalWorkMinutes < 360
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            Day's Pay {isSat && row.totalWorkMinutes < 360 ? '(Sat < 6h)' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`font-mono text-xs font-bold ${hasOt ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {row.totalFormatted} OT
                          </span>
                          {row.isLateDisqualified && (
                            <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 rounded border border-rose-200">
                              Late 0 OT
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={row.approvedBy || ''}
                        onChange={e => updateRowField(index, 'approvedBy', e.target.value)}
                        placeholder="Mgr Initials"
                        className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-center w-24 placeholder:text-slate-300 font-medium"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Desktop Table View */}
        <div className={`overflow-x-auto ${mobileViewMode === 'cards' ? 'hidden md:block' : 'block'}`}>
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-2 w-10 text-center">#</th>
                <th className="py-2.5 px-2 w-32">Date</th>
                <th className="py-2.5 px-2 w-16 text-center">Day</th>
                <th className="py-2.5 px-2 min-w-[180px]">Reason / Duties</th>
                <th className="py-2.5 px-2 w-28 text-center">Approved by Mgr</th>
                <th className="py-2.5 px-2 w-24 text-center">Time Started</th>
                <th className="py-2.5 px-2 w-24 text-center">Time Left</th>
                <th className="py-2.5 px-2 w-20 text-center">Break</th>
                <th className="py-2.5 px-2 w-24 text-center">Total Worked</th>
                <th className="py-2.5 px-2 w-28 text-center">Overtime (A)</th>
                <th className="py-2.5 px-2 w-28 text-center">Special Assgn (B)</th>
                <th className="py-2.5 px-2 w-16 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {rows.map((row, index) => {
                const hasOt = row.totalMinutes > 0;
                const isSat = row.dayOfWeek === 'Sat' || getDayOfWeek(row.date) === 'Sat';
                const isSun = row.dayOfWeek === 'Sun' || getDayOfWeek(row.date) === 'Sun';
                const isHol = !!row.isHoliday || holidayMap.has(row.date) || isSun || /holiday|poya|mercantile|off\s*day|leave/i.test(row.reason || '');
                const isOther = isSat || isSun || isHol;

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      hasOt ? 'bg-indigo-50/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* 1. Date */}
                    <td className="py-2.5 px-2">
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => updateRowField(index, 'date', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                      />
                    </td>

                    {/* 2. Day & Holiday Indicator */}
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            row.isHoliday || isHol
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : isSun
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : isSat
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.isHoliday ? 'Holiday' : row.dayOfWeek || '-'}
                        </span>
                        {!isSun && (
                          <button
                            type="button"
                            onClick={() => updateRowField(index, 'isHoliday', !row.isHoliday)}
                            className={`text-[9px] px-1 py-0.2 rounded font-bold cursor-pointer transition ${
                              row.isHoliday
                                ? 'bg-rose-200 text-rose-900 border border-rose-300'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                            title="Toggle Holiday / Off-Day status for this date"
                          >
                            {row.isHoliday ? 'Holiday ✓' : '+ Holiday'}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 3. Reason / Nature of Duties (Position 3 as in Overtime Sheet) */}
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={row.reason}
                        onChange={e => updateRowField(index, 'reason', e.target.value)}
                        placeholder={isOther ? (isHol ? "Holiday / Off Day" : "Weekend Duty...") : "Duties performed..."}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-300"
                      />
                    </td>

                    {/* 4. Approved by Manager (Position 4 as in Overtime Sheet) */}
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={row.approvedBy || ''}
                        onChange={e => updateRowField(index, 'approvedBy', e.target.value)}
                        placeholder="Mgr Initials"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-center text-slate-800 placeholder:text-slate-300 font-medium"
                      />
                    </td>

                    {/* 5. Starting Time (Disabled on Holidays) */}
                    <td className="py-2.5 px-2">
                      <input
                        type="time"
                        disabled={isHol}
                        value={isHol ? '' : row.startTime}
                        onChange={e => updateRowField(index, 'startTime', e.target.value)}
                        title={isHol ? "Holidays / Sundays cannot have in/out times" : "Starting Time"}
                        placeholder={isHol ? "Holiday" : ""}
                        className={`w-full rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs ${
                          isHol
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-white text-slate-800'
                        }`}
                      />
                    </td>

                    {/* 6. Ending Time (Left) (Disabled on Holidays) */}
                    <td className="py-2.5 px-2">
                      <input
                        type="time"
                        disabled={isHol}
                        value={isHol ? '' : row.endTime}
                        onChange={e => updateRowField(index, 'endTime', e.target.value)}
                        title={isHol ? "Holidays / Sundays cannot have in/out times" : "Ending Time"}
                        placeholder={isHol ? "Holiday" : ""}
                        className={`w-full rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs ${
                          isHol
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-white text-slate-800'
                        }`}
                      />
                    </td>

                    {/* 7. Break */}
                    <td className="py-2.5 px-2 text-center">
                      <select
                        disabled={isHol}
                        value={row.breakMinutes || 0}
                        onChange={e => updateRowField(index, 'breakMinutes', parseInt(e.target.value, 10))}
                        className={`w-full rounded-lg border border-slate-200 px-1 py-1 text-xs text-center ${
                          isHol ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'
                        }`}
                      >
                        <option value="0">0m</option>
                        <option value="15">15m</option>
                        <option value="30">30m</option>
                        <option value="45">45m</option>
                        <option value="60">60m</option>
                      </select>
                    </td>

                    {/* 8. Total Working Time (Do NOT show shift / working hours on other days; show Day's Pay badge if worked) */}
                    <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                      {isOther ? (
                        row.totalWorkMinutes > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap">
                              Day's Pay
                            </span>
                            {isSat && row.totalWorkMinutes < 360 && (
                              <span
                                className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200 mt-0.5 whitespace-nowrap"
                                title="Saturday requires minimum 6.00 hrs (360 mins) of working time"
                              >
                                Min 6h req!
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )
                      ) : row.totalWorkMinutes > 0 ? (
                        <span>{formatMinutesToTime(row.totalWorkMinutes, 'hhmm')}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* 9. Generated Overtime (A) (Do NOT show OT hours on other days) */}
                    <td className="py-2.5 px-2 text-center">
                      {isOther ? (
                        <span className="text-slate-300">-</span>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span
                            className={`font-mono text-xs font-bold ${
                              hasOt ? 'text-indigo-600' : 'text-slate-300'
                            }`}
                          >
                            {row.totalFormatted}
                          </span>
                          {row.isLateDisqualified && (
                            <span
                              className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200 mt-0.5 whitespace-nowrap"
                              title={row.lateNote || 'Late arrival after 08:30: No overtime allocated'}
                            >
                              Late &gt; 08:30 (0 OT)
                            </span>
                          )}
                          {!row.isLateDisqualified && row.lateDeductionMinutes !== undefined && row.lateDeductionMinutes > 0 && (
                            <span
                              className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 mt-0.5 whitespace-nowrap"
                              title={row.lateNote || `Late arrival: -${row.lateDeductionMinutes}m deducted from OT`}
                            >
                              Late -{row.lateDeductionMinutes}m OT
                            </span>
                          )}
                          {row.isCapped && (
                            <span
                              className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded border border-indigo-200 mt-0.5 whitespace-nowrap"
                              title={`Capped at ${maxOtLimitHours}h limit (uncapped was ${formatMinutesToTime(row.uncappedMinutes || 0, 'hhmm')})`}
                            >
                              Capped {maxOtLimitHours}h
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 10. Special Assignment Hours (B) */}
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={row.specialAssignmentHours || ''}
                        onChange={e => updateRowField(index, 'specialAssignmentHours', e.target.value)}
                        placeholder="e.g. 01:30"
                        className="w-full rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-xs font-mono text-center text-slate-800 placeholder:text-slate-300"
                      />
                    </td>

                    {/* 11. Actions */}
                    <td className="py-2.5 px-2 text-center">
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

      {/* Reset Confirmation Modal */}
      <ConfirmationModal
        isOpen={isConfirmResetOpen}
        title="Reset Timesheet Entries?"
        message="This will clear all daily overtime entries on this timesheet and start fresh with blank rows. Any unsaved hours will be discarded."
        confirmText="Yes, Reset"
        cancelText="Keep My Entries"
        variant="warning"
        onConfirm={() => {
          setRows([createBlankRow()]);
          setIsConfirmResetOpen(false);
        }}
        onClose={() => setIsConfirmResetOpen(false)}
      />

      {/* Save / Submit Claim Confirmation Modal */}
      <ConfirmationModal
        isOpen={isConfirmSaveClaimOpen}
        onClose={() => setIsConfirmSaveClaimOpen(false)}
        onConfirm={confirmCommitSaveClaim}
        title={initialClaim ? 'Update Overtime Claim' : 'Submit Overtime Claim'}
        message={
          initialClaim
            ? `Are you sure you want to save updates to claim #${initialClaim.claimNumber}?`
            : `Are you sure you want to finalize and save this overtime claim for ${claimMonth} ${claimYear}?`
        }
        confirmText={initialClaim ? 'Save Changes' : 'Submit Claim'}
        cancelText="Review Timesheet"
        variant="info"
        isLoading={isSavingClaim}
        details={[
          { label: 'Claimant Name', value: employeeName },
          { label: 'Claim Period', value: `${claimMonth} ${claimYear}` },
          { label: 'Total OT Hours', value: `${summary.totalHoursFormatted} (${summary.totalDecimalHours}h)` },
          { label: 'Claim Days', value: `${summary.otDaysCount} Days` },
          {
            label: 'Total Payment Due',
            value: `Rs. ${totalOtPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
        ]}
      />

      {/* Confirmation Modal: Step 1 Download Intent */}
      <ConfirmationModal
        isOpen={isConfirmDownloadOpen}
        onClose={() => setIsConfirmDownloadOpen(false)}
        onConfirm={handleConfirmDownloadStep1}
        title="Generate and Download Overtime Sheet"
        message={`Are you sure you want to generate and download the official A4 Overtime Sheet for "${employeeName}" for ${claimMonth} ${claimYear}?`}
        confirmText="Confirm & Download"
        cancelText="Review Timesheet"
        variant="info"
        details={[
          { label: 'Claimant', value: employeeName },
          { label: 'Claim Period', value: `${claimMonth} ${claimYear}` },
          { label: 'Total Claimable OT', value: `${summary.totalHoursFormatted} (${summary.totalDecimalHours} hrs)` },
          { label: 'Days with Overtime', value: `${summary.otDaysCount} Days` },
        ]}
      />

      {/* Confirmation Modal: Step 2 No-OT Days Detected */}
      <ConfirmationModal
        isOpen={isNoOtModalOpen}
        onClose={() => setIsNoOtModalOpen(false)}
        onConfirm={handleConfirmRemoveNoOtAndDownload}
        title="No-OT Days Detected (< 15 Minutes)"
        message={`The system detected ${noOtRowsDetected.length} day(s) with entered working hours but NO claimable overtime (less than 15 minutes of overtime generated after 4:45 PM or disqualified due to late arrival). The system will remove these No-OT days from the claim sheet and continue. Do you want to proceed?`}
        confirmText="Remove No-OT Days & Download"
        cancelText="Cancel & Keep Editing"
        variant="warning"
        details={noOtRowsDetected.map((r, i) => ({
          label: `${r.date || `Day ${i + 1}`} (${r.dayOfWeek || '-'})`,
          value: `In: ${r.startTime || '-'} | Out: ${r.endTime || '-'} (OT: ${r.totalFormatted || '00:00'}${r.lateNote ? ` • ${r.lateNote}` : ''})`,
        }))}
      />

      {/* Confirmation Modal: Sunday / Holiday Review */}
      <ConfirmationModal
        isOpen={isSundayReviewModalOpen}
        onClose={() => setIsSundayReviewModalOpen(false)}
        onConfirm={handleConfirmSundayReview}
        title="Review Sunday / Holiday Overtime"
        message="You have entered work hours on Sunday or a Holiday date. Please review and confirm that Sunday/Holiday overtime was officially authorized before generating the claim."
        confirmText="Confirm Authorization & Continue"
        cancelText="Review & Modify Entries"
        variant="warning"
        details={sundayRowsToReview.map(r => ({
          label: `${r.date} (${r.isHoliday ? 'Holiday' : r.dayOfWeek})`,
          value: `Worked: ${r.startTime} – ${r.endTime} (OT: ${r.totalFormatted || '00:00'}${r.reason ? ` • ${r.reason}` : ''})`,
        }))}
      />
    </div>
  );
};
