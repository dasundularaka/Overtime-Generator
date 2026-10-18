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
  Unlock,
  Banknote,
  AlertTriangle,
  Check,
  Save,
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
  TemplateConfig,
  Holiday,
  RoleRate,
} from '../types';
import {
  calculateShiftOvertime,
  formatMinutesToTime,
  getDayOfWeek,
  generateMonthDates,
  getDaysInMonth,
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
import { recordAuditLog } from '../utils/auditLogger';
import { generateOvertimePdf, printPdfDocument } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { ConfirmationModal } from './ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';
import { subscribeToHolidays } from '../services/holidayService';
import {
  fetchRoleRatesFromFirestore,
  subscribeToRoleRates,
} from '../utils/branchRoleManager';

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
  const [userShiftStartTime, setUserShiftStartTime] = useState<string>(GENERAL_SHIFT_START);
  const [userShiftEndTime, setUserShiftEndTime] = useState<string>(GENERAL_SHIFT_END);

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
  const [hourlyRateNonWorkingDays, setHourlyRateNonWorkingDays] = useState<number | ''>('');
  const [otPaymentDueB, setOtPaymentDueB] = useState<number | ''>(
    initialClaim?.otPaymentDueB !== undefined ? initialClaim.otPaymentDueB : ''
  );
  const [isSpecialAssignedOt, setIsSpecialAssignedOt] = useState<boolean>(
    initialClaim?.rows?.some(r => r.isSpecialAssignment) || false
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
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
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

  // Corporate Role Rates Subscription
  const [roleRates, setRoleRates] = useState<RoleRate[]>([]);

  useEffect(() => {
    fetchRoleRatesFromFirestore().then(list => {
      if (list && list.length > 0) setRoleRates(list);
    });
    const unsub = subscribeToRoleRates(list => {
      if (list && list.length > 0) setRoleRates(list);
    });
    return () => unsub();
  }, []);

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

  // Target profile being edited (admin can choose other user, or defaults to current logged-in user profile)
  const targetProfile = useMemo(() => {
    return allUsers.find(u => u.id === selectedUserId) || userProfile;
  }, [allUsers, selectedUserId, userProfile]);

  // Find the corporate RoleRate definition matching the user's role/designation
  const userRelevantRole = useMemo(() => {
    if (!targetProfile && !designation) return null;
    if (targetProfile?.roleId) {
      const byId = roleRates.find(r => r.id === targetProfile.roleId);
      if (byId) return byId;
    }
    if (targetProfile?.roleName) {
      const byRoleName = roleRates.find(r => r.name.toLowerCase() === targetProfile.roleName?.toLowerCase());
      if (byRoleName) return byRoleName;
    }
    const title = targetProfile?.designation || designation;
    if (title) {
      const byDesig = roleRates.find(r => r.name.toLowerCase() === title.toLowerCase());
      if (byDesig) return byDesig;
    }
    return null;
  }, [targetProfile, designation, roleRates]);

  // Lock status of the user's relevant role
  const isRoleRatesLocked = Boolean(userRelevantRole?.isRatesLocked);
  // Standard users cannot edit if locked; Admins can always edit
  const canEditRates = isAdmin || !isRoleRatesLocked;

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
      setUserShiftStartTime(targetProfile.shiftStartTime || GENERAL_SHIFT_START);
      setUserShiftEndTime(targetProfile.shiftEndTime || GENERAL_SHIFT_END);

      // Match corporate role rates if user rates are blank or from assigned role
      const matchedRole = targetProfile.roleId
        ? roleRates.find(r => r.id === targetProfile.roleId)
        : roleRates.find(r => r.name.toLowerCase() === (targetProfile.roleName || targetProfile.designation || '').toLowerCase());

      const finalHourly = targetProfile.hourlyRate !== undefined && targetProfile.hourlyRate !== ''
        ? targetProfile.hourlyRate
        : matchedRole ? matchedRole.hourlyRateWorkingDays : '';

      const finalDayPay = targetProfile.daysPay !== undefined && targetProfile.daysPay !== ''
        ? targetProfile.daysPay
        : matchedRole ? matchedRole.daysPaymentNonWorkingDays : '';

      const finalNonWorkingHourly = targetProfile.hourlyRateNonWorkingDays !== undefined && targetProfile.hourlyRateNonWorkingDays !== ''
        ? targetProfile.hourlyRateNonWorkingDays
        : matchedRole ? matchedRole.hourlyRateNonWorkingDays : '';

      setHourlyRate(finalHourly);
      setDaysPay(finalDayPay);
      setHourlyRateNonWorkingDays(finalNonWorkingHourly);
      setTotalRemuneration(targetProfile.totalRemuneration !== undefined ? targetProfile.totalRemuneration : '');
    }

    // Auto-populate full month dates with flagged holidays
    setRows(generateFullMonthRows(claimMonth, claimYear, isSpecialAssignedOt));
  }, [initialClaim, userProfile, selectedUserId, allUsers, roleRates]);

  // Generate full month of dates and flag holidays & weekends
  function generateFullMonthRows(targetMonth: string, targetYear: number, specialOt: boolean = isSpecialAssignedOt): OvertimeRow[] {
    const monthIndex = MONTH_NAMES.indexOf(targetMonth);
    const validMonth = monthIndex >= 0 ? monthIndex : new Date().getMonth();
    const daysInMonth = getDaysInMonth(targetYear, validMonth);
    const mStr = String(validMonth + 1).padStart(2, '0');

    const fullRows: OvertimeRow[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${targetYear}-${mStr}-${dStr}`;
      const dow = getDayOfWeek(dateStr);
      const isSun = dow === 'Sun';
      const isSat = dow === 'Sat';
      const hol = holidayMap.get(dateStr);
      const isHol = !!hol || isSun;
      const holidayTitle = hol?.name || (isSun ? 'Sunday' : isSat ? 'Saturday' : undefined);

      fullRows.push({
        id: 'row_' + Math.random().toString(36).substring(2, 9),
        date: dateStr,
        dayOfWeek: dow,
        startTime: isHol ? '' : (userShiftStartTime || GENERAL_SHIFT_START),
        endTime: '',
        breakMinutes: 0,
        isOvernight: false,
        isWeekend: isSat || isSun,
        isHoliday: isHol,
        holidayName: holidayTitle,
        isHolidayOverride: false,
        isSpecialAssignment: specialOt,
        totalWorkMinutes: 0,
        rawOtMinutes: 0,
        totalMinutes: 0,
        totalFormatted: '00:00',
        reason: isHol ? (hol?.name || (isSun ? 'Sunday' : 'Holiday')) : (isSat ? "Saturday Duty" : ''),
      });
    }
    return fullRows;
  }

  const handleMonthChange = (newMonth: string) => {
    setClaimMonth(newMonth);
    if (!initialClaim) {
      setRows(generateFullMonthRows(newMonth, claimYear, isSpecialAssignedOt));
    }
  };

  const handleYearChange = (newYear: number) => {
    setClaimYear(newYear);
    if (!initialClaim) {
      setRows(generateFullMonthRows(claimMonth, newYear, isSpecialAssignedOt));
    }
  };

  const handleToggleSpecialAssignedOt = (newValue: boolean) => {
    setIsSpecialAssignedOt(newValue);
    setRows(prevRows =>
      prevRows.map(r => {
        const updated = { ...r, isSpecialAssignment: newValue };
        if (updated.startTime && updated.endTime) {
          const isHoliday = !!updated.isHoliday || holidayMap.has(updated.date) || updated.dayOfWeek === 'Sun';
          const isOther = updated.dayOfWeek === 'Sat' || updated.dayOfWeek === 'Sun' || isHoliday;
          const calc = calculateShiftOvertime(
            updated.startTime,
            updated.endTime,
            0,
            maxOtLimitHours,
            isOther,
            userShiftEndTime || GENERAL_SHIFT_END,
            userShiftStartTime || GENERAL_SHIFT_START,
            newValue,
            !!updated.isHolidayOverride
          );
          updated.totalWorkMinutes = calc.totalWorkMinutes;
          updated.rawOtMinutes = calc.rawOtMinutes;
          updated.totalMinutes = calc.totalMinutes;
          updated.totalFormatted = (isOther && !updated.isHolidayOverride) ? '' : formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
          updated.isCapped = calc.isCapped;
        }
        return updated;
      })
    );
  };

  // Create clean blank row with assigned shift start time
  function createBlankRow(defaultDate: string = ''): OvertimeRow {
    const isWk = isWeekendDay(defaultDate);
    const isHol = holidayMap.has(defaultDate);
    const isSun = getDayOfWeek(defaultDate) === 'Sun';
    const isOff = isWk || isHol || isSun;
    return {
      id: 'row_' + Math.random().toString(36).substring(2, 9),
      date: defaultDate,
      dayOfWeek: getDayOfWeek(defaultDate),
      startTime: isOff ? '' : (userShiftStartTime || GENERAL_SHIFT_START),
      endTime: '',
      breakMinutes: 0,
      isOvernight: false,
      isWeekend: isWk || isSun,
      isHoliday: isHol || isSun,
      holidayName: holidayMap.get(defaultDate)?.name || (isSun ? 'Sunday' : undefined),
      isHolidayOverride: false,
      isSpecialAssignment: isSpecialAssignedOt,
      totalWorkMinutes: 0,
      rawOtMinutes: 0,
      totalMinutes: 0,
      totalFormatted: '00:00',
      reason: isHol ? (holidayMap.get(defaultDate)?.name || 'Holiday') : (isSun ? 'Sunday' : ''),
    };
  }

  // Toggle holiday override to enter In/Out times and claim overtime
  const toggleHolidayOverride = (index: number) => {
    setRows(prevRows => {
      const updated = [...prevRows];
      const target = { ...updated[index] };
      const nextOverride = !target.isHolidayOverride;
      target.isHolidayOverride = nextOverride;

      if (nextOverride) {
        if (!target.startTime) target.startTime = userShiftStartTime || GENERAL_SHIFT_START;
      } else {
        target.startTime = '';
        target.endTime = '';
        target.totalWorkMinutes = 0;
        target.rawOtMinutes = 0;
        target.totalMinutes = 0;
        target.totalFormatted = '00:00';
      }

      if (target.startTime && target.endTime) {
        const isSpecial = isSpecialAssignedOt || !!target.isSpecialAssignment;
        const calc = calculateShiftOvertime(
          target.startTime,
          target.endTime,
          0,
          maxOtLimitHours,
          true,
          userShiftEndTime || GENERAL_SHIFT_END,
          userShiftStartTime || GENERAL_SHIFT_START,
          isSpecial,
          nextOverride
        );
        target.totalWorkMinutes = calc.totalWorkMinutes;
        target.rawOtMinutes = calc.rawOtMinutes;
        target.totalMinutes = calc.totalMinutes;
        target.totalFormatted = formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
        target.isDaysPayment = true;
      }

      updated[index] = target;
      return updated;
    });
  };

  // Row update with employee shift and 15-minute generation
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
          if (!target.isHolidayOverride) {
            target.startTime = '';
            target.endTime = '';
          }
        }
      }

      if (field === 'isHoliday' && value) {
        if (!target.isHolidayOverride) {
          target.startTime = '';
          target.endTime = '';
        }
      }

      const isHoliday = !!target.isHoliday || holidayMap.has(target.date) || target.dayOfWeek === 'Sun';
      const isOther = target.dayOfWeek === 'Sat' || target.dayOfWeek === 'Sun' || isHoliday;
      const isSpecial = isSpecialAssignedOt || !!target.isSpecialAssignment;
      const isHolOverride = !!target.isHolidayOverride;

      // Calculate shift overtime according to company rules
      const calc = calculateShiftOvertime(
        target.startTime,
        target.endTime,
        0,
        maxOtLimitHours,
        isOther,
        userShiftEndTime || GENERAL_SHIFT_END,
        userShiftStartTime || GENERAL_SHIFT_START,
        isSpecial,
        isHolOverride
      );

      target.totalWorkMinutes = calc.totalWorkMinutes;
      target.rawOtMinutes = calc.rawOtMinutes;
      target.totalMinutes = calc.totalMinutes;
      target.totalFormatted = (isOther && !isHolOverride) ? '' : formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
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

  // Re-calculate all rows when user OT limit or shift changes
  useEffect(() => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (!row.startTime || !row.endTime) return row;
        const isHoliday = !!row.isHoliday || holidayMap.has(row.date) || row.dayOfWeek === 'Sun';
        const isOther = row.dayOfWeek === 'Sat' || row.dayOfWeek === 'Sun' || isHoliday;
        const isSpecial = isSpecialAssignedOt || !!row.isSpecialAssignment;
        const isHolOverride = !!row.isHolidayOverride;
        const calc = calculateShiftOvertime(
          row.startTime,
          row.endTime,
          0,
          maxOtLimitHours,
          isOther,
          userShiftEndTime || GENERAL_SHIFT_END,
          userShiftStartTime || GENERAL_SHIFT_START,
          isSpecial,
          isHolOverride
        );
        return {
          ...row,
          totalWorkMinutes: calc.totalWorkMinutes,
          rawOtMinutes: calc.rawOtMinutes,
          totalMinutes: calc.totalMinutes,
          totalFormatted: (isOther && !isHolOverride) ? '' : formatMinutesToTime(calc.totalMinutes, otDisplayFormat),
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
  }, [maxOtLimitHours, otDisplayFormat, holidayMap, userShiftEndTime, userShiftStartTime, isSpecialAssignedOt]);

  // Auto-Fill Month: Loads ALL dates in the selected month with holidays & Sundays shown
  const handleAutoFillMonth = () => {
    const monthIndex = MONTH_NAMES.indexOf(claimMonth);
    if (monthIndex < 0) return;

    const holidayDatesSet = new Set(calendarHolidays.map(h => h.date));
    // Load ALL dates in the month (do NOT exclude holidays or Sundays)
    const monthDates = generateMonthDates(claimYear, monthIndex, holidayDatesSet, false);
    const existingDateMap = new Map(rows.map(r => [r.date, r]));

    const newRows: OvertimeRow[] = monthDates.map(({ date, day, isHoliday }) => {
      const existing = existingDateMap.get(date);
      if (existing) return existing;
      const isSat = day === 'Sat';
      const isSun = day === 'Sun';
      const isHol = isHoliday || isSun || holidayDatesSet.has(date);
      const holidayInfo = holidayMap.get(date);

      return {
        id: 'row_' + Math.random().toString(36).substring(2, 9),
        date,
        dayOfWeek: day,
        startTime: isHol || isSat ? '' : (userShiftStartTime || GENERAL_SHIFT_START),
        endTime: '',
        breakMinutes: 0,
        isOvernight: false,
        isWeekend: isSat || isSun,
        isHoliday: isHol,
        holidayName: holidayInfo?.name || (isSun ? 'Sunday' : isHol ? 'Public Holiday' : undefined),
        isHolidayOverride: false,
        isSpecialAssignment: isSpecialAssignedOt,
        totalWorkMinutes: 0,
        rawOtMinutes: 0,
        totalMinutes: 0,
        totalFormatted: '00:00',
        reason: isHol ? (holidayInfo?.name || (isSun ? 'Sunday' : 'Holiday')) : (isSat ? "Saturday Duty (Day's Pay)" : ''),
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
  // Column A: Regular Weekday Overtime (Mon-Fri, non-holiday, NOT Special OT, NOT Holiday Override)
  const columnA_Rows = useMemo(() => {
    return rows.filter(
      r => isWeekdayWorkingDay(r) && !(r.isSpecialAssignment ?? isSpecialAssignedOt) && !r.isHolidayOverride && (r.totalMinutes || 0) > 0
    );
  }, [rows, holidayMap, isSpecialAssignedOt]);

  const colAMinutes = useMemo(() => {
    return columnA_Rows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [columnA_Rows]);

  const colADecimalHours = useMemo(() => {
    return parseFloat((colAMinutes / 60).toFixed(2));
  }, [colAMinutes]);

  const otPaymentDueA = useMemo(() => {
    if (hourlyRate === '' || isNaN(Number(hourlyRate))) return 0;
    return Math.round(colADecimalHours * Number(hourlyRate) * 100) / 100;
  }, [colADecimalHours, hourlyRate]);

  // Column B: Special Assigned OT (no limit) OR Holiday Overridden Overtime
  const columnB_Rows = useMemo(() => {
    return rows.filter(
      r => ((r.isSpecialAssignment ?? isSpecialAssignedOt) || r.isHolidayOverride) && (r.totalMinutes || 0) > 0
    );
  }, [rows, isSpecialAssignedOt]);

  const colBMinutes = useMemo(() => {
    return columnB_Rows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [columnB_Rows]);

  const colBDecimalHours = useMemo(() => {
    return parseFloat((colBMinutes / 60).toFixed(2));
  }, [colBMinutes]);

  // Special OT on weekdays
  const specialOtWeekdayMinutes = useMemo(() => {
    return rows
      .filter(r => isWeekdayWorkingDay(r) && (r.isSpecialAssignment ?? isSpecialAssignedOt) && !r.isHolidayOverride)
      .reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [rows, holidayMap, isSpecialAssignedOt]);

  const specialOtWeekdayPayment = useMemo(() => {
    if (hourlyRate === '' || isNaN(Number(hourlyRate))) return 0;
    return Math.round((specialOtWeekdayMinutes / 60) * Number(hourlyRate) * 100) / 100;
  }, [specialOtWeekdayMinutes, hourlyRate]);

  // Overridden Holiday Overtime: time worked on holidays earns Day's Pay AND Non-Working Days Hourly Rate
  const holidayOverriddenRows = useMemo(() => {
    return rows.filter(r => r.isHolidayOverride && (r.totalMinutes > 0 || r.totalWorkMinutes > 0));
  }, [rows]);

  const holidayOtMinutes = useMemo(() => {
    return holidayOverriddenRows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [holidayOverriddenRows]);

  const holidayDecimalHours = useMemo(() => {
    return parseFloat((holidayOtMinutes / 60).toFixed(2));
  }, [holidayOtMinutes]);

  const effectiveNonWorkingHourlyRate = useMemo(() => {
    if (hourlyRateNonWorkingDays !== '' && !isNaN(Number(hourlyRateNonWorkingDays))) {
      return Number(hourlyRateNonWorkingDays);
    }
    if (hourlyRate !== '' && !isNaN(Number(hourlyRate))) {
      return Math.round(Number(hourlyRate) * 1.5 * 100) / 100;
    }
    return 0;
  }, [hourlyRateNonWorkingDays, hourlyRate]);

  const holidayHourlyPayment = useMemo(() => {
    if (effectiveNonWorkingHourlyRate <= 0) return 0;
    return Math.round(holidayDecimalHours * effectiveNonWorkingHourlyRate * 100) / 100;
  }, [holidayDecimalHours, effectiveNonWorkingHourlyRate]);

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

  // Payment for Column B (Special Assignment & Holiday Override)
  const calculatedPaymentB = useMemo(() => {
    const manualB = otPaymentDueB !== '' ? Number(otPaymentDueB) : 0;
    return Math.round((specialOtWeekdayPayment + holidayHourlyPayment + (isNaN(manualB) ? 0 : manualB)) * 100) / 100;
  }, [specialOtWeekdayPayment, holidayHourlyPayment, otPaymentDueB]);

  const totalOtPayment = useMemo(() => {
    return Math.round((otPaymentDueA + calculatedPaymentB + daysPayTotal) * 100) / 100;
  }, [otPaymentDueA, calculatedPaymentB, daysPayTotal]);

  const summary = useMemo(() => {
    const totalMin = colAMinutes + colBMinutes;
    const otDays = columnA_Rows.length + columnB_Rows.length;
    const cappedCount = rows.filter(r => r.isCapped).length;
    const totalHoursFormatted = formatMinutesToTime(totalMin, 'hhmm');
    const totalDecimalHours = parseFloat((totalMin / 60).toFixed(2));

    return {
      totalMinutes: totalMin,
      totalHoursFormatted,
      totalDecimalHours,
      colAMinutes,
      colADecimalHours,
      colAFormatted: formatMinutesToTime(colAMinutes, 'hhmm'),
      colBMinutes,
      colBDecimalHours,
      colBFormatted: formatMinutesToTime(colBMinutes, 'hhmm'),
      otDaysCount: otDays,
      cappedCount,
      daysPayCount,
      daysPayTotal,
      holidayOtMinutes,
      holidayDecimalHours,
      holidayHourlyPayment,
      specialOtWeekdayPayment,
      calculatedPaymentB,
    };
  }, [
    colAMinutes,
    colBMinutes,
    columnA_Rows,
    columnB_Rows,
    rows,
    daysPayCount,
    daysPayTotal,
    holidayOtMinutes,
    holidayDecimalHours,
    holidayHourlyPayment,
    specialOtWeekdayPayment,
    calculatedPaymentB,
  ]);

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
      if (hourlyRateNonWorkingDays === '') setHourlyRateNonWorkingDays(Math.round(calculatedHourlyRate * 1.5 * 100) / 100);
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

  // Helper to identify claimed rows (non-claimed days are removed automatically in generation)
  const isClaimedRow = (r: OvertimeRow): boolean => {
    if (!r.endTime || r.endTime.trim() === '') return false;
    return (
      (r.totalMinutes || 0) > 0 ||
      (r.totalWorkMinutes || 0) > 0 ||
      !!r.isDaysPayment ||
      !!r.isHolidayOverride ||
      (!!r.specialAssignmentHours && r.specialAssignmentHours.trim() !== '')
    );
  };

  const buildClaimRecord = (customRows?: OvertimeRow[]): ClaimRecord => {
    const claimId = initialClaim?.id || 'clm_' + Date.now();
    const sourceRows = customRows || rows;
    // Automatically remove non-claimed days in generation
    const claimedRows = sourceRows.filter(isClaimedRow);
    const activeRows = claimedRows.length > 0 ? claimedRows : sourceRows.filter(r => r.startTime || r.endTime);

    const totalMinutes = activeRows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
    const otDaysCount = activeRows.filter(r => (r.totalMinutes || 0) > 0).length;
    const totalDecimalHours = parseFloat((totalMinutes / 60).toFixed(2));
    const totalHoursFormatted = formatMinutesToTime(totalMinutes, otDisplayFormat);

    // Column A: ONLY regular weekday OT (NOT special OT, NOT holiday override)
    const calculatedPaymentA =
      hourlyRate !== '' && !isNaN(Number(hourlyRate))
        ? Math.round(
            activeRows
              .filter(r => isWeekdayWorkingDay(r) && !(r.isSpecialAssignment ?? isSpecialAssignedOt) && !r.isHolidayOverride)
              .reduce((acc, r) => acc + (r.totalMinutes || 0), 0) /
              60 *
              Number(hourlyRate) *
              100
          ) / 100
        : 0;

    const currentDaysPayCount = activeRows.filter(r => isOtherDayRow(r) && r.totalWorkMinutes > 0).length;
    const currentDaysPayTotal =
      daysPay !== '' && !isNaN(Number(daysPay))
        ? Math.round(currentDaysPayCount * Number(daysPay) * 100) / 100
        : 0;

    // Column B: Special Assigned OT AND Holiday Override OT
    const specialOtWeekdayMin = activeRows
      .filter(r => isWeekdayWorkingDay(r) && (r.isSpecialAssignment ?? isSpecialAssignedOt) && !r.isHolidayOverride)
      .reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
    const specialOtWeekdayPayment =
      hourlyRate !== '' && !isNaN(Number(hourlyRate))
        ? Math.round((specialOtWeekdayMin / 60) * Number(hourlyRate) * 100) / 100
        : 0;

    const currentHolidayOtMin = activeRows
      .filter(r => r.isHolidayOverride)
      .reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
    const currentHolidayPayment =
      effectiveNonWorkingHourlyRate > 0
        ? Math.round((currentHolidayOtMin / 60) * effectiveNonWorkingHourlyRate * 100) / 100
        : 0;

    const manualB = otPaymentDueB !== '' ? Number(otPaymentDueB) : 0;
    const calculatedPaymentB = Math.round((specialOtWeekdayPayment + currentHolidayPayment + (isNaN(manualB) ? 0 : manualB)) * 100) / 100;
    const calculatedTotalPayment = Math.round((calculatedPaymentA + calculatedPaymentB + currentDaysPayTotal) * 100) / 100;

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
      rows: activeRows.map(r => ({
        ...r,
        isSpecialAssignment: r.isSpecialAssignment ?? isSpecialAssignedOt,
      })),
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
      otPaymentDueB: calculatedPaymentB,
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

      // Record administrative audit log
      await recordAuditLog({
        action: initialClaim ? 'CLAIM_UPDATE' : 'CLAIM_CREATE',
        actionLabel: initialClaim ? 'Updated overtime claim' : 'Created new overtime claim',
        targetType: 'claim',
        targetId: claim.id,
        targetDescription: `${claim.claimNumber} (${claim.employeeName} - ${claim.month}/${claim.year})`,
        details: {
          month: claim.month,
          year: claim.year,
          totalHours: claim.totalHoursFormatted,
          totalMinutes: claim.totalMinutes,
          totalOtPayment: claim.totalOtPayment,
          claimType: claim.claimType,
          branch: claim.branch,
          department: claim.department,
          hourlyRate: claim.hourlyRate,
          daysPay: claim.daysPay,
        },
      });

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
      const { blob, url, filename } = await generateOvertimePdf(
        claim,
        activeTemplate,
        settings.globalPrinterOffsetX,
        settings.globalPrinterOffsetY
      );

      // Clean up previous blob URL to prevent memory leaks and stale caches
      if (previewPdfUrl && previewPdfUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewPdfUrl);
        } catch (_) {}
      }

      setPreviewPdfUrl(url);
      setPreviewPdfBlob(blob);
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

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Full Month Auto-Populated</span>
            </span>
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

        {/* Admin User Picker (Only visible to admins) */}
        {isAdmin && allUsers.length > 0 && (
          <div className="mt-4 bg-purple-50/60 p-3 rounded-2xl border border-purple-200 text-xs">
            <label className="block font-bold text-purple-900 mb-1">
              Admin: Select Employee Profile
            </label>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="w-full rounded-xl border border-purple-300 bg-white py-1.5 px-3 text-xs text-slate-800 font-semibold"
            >
              {allUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.employeeNumber || u.pfNumber}) &bull; Shift: {u.shiftStartTime || '08:00'}-{u.shiftEndTime || '16:45'} &bull; Cap: {u.maxOtHoursPerDay || 2.0}h
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Read-Only Verified Claimant Particulars (No Change Access) & Period / Special OT Controls */}
        <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          {/* Claimant Identity (Locked & Verified from Profile) */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white font-bold text-base shadow-sm shrink-0">
              {employeeName ? employeeName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-sm">{employeeName || 'Staff Member'}</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold text-[11px] border border-indigo-200">
                  {employeeNumber || 'PF Number'}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 font-semibold text-[10px] flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Profile Locked</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                <span>{designation || 'Staff Member'}</span>
                <span>&bull;</span>
                <span>{branch || 'Head Office'}</span>
                <span>&bull;</span>
                <span>{department || 'IT Operations'}</span>
                <span>&bull;</span>
                <span className="font-medium text-slate-600">Shift: {userShiftStartTime} - {userShiftEndTime}</span>
              </div>
            </div>
          </div>

          {/* Month, Year & Special Assigned OT Toggle Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <label className="font-bold text-slate-600 text-[11px] uppercase tracking-wider">Month:</label>
              <select
                value={claimMonth}
                onChange={e => handleMonthChange(e.target.value)}
                className="bg-transparent font-bold text-slate-800 text-xs focus:outline-hidden cursor-pointer"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                value={claimYear}
                onChange={e => handleYearChange(parseInt(e.target.value, 10) || 2026)}
                className="w-16 bg-transparent font-bold text-slate-800 text-xs font-mono text-center focus:outline-hidden border-l border-slate-200 pl-2"
              />
            </div>

            {/* Special Assigned OT Toggle (No limit / No break / No manager initial) */}
            <button
              type="button"
              onClick={() => handleToggleSpecialAssignedOt(!isSpecialAssignedOt)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                isSpecialAssignedOt
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title="Special Assigned OT (No limit / No break / No manager initial)"
            >
              <Check className={`w-3.5 h-3.5 ${isSpecialAssignedOt ? 'text-white' : 'text-slate-400'}`} />
              <span>Special Assigned OT</span>
              {isSpecialAssignedOt && <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.2 rounded font-mono">No Limit</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Overtime Rates & Remuneration Panel (Subject to Role Lock Status) */}
      <div className={`rounded-2xl p-4 sm:p-5 border transition-all ${
        isRoleRatesLocked && !isAdmin
          ? 'bg-amber-50/60 border-amber-200 shadow-2xs'
          : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl shrink-0 ${
              isRoleRatesLocked && !isAdmin
                ? 'bg-amber-100 text-amber-800'
                : 'bg-indigo-50 text-indigo-700'
            }`}>
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  Overtime Payment Rates
                </h3>
                {userRelevantRole && (
                  <span className="text-[11px] font-semibold text-slate-600">
                    &bull; Role: <strong className="text-slate-900">{userRelevantRole.name}</strong>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Official overtime rate matrix for working days, non-working days &amp; monthly remuneration.
              </p>
            </div>
          </div>

          {/* Role Rates Lock Status Pill */}
          <div className="flex items-center gap-2 shrink-0">
            {isRoleRatesLocked ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300 shadow-2xs">
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Rates Locked by Admin</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-300 shadow-2xs">
                <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Rates Unlocked (Editable)</span>
              </span>
            )}
            {isAdmin && isRoleRatesLocked && (
              <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold border border-purple-200">
                Admin Override Active
              </span>
            )}
          </div>
        </div>

        {/* Lock Notice for Standard Users */}
        {isRoleRatesLocked && !isAdmin && (
          <div className="mt-3 p-3 rounded-xl bg-amber-100/70 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <p className="leading-relaxed">
              Your overtime rates are <strong>locked by corporate administration</strong> for your assigned role (<strong>{userRelevantRole?.name || designation || 'Staff'}</strong>). You cannot edit these rates on this claim sheet.
            </p>
          </div>
        )}

        {/* Unlocked Notice for Standard Users */}
        {!isRoleRatesLocked && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
            <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <p className="leading-relaxed">
              Overtime rates are <strong>unlocked</strong> for your role (<strong>{userRelevantRole?.name || designation || 'Staff'}</strong>). You are authorized to edit these rates if authorized by your manager.
            </p>
          </div>
        )}

        {/* 4 Rates Inputs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* 1. Working Days Hourly Rate */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 text-[11px] flex items-center gap-1">
                <span>Working Days Hourly Rate</span>
                <span className="text-rose-500">*</span>
              </label>
              {!canEditRates && <Lock className="w-3 h-3 text-slate-400" />}
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
              <input
                type="number"
                step="0.01"
                disabled={!canEditRates}
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="e.g. 1850.00"
                className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono font-bold text-xs ${
                  !canEditRates
                    ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                    : 'border-blue-300 bg-blue-50/30 text-blue-950 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                }`}
              />
            </div>
            <span className="text-[10px] text-slate-400 block truncate">Column A &amp; Weekday overtime</span>
          </div>

          {/* 2. Non-Working Days Daily Payment */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 text-[11px] flex items-center gap-1">
                <span>Non-Working Days Payment</span>
                <span className="text-rose-500">*</span>
              </label>
              {!canEditRates && <Lock className="w-3 h-3 text-slate-400" />}
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
              <input
                type="number"
                step="0.01"
                disabled={!canEditRates}
                value={daysPay}
                onChange={e => setDaysPay(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="e.g. 12500.00"
                className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono font-bold text-xs ${
                  !canEditRates
                    ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                    : 'border-amber-300 bg-amber-50/30 text-amber-950 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                }`}
              />
            </div>
            <span className="text-[10px] text-slate-400 block truncate">Sat (min 6h) / Sun / Holiday day payment</span>
          </div>

          {/* 3. Non-Working Days Hourly Rate */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 text-[11px] flex items-center gap-1">
                <span>Non-Working Days Hourly Rate</span>
                <span className="text-rose-500">*</span>
              </label>
              {!canEditRates && <Lock className="w-3 h-3 text-slate-400" />}
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
              <input
                type="number"
                step="0.01"
                disabled={!canEditRates}
                value={hourlyRateNonWorkingDays}
                onChange={e => setHourlyRateNonWorkingDays(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="e.g. 2312.50"
                className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono font-bold text-xs ${
                  !canEditRates
                    ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                    : 'border-purple-300 bg-purple-50/30 text-purple-950 focus:border-purple-500 focus:ring-1 focus:ring-purple-500'
                }`}
              />
            </div>
            <span className="text-[10px] text-slate-400 block truncate">Column B / Holiday override hourly</span>
          </div>

          {/* 4. Total Monthly Remuneration (Auto-calculator) */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 text-[11px]">
                Monthly Remuneration (Salary)
              </label>
              {!canEditRates && <Lock className="w-3 h-3 text-slate-400" />}
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
              <input
                type="number"
                step="0.01"
                disabled={!canEditRates}
                value={totalRemuneration}
                onChange={e => handleRemunerationChange(e.target.value)}
                placeholder="e.g. 275000.00"
                className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono text-xs ${
                  !canEditRates
                    ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                    : 'border-slate-300 bg-white text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                }`}
              />
            </div>
            <span className="text-[10px] text-slate-400 block truncate">Formula: Pay/22, Hourly=Day/8</span>
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
          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium">
            <span className="text-indigo-600">Col A: {summary.colAFormatted}</span>
            <span className="text-slate-300">&bull;</span>
            <span className="text-emerald-700 font-semibold">Col B: {summary.colBFormatted}</span>
          </div>
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

          <div className="flex flex-wrap items-center gap-2">
            {/* Special Assigned Overtime Modern Tick Option */}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100/70 text-indigo-900 text-xs font-semibold cursor-pointer transition select-none">
              <input
                type="checkbox"
                checked={isSpecialAssignedOt}
                onChange={e => {
                  const val = e.target.checked;
                  setIsSpecialAssignedOt(val);
                  setRows(prev => prev.map(r => ({ ...r, isSpecialAssignment: val })));
                }}
                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-indigo-300 cursor-pointer"
              />
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Special Assigned OT (No Limit)</span>
            </label>

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
              const isRowSpecial = row.isSpecialAssignment ?? isSpecialAssignedOt;

              return (
                <div key={row.id} className="p-3.5 space-y-2.5 bg-white">
                  {/* Card Header: #, Date, Day, Holiday & Override, Caution Icon, Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
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

                      {/* Next to holiday, show modern override option to add in/out times and claim holiday overtime */}
                      {isHol && (
                        <button
                          type="button"
                          onClick={() => toggleHolidayOverride(index)}
                          className={`text-[10px] px-2 py-0.5 rounded font-bold transition flex items-center gap-1 cursor-pointer ${
                            row.isHolidayOverride
                              ? 'bg-amber-500 text-white shadow-xs border border-amber-600'
                              : 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                          }`}
                          title="Override to add in/out times and claim holiday overtime & day's pay"
                        >
                          {row.isHolidayOverride ? 'Override ✓' : 'Override OT'}
                        </button>
                      )}

                      {/* Caution icon (only icon) for relevant day if override is ticked */}
                      {row.isHolidayOverride && (
                        <span title="Holiday Overridden" className="inline-flex items-center">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        </span>
                      )}
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
                      placeholder={isOther && !row.isHolidayOverride ? (isHol ? "Holiday / Off Day" : "Weekend Duty...") : "Duties performed..."}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-300"
                    />
                  </div>

                  {/* Time Inputs: Start and End (Break option removed) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Start Time</label>
                      <input
                        type="time"
                        disabled={isHol && !row.isHolidayOverride}
                        value={(isHol && !row.isHolidayOverride) ? '' : row.startTime}
                        onChange={e => updateRowField(index, 'startTime', e.target.value)}
                        className={`w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs ${
                          (isHol && !row.isHolidayOverride) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">End Time</label>
                      <input
                        type="time"
                        disabled={isHol && !row.isHolidayOverride}
                        value={(isHol && !row.isHolidayOverride) ? '' : row.endTime}
                        onChange={e => updateRowField(index, 'endTime', e.target.value)}
                        className={`w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs ${
                          (isHol && !row.isHolidayOverride) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Special Assigned OT Modern Tick Option & Outcome Summary */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={() => updateRowField(index, 'isSpecialAssignment', !isRowSpecial)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        isRowSpecial
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                      title="Tick if assigned to special overtime (No limit)"
                    >
                      <Check className={`w-3.5 h-3.5 ${isRowSpecial ? 'text-white' : 'text-slate-400'}`} />
                      <span>{isRowSpecial ? 'Special OT (No Limit) ✓' : 'Special Assigned OT'}</span>
                    </button>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {row.isHolidayOverride && hasOt ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Col B: {row.totalFormatted} (Hol Override)
                        </span>
                      ) : isRowSpecial && hasOt ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Col B: {row.totalFormatted} (Special OT)
                        </span>
                      ) : isOther ? (
                        row.totalWorkMinutes > 0 ? (
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isSat && row.totalWorkMinutes < 360
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            Day&apos;s Pay {isSat && row.totalWorkMinutes < 360 ? '(Sat < 6h)' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`font-mono text-xs font-bold ${hasOt ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {hasOt ? `Col A: ${row.totalFormatted}` : '00:00 OT'}
                          </span>
                          {row.isLateDisqualified && (
                            <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 rounded border border-rose-200">
                              Late 0 OT
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Desktop Table View - Non-scrollable, fits 100% in one line screen fit */}
        <div className={`overflow-hidden w-full ${mobileViewMode === 'cards' ? 'hidden md:block' : 'block'}`}>
          <table className="w-full table-fixed text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-2 px-1 w-6 text-center">#</th>
                <th className="py-2 px-1.5 w-28">Date &amp; Day</th>
                <th className="py-2 px-1.5 w-28 text-center">Holiday / Override</th>
                <th className="py-2 px-2">Duties / Nature of Work</th>
                <th className="py-2 px-1 w-18 text-center">Time In</th>
                <th className="py-2 px-1 w-18 text-center">Time Out</th>
                <th className="py-2 px-1 w-14 text-center">Worked</th>
                <th className="py-2 px-1 w-14 text-center" title="Column A: Regular Weekday Overtime">OT (A)</th>
                <th className="py-2 px-1 w-16 text-center" title="Column B: Special Assigned OT &amp; Holiday Overridden Overtime">OT (B)</th>
                <th className="py-2 px-1 w-20 text-center" title="Toggle Special Assigned OT (no limit)">Special OT</th>
                <th className="py-2 px-1 w-8 text-center">Del</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {rows.map((row, index) => {
                const hasOt = row.totalMinutes > 0;
                const isSat = row.dayOfWeek === 'Sat' || getDayOfWeek(row.date) === 'Sat';
                const isSun = row.dayOfWeek === 'Sun' || getDayOfWeek(row.date) === 'Sun';
                const isHol = !!row.isHoliday || holidayMap.has(row.date) || isSun || /holiday|poya|mercantile|off\s*day|leave/i.test(row.reason || '');
                const isOther = isSat || isSun || isHol;
                const isRowSpecial = row.isSpecialAssignment ?? isSpecialAssignedOt;

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      hasOt ? 'bg-indigo-50/20' : ''
                    }`}
                  >
                    {/* Index */}
                    <td className="py-2 px-1 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* Date & Day */}
                    <td className="py-2 px-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={row.date}
                          onChange={e => updateRowField(index, 'date', e.target.value)}
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-1 py-1 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span
                          className={`inline-block px-1 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            row.isHoliday || isHol
                              ? 'bg-rose-100 text-rose-800'
                              : isSun
                              ? 'bg-purple-100 text-purple-800'
                              : isSat
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.dayOfWeek || '-'}
                        </span>
                      </div>
                    </td>

                    {/* Holiday Status & Holiday Override Checkbox with Caution Icon */}
                    <td className="py-2 px-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {isHol ? (
                          <label
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer select-none transition ${
                              row.isHolidayOverride
                                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Tick override checkbox to enable in/out times and claim overtime on holidays (Adds to Column B)"
                          >
                            <input
                              type="checkbox"
                              checked={!!row.isHolidayOverride}
                              onChange={() => toggleHolidayOverride(index)}
                              className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 border-amber-300 cursor-pointer"
                            />
                            <span>{row.isHolidayOverride ? 'Override' : 'Holiday'}</span>
                            {row.isHolidayOverride && (
                              <span title="Caution: Holiday Overridden" className="inline-flex items-center">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />
                              </span>
                            )}
                          </label>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Regular</span>
                        )}
                      </div>
                    </td>

                    {/* Reason / Duties */}
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={row.reason}
                        onChange={e => updateRowField(index, 'reason', e.target.value)}
                        placeholder={isOther && !row.isHolidayOverride ? (isHol ? "Holiday / Off Day" : "Weekend Duty...") : "Duties performed..."}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
                      />
                    </td>

                    {/* Time In (Enabled when Holiday is Overridden) */}
                    <td className="py-2 px-1 text-center">
                      <input
                        type="time"
                        disabled={isHol && !row.isHolidayOverride}
                        value={(isHol && !row.isHolidayOverride) ? '' : row.startTime}
                        onChange={e => updateRowField(index, 'startTime', e.target.value)}
                        title={(isHol && !row.isHolidayOverride) ? "Tick 'Override' checkbox to enter times on holidays" : "Starting Time"}
                        placeholder={(isHol && !row.isHolidayOverride) ? "--:--" : ""}
                        className={`w-full rounded-md border border-slate-200 px-1 py-1 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          (isHol && !row.isHolidayOverride)
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-white text-slate-800'
                        }`}
                      />
                    </td>

                    {/* Time Out (Enabled when Holiday is Overridden) */}
                    <td className="py-2 px-1 text-center">
                      <input
                        type="time"
                        disabled={isHol && !row.isHolidayOverride}
                        value={(isHol && !row.isHolidayOverride) ? '' : row.endTime}
                        onChange={e => updateRowField(index, 'endTime', e.target.value)}
                        title={(isHol && !row.isHolidayOverride) ? "Tick 'Override' checkbox to enter times on holidays" : "Ending Time"}
                        placeholder={(isHol && !row.isHolidayOverride) ? "--:--" : ""}
                        className={`w-full rounded-md border border-slate-200 px-1 py-1 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          (isHol && !row.isHolidayOverride)
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-white text-slate-800'
                        }`}
                      />
                    </td>

                    {/* Worked */}
                    <td className="py-2 px-1 text-center font-mono text-[11px] text-slate-600">
                      {row.isHolidayOverride && row.totalWorkMinutes > 0 ? (
                        <span className="font-bold text-amber-800">{formatMinutesToTime(row.totalWorkMinutes, 'hhmm')}</span>
                      ) : isOther ? (
                        row.totalWorkMinutes > 0 ? (
                          <span className="font-bold text-slate-700 text-[10px]">Day&apos;s Pay</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )
                      ) : row.totalWorkMinutes > 0 ? (
                        <span>{formatMinutesToTime(row.totalWorkMinutes, 'hhmm')}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* Overtime (A): Regular Weekday Overtime ONLY */}
                    <td className="py-2 px-1 text-center font-mono text-xs font-bold">
                      {!isRowSpecial && !row.isHolidayOverride && !isOther && hasOt ? (
                        <span className="text-indigo-600">{row.totalFormatted || '00:00'}</span>
                      ) : (
                        <span className="text-slate-300 font-normal">-</span>
                      )}
                    </td>

                    {/* Overtime (B): Special Assigned OT OR Holiday Overridden Overtime */}
                    <td className="py-2 px-1 text-center font-mono text-xs font-bold">
                      {(isRowSpecial || row.isHolidayOverride) && hasOt ? (
                        <span className="inline-block px-1 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {row.totalFormatted || '00:00'}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">-</span>
                      )}
                    </td>

                    {/* Special Assigned OT Toggle (No Limit / No Break / No Manager Initial) */}
                    <td className="py-2 px-1 text-center">
                      <label
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer select-none transition ${
                          isRowSpecial
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Special Assigned OT (no limit/no break/no manager initial). When selected, OT moves to Column B."
                      >
                        <input
                          type="checkbox"
                          checked={isRowSpecial}
                          onChange={e => updateRowField(index, 'isSpecialAssignment', e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                        />
                        <span>{isRowSpecial ? 'Special' : 'Special'}</span>
                      </label>
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer transition"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <button
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Row</span>
          </button>

          <div className="flex items-center gap-4 text-slate-700">
            <span>
              Col A (Regular): <strong className="text-indigo-600">{summary.colAFormatted}</strong>
            </span>
            <div className="h-4 w-px bg-slate-300" />
            <span>
              Col B (Special/Hol): <strong className="text-emerald-700">{summary.colBFormatted}</strong>
            </span>
            <div className="h-4 w-px bg-slate-300" />
            <span>
              Total OT:{' '}
              <strong className="text-slate-900 text-sm font-black">
                {summary.totalHoursFormatted}
              </strong>{' '}
              ({summary.totalDecimalHours} hrs)
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar: Preview, Save, Download */}
      <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-lg border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-20 backdrop-blur-md bg-white/95">
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800">Total Claimable OT:</span>{' '}
            <strong className="text-indigo-600 text-sm font-black">{summary.totalHoursFormatted}</strong> ({summary.totalDecimalHours} hrs)
            <span className="mx-2 text-slate-300">&bull;</span>
            <span className="font-medium text-indigo-700">Col A: {summary.colAFormatted}</span>
            <span className="mx-2 text-slate-300">&bull;</span>
            <span className="font-medium text-emerald-700">Col B: {summary.colBFormatted}</span>
            <span className="mx-2 text-slate-300">&bull;</span>
            <span className="font-medium text-slate-700">{summary.otDaysCount} Days</span>
            {isSpecialAssignedOt && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                Special Assigned OT (No Limit)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {/* 1. Preview PDF Button */}
          <button
            type="button"
            onClick={handlePreviewPdf}
            disabled={isGeneratingPdf}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Preview print-ready A4 Overtime Sheet"
          >
            <Eye className="w-4 h-4" />
            <span>{isGeneratingPdf ? 'Rendering...' : 'Preview'}</span>
          </button>

          {/* 2. Save Claim Button */}
          <button
            type="button"
            onClick={handleSaveClaim}
            disabled={isGeneratingPdf}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Save claim to database and history"
          >
            <Save className="w-4 h-4 text-slate-600" />
            <span>Save</span>
          </button>

          {/* 3. Download PDF Button */}
          <button
            type="button"
            onClick={handleInitiateDownload}
            disabled={isGeneratingPdf}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition cursor-pointer disabled:opacity-50"
            title="Download official PDF sheet & save claim"
          >
            <Download className="w-4 h-4" />
            <span>{isGeneratingPdf ? 'Generating...' : 'Download'}</span>
          </button>
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        key={previewPdfUrl || 'preview_modal'}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfUrl={previewPdfUrl}
        filename={previewFilename}
        pdfBlob={previewPdfBlob}
        onSaveClaim={handleSaveClaim}
        isSaved={claimSavedSuccess}
        onRefresh={executePreviewPdf}
        isRefreshing={isGeneratingPdf}
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
          ...rows
            .filter(r => r.isHolidayOverride && (r.startTime || r.endTime || r.totalWorkMinutes > 0))
            .map(r => ({
              label: `Holiday Overridden (${r.date})`,
              value: `${r.totalFormatted || '00:00'} OT + Day's Pay`,
              showCaution: true,
            })),
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
          ...rows
            .filter(r => r.isHolidayOverride && (r.startTime || r.endTime || r.totalWorkMinutes > 0))
            .map(r => ({
              label: `Holiday Overridden (${r.date})`,
              value: `${r.totalFormatted || '00:00'} OT + Day's Pay`,
              showCaution: true,
            })),
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
