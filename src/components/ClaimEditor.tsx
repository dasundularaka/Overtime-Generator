import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Loader2,
  Tag,
  SlidersHorizontal,
  Cloud,
  CloudOff,
  LayoutGrid,
  Table as TableIcon,
  CalendarOff,
  Briefcase,
  Eraser,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';
import { setOtaUnsavedWork } from '../services/otaUpdateService';
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
  OT_TEMPLATE_ID,
  OP_TEMPLATE_ID,
  resolveTemplateForClaimType,
  getClaimTypeFormMeta,
} from '../utils/defaultTemplate';
import {
  calculateOutOfPocketDuration,
  summarizeOutOfPocketRows,
} from '../utils/outOfPocketCalculations';
import {
  getActiveTemplate,
  getSettings,
  saveSettings,
  saveClaim,
  saveDraftClaim,
  clearDraftClaim,
  deleteClaim,
  getClaims,
} from '../utils/storage';
import { recordAuditLog } from '../utils/auditLogger';
import { generateOvertimePdf, printPdfDocument } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { ConfirmationModal } from './ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import { subscribeToTemplates } from '../services/templateService';
import { subscribeToHolidays, DEFAULT_ANNUAL_HOLIDAYS } from '../services/holidayService';
import {
  fetchRoleRatesFromFirestore,
  subscribeToRoleRates,
  getLocalRoleRates,
  DEFAULT_ROLE_RATES,
} from '../utils/branchRoleManager';
import { ScrollableTimePicker, parse24To12, format12To24 } from './ScrollableTimePicker';

function toSafeStr(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  return fallback;
}

function toSafeRate(val: unknown): number | '' {
  if (val === '' || val === null || val === undefined) return '';
  const num = Number(val);
  return Number.isFinite(num) ? num : '';
}

function getPreviousCalendarMonth(refDate: Date = new Date()): { month: string; monthIndex: number; year: number } {
  const prev = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
  const idx = prev.getMonth();
  return {
    month: MONTH_NAMES[idx],
    monthIndex: idx,
    year: prev.getFullYear(),
  };
}

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
  const { currentUser, userProfile, isAdmin, isSuperAdmin } = useAuth();
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

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [cardFilter, setCardFilter] = useState<'all' | 'claimed' | 'weekdays' | 'nonworking' | 'leaves' | 'issues'>('all');
  const [showRatesPanel, setShowRatesPanel] = useState<boolean>(true);
  // Only reveal visual issue banners/rings if user triggers Preview, Download, or Submit
  const [showValidationAttention, setShowValidationAttention] = useState(false);
  const [highlightedErrorRowId, setHighlightedErrorRowId] = useState<string | null>(null);

  // Horizontal carousel & smooth ease-out scroll state
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimFrameRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const dragScrollRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);
  const [activeCarouselIdx, setActiveCarouselIdx] = useState<number>(0);

  // Smart auto-advance tracking when a date card is completed (Time In + Time Out + Reason)
  const openTimePickerCountRef = useRef<number>(0);
  const pendingAutoAdvanceRowIdRef = useRef<string | null>(null);
  const pendingReasonBlurAdvanceRef = useRef<string | null>(null);
  const reasonIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCompleteRowIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedCompleteMapRef = useRef<boolean>(false);
  const lastEditedMetaRef = useRef<{ rowId: string; field: string } | null>(null);

  // Refs for smooth auto-scrolling & focusing on validation errors
  const employeeHeaderRef = useRef<HTMLDivElement | null>(null);
  const timesheetSectionRef = useRef<HTMLDivElement | null>(null);
  const validationBannerRef = useRef<HTMLDivElement | null>(null);
  const rowElementRefs = useRef<Record<string, HTMLElement | null>>({});
  const reasonInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dateInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Clean up any active animation frames / timers on unmount
  useEffect(() => {
    return () => {
      if (scrollAnimFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimFrameRef.current);
      }
      if (reasonIdleTimerRef.current) {
        clearTimeout(reasonIdleTimerRef.current);
      }
    };
  }, []);

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
  const [claimType, setClaimType] = useState<ClaimType>(
    initialClaim?.claimType === 'OP' || userProfile?.claimType === 'OP' ? 'OP' : 'OT'
  );
  const [maxOtLimitHours, setMaxOtLimitHours] = useState<number>(2.0);
  const [userShiftStartTime, setUserShiftStartTime] = useState<string>(GENERAL_SHIFT_START);
  const [userShiftEndTime, setUserShiftEndTime] = useState<string>(GENERAL_SHIFT_END);

  // Strictly enforce Claim Type -> Official Template mapping (no cross-template mixing)
  const effectiveClaimType: ClaimType = claimType === 'OP' ? 'OP' : 'OT';
  const isOpClaim = effectiveClaimType === 'OP';
  const claimFormMeta = useMemo(
    () => getClaimTypeFormMeta(effectiveClaimType),
    [effectiveClaimType]
  );

  // Automatically resolve the exact template assigned to the Claim Type
  const activeTemplate = useMemo(
    () => resolveTemplateForClaimType(effectiveClaimType, availableTemplates),
    [effectiveClaimType, availableTemplates]
  );

  useEffect(() => {
    const resolvedId = activeTemplate?.id || (isOpClaim ? OP_TEMPLATE_ID : OT_TEMPLATE_ID);
    if (selectedTemplateId !== resolvedId) {
      setSelectedTemplateId(resolvedId);
    }
  }, [activeTemplate?.id, isOpClaim, selectedTemplateId]);

  const defaultPeriod = getPreviousCalendarMonth();
  const initialValidMonth = initialClaim?.month && MONTH_NAMES.includes(initialClaim.month)
    ? initialClaim.month
    : defaultPeriod.month;
  const initialValidYear =
    typeof initialClaim?.year === 'number' && Number.isFinite(initialClaim.year) && initialClaim.year >= 1900 && initialClaim.year <= 2100
      ? initialClaim.year
      : defaultPeriod.year;

  const [claimMonth, setClaimMonth] = useState<string>(initialValidMonth);
  const [claimYear, setClaimYear] = useState<number>(initialValidYear);
  const [claimDate, setClaimDate] = useState<string>(
    toSafeStr(initialClaim?.claimDate) || new Date().toISOString().split('T')[0]
  );

  // Rates & Payment State
  const [totalRemuneration, setTotalRemuneration] = useState<number | ''>(
    toSafeRate(initialClaim?.totalRemuneration)
  );
  const [hourlyRate, setHourlyRate] = useState<number | ''>(
    toSafeRate(initialClaim?.hourlyRate)
  );
  const [daysPay, setDaysPay] = useState<number | ''>(
    toSafeRate(initialClaim?.daysPay)
  );
  const [hourlyRateNonWorkingDays, setHourlyRateNonWorkingDays] = useState<number | ''>(
    toSafeRate(initialClaim?.hourlyRateNonWorkingDays)
  );
  const [otPaymentDueB, setOtPaymentDueB] = useState<number | ''>(
    toSafeRate(initialClaim?.otPaymentDueB)
  );
  const [isSpecialAssignedOt, setIsSpecialAssignedOt] = useState<boolean>(
    Array.isArray(initialClaim?.rows) ? initialClaim.rows.some(r => Boolean(r?.isSpecialAssignment)) : false
  );
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmSaveClaimOpen, setIsConfirmSaveClaimOpen] = useState(false);
  const [isSavingClaim, setIsSavingClaim] = useState(false);

  // Active Draft & Auto-Save State
  const [activeClaimId, setActiveClaimId] = useState<string>(toSafeStr(initialClaim?.id));
  const [activeClaimNumber, setActiveClaimNumber] = useState<string>(toSafeStr(initialClaim?.claimNumber));
  const [autoSaveDraftEnabled, setAutoSaveDraftEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ot_autosave_draft_enabled');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [draftToastMessage, setDraftToastMessage] = useState<string | null>(null);

  // Default Reasons State (Weekdays Mon-Fri, Saturdays, Other Holidays)
  const [defaultWeekdayReason, setDefaultWeekdayReason] = useState<string>(() => {
    return toSafeStr(userProfile?.defaultWeekdayReason ?? settings.defaultWeekdayReason, '');
  });
  const [defaultSaturdayReason, setDefaultSaturdayReason] = useState<string>(() => {
    return toSafeStr(userProfile?.defaultSaturdayReason ?? settings.defaultSaturdayReason, 'Saturday Duty');
  });
  const [defaultHolidayReason, setDefaultHolidayReason] = useState<string>(() => {
    return toSafeStr(userProfile?.defaultHolidayReason ?? settings.defaultHolidayReason, '');
  });
  const [isDefaultReasonsModalOpen, setIsDefaultReasonsModalOpen] = useState<boolean>(false);
  const [tempWeekdayReason, setTempWeekdayReason] = useState<string>('');
  const [tempSaturdayReason, setTempSaturdayReason] = useState<string>('');
  const [tempHolidayReason, setTempHolidayReason] = useState<string>('');
  const [reasonsSavedSuccess, setReasonsSavedSuccess] = useState<boolean>(false);

  const handleOpenDefaultReasonsModal = () => {
    setTempWeekdayReason(toSafeStr(defaultWeekdayReason));
    setTempSaturdayReason(toSafeStr(defaultSaturdayReason));
    setTempHolidayReason(toSafeStr(defaultHolidayReason));
    setIsDefaultReasonsModalOpen(true);
  };

  const handleSaveAndApplyDefaultReasons = async (applyScope?: 'empty' | 'all') => {
    markUserModified();
    const finalWeekday = toSafeStr(tempWeekdayReason).trim();
    const finalSaturday = toSafeStr(tempSaturdayReason).trim();
    const finalHoliday = toSafeStr(tempHolidayReason).trim();

    setDefaultWeekdayReason(finalWeekday);
    setDefaultSaturdayReason(finalSaturday);
    setDefaultHolidayReason(finalHoliday);

    // 1. Save AppSettings to local storage
    const updatedSettings = {
      ...settings,
      defaultWeekdayReason: finalWeekday,
      defaultSaturdayReason: finalSaturday,
      defaultHolidayReason: finalHoliday,
    };
    saveSettings(updatedSettings);

    // 2. Save to Firestore user profile if authenticated
    const targetUid = selectedUserId || userProfile?.id || currentUser?.uid;
    if (targetUid) {
      try {
        await updateDoc(doc(db, 'users', targetUid), {
          defaultWeekdayReason: finalWeekday,
          defaultSaturdayReason: finalSaturday,
          defaultHolidayReason: finalHoliday,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Failed to save default reasons in profile:', err);
      }
    }

    // 3. Apply to current sheet rows
    if (applyScope) {
      setRows(prevRows =>
        prevRows.map(r => {
          const isHol = r.isHoliday === false ? false : (!!r.isHoliday || holidayMap.has(r.date) || r.dayOfWeek === 'Sun');
          const isSat = r.dayOfWeek === 'Sat';

          const computedReason = isHol
            ? (finalHoliday ? finalHoliday : (r.holidayName || (r.dayOfWeek === 'Sun' ? 'Sunday' : 'Holiday')))
            : (isSat
                ? (finalSaturday ? finalSaturday : 'Saturday Duty')
                : finalWeekday);

          if (applyScope === 'all') {
            return { ...r, reason: computedReason };
          } else {
            if (!r.reason || r.reason.trim() === '') {
              return { ...r, reason: computedReason };
            }
            return r;
          }
        })
      );
    }

    setReasonsSavedSuccess(true);
    setTimeout(() => {
      setReasonsSavedSuccess(false);
      setIsDefaultReasonsModalOpen(false);
    }, 1100);
  };

  const isSubmittedRef = useRef<boolean>(false);
  const isInitialMountRef = useRef<boolean>(true);
  const lastSavedHashRef = useRef<string>('');
  const initializedClaimKeyRef = useRef<string | null>(null);

  // User Modification Tracking: Ensure NO draft is created simply by opening a new claim.
  // Draft is ONLY saved when the user actively changes ANY letter, time, field, or row.
  const [hasUserModified, setHasUserModified] = useState<boolean>(false);
  const hasUserModifiedRef = useRef<boolean>(false);

  const markUserModified = () => {
    if (!hasUserModifiedRef.current) {
      hasUserModifiedRef.current = true;
      setHasUserModified(true);
    }
    setHasUnsavedChanges(true);
  };

  // Prevent automatic OTA swap while user has unsaved edits in the timesheet
  useEffect(() => {
    setOtaUnsavedWork(hasUnsavedChanges);
    return () => {
      setOtaUnsavedWork(false);
    };
  }, [hasUnsavedChanges]);

  const handleToggleAutoSave = (enabled: boolean) => {
    setAutoSaveDraftEnabled(enabled);
    try {
      localStorage.setItem('ot_autosave_draft_enabled', String(enabled));
    } catch {}
  };

  // Rows State
  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [otDisplayFormat, setOtDisplayFormat] = useState<'hhmm' | 'decimal'>('hhmm');

  // PDF Preview State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>('');

  useEffect(() => {
    return () => {
      if (previewPdfUrl && previewPdfUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewPdfUrl);
        } catch {}
      }
    };
  }, [previewPdfUrl]);
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

  // Holidays Calendar Sync State - seed immediately from default annual holidays, then replace cleanly when Firestore resolves
  const [calendarHolidays, setCalendarHolidays] = useState<Holiday[]>(() =>
    DEFAULT_ANNUAL_HOLIDAYS.map((h, i) => ({
      ...h,
      id: h.date || `hol_${i}`,
      createdAt: '2026-01-01T00:00:00.000Z',
    }))
  );
  const [holidaysLoaded, setHolidaysLoaded] = useState<boolean>(false);

  // Corporate Role Rates Subscription - initialized immediately from local cache
  const [roleRates, setRoleRates] = useState<RoleRate[]>(getLocalRoleRates());

  // Horizontal scroll indicator state is managed directly on the card carousel track

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
      setHolidaysLoaded(true);
    });
    return () => unsub();
  }, []);

  const holidayMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of calendarHolidays) {
      const dateKey = toSafeStr(h?.date).trim();
      if (dateKey) {
        map.set(dateKey, { ...h, date: dateKey });
      }
    }
    return map;
  }, [calendarHolidays]);

  // Helper: Detect if a row is marked as Leave
  const isRowLeave = (r: OvertimeRow): boolean => Boolean(r.isLeave);

  // Helper: Detect if a row is a holiday (checks Leave, explicit user mark/unmark, Sunday, and synced Calendar holidayMap)
  const isRowHoliday = (r: OvertimeRow): boolean => {
    if (r.isLeave) return false;
    if (r.holidayUnmarkedByUser) return false;
    if (r.holidayMarkedByUser || r.isHoliday === true) return true;
    const cleanDate = toSafeStr(r.date).trim();
    const dow = r.dayOfWeek || getDayOfWeek(cleanDate);
    if (dow === 'Sun') return true;
    return Boolean(cleanDate && holidayMap.has(cleanDate));
  };

  // Helper: Detect other days (Saturdays, Sundays, and public/bank holidays)
  const isOtherDayRow = (r: OvertimeRow): boolean => {
    if (r.isLeave) return false;
    const dow = r.dayOfWeek || getDayOfWeek(r.date);
    return dow === 'Sat' || isRowHoliday(r);
  };

  // Helper: Detect regular weekday working days (Mon-Fri, non-holiday, non-leave)
  const isWeekdayWorkingDay = (r: OvertimeRow): boolean => {
    if (r.isLeave) return false;
    const dow = r.dayOfWeek || getDayOfWeek(r.date);
    return dow !== 'Sat' && !isRowHoliday(r);
  };

  // Pre-calculate date occurrence counts across the entire claim to flag duplicates
  const dateOccurrences = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const dateStr = toSafeStr(r?.date).trim();
      if (dateStr) {
        counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
      }
    }
    return counts;
  }, [rows]);

  // Comprehensive per-row validation and conflict detection for Day Cards & Table
  const getRowValidation = (r: OvertimeRow) => {
    if (r.isLeave) {
      return {
        hasIssue: false,
        hasSameSession: false,
        isMissingTimeOut: false,
        isMissingTimeIn: false,
        isZeroDuration: false,
        isMissingReason: false,
        isDuplicateDate: false,
        isHolidayNotOverridden: false,
        isSatShortHours: false,
        issues: [] as string[],
        primaryIssue: null as string | null,
        friendlyMessage: null as string | null,
        focusTarget: null as 'date' | 'reason' | 'startTime' | 'endTime' | 'holidayOverride' | null,
      };
    }

    const safeStartTime = toSafeStr(r.startTime);
    const safeEndTime = toSafeStr(r.endTime);
    const safeReason = toSafeStr(r.reason);
    const safeDate = toSafeStr(r.date);

    const isHol = isRowHoliday(r);
    const dow = r.dayOfWeek || getDayOfWeek(safeDate);
    const isSat = dow === 'Sat';
    const defaultStart = userShiftStartTime || GENERAL_SHIFT_START;

    const hasStartTime = Boolean(safeStartTime.trim());
    const hasEndTime = Boolean(safeEndTime.trim());
    const hasTimes = hasStartTime || hasEndTime;

    if (isOpClaim) {
      // Form 10610 (OP) isolated row validation — no Form 10756 shift/OT/Saturday-6h rules
      const isMissingTimeOut = hasStartTime && !hasEndTime;
      const isMissingTimeIn = !hasStartTime && hasEndTime;
      const isZeroDuration = Boolean(hasStartTime && hasEndTime && safeStartTime === safeEndTime);
      const hasOpWork = (r.totalWorkMinutes || 0) > 0 || (r.daysPaymentAmount || 0) > 0;
      const isMissingReason = Boolean(
        hasStartTime && hasEndTime && hasOpWork && !safeReason.trim()
      );
      const isDuplicateDate = Boolean(safeDate && (dateOccurrences.get(safeDate) || 0) > 1);
      const isHolidayNotOverridden = Boolean(isHol && !r.isHolidayOverride && hasTimes);

      const issues: string[] = [];
      let friendlyMessage: string | null = null;
      let focusTarget: 'date' | 'reason' | 'startTime' | 'endTime' | 'holidayOverride' | null = null;

      if (isMissingTimeOut) {
        issues.push('Missing Time Out');
        friendlyMessage = 'Time In is entered without a Time Out. Add Time Out, clear the entry, or mark Leave.';
        focusTarget = 'endTime';
      }
      if (isMissingTimeIn) {
        issues.push('Missing Time In');
        if (!friendlyMessage) {
          friendlyMessage = 'Time Out is entered without a Time In. Select Time In or clear the entry.';
          focusTarget = 'startTime';
        }
      }
      if (isZeroDuration) {
        issues.push('Zero Duration');
        if (!friendlyMessage) {
          friendlyMessage = `Time In and Time Out are identical (${r.startTime}). Update one time or clear the entry.`;
          focusTarget = 'endTime';
        }
      }
      if (isMissingReason) {
        issues.push('Duties Required');
        if (!friendlyMessage) {
          friendlyMessage = 'Please describe the duties / nature of work for this entry.';
          focusTarget = 'reason';
        }
      }
      if (isDuplicateDate) {
        issues.push('Duplicate Date');
        if (!friendlyMessage) {
          friendlyMessage = `Date ${r.date} appears more than once. Change the date or remove the duplicate.`;
          focusTarget = 'date';
        }
      }
      if (isHolidayNotOverridden) {
        issues.push('Holiday Work Disabled');
        if (!friendlyMessage) {
          friendlyMessage = 'Enable "I worked on this holiday" to log work on this holiday, or clear the times.';
          focusTarget = 'holidayOverride';
        }
      }

      return {
        hasIssue: issues.length > 0,
        hasSameSession: false,
        isMissingTimeOut,
        isMissingTimeIn,
        isZeroDuration,
        isMissingReason,
        isDuplicateDate,
        isHolidayNotOverridden,
        isSatShortHours: false,
        issues,
        primaryIssue: issues[0] || null,
        friendlyMessage,
        focusTarget,
      };
    }

    const inPeriod = hasStartTime ? parse24To12(safeStartTime).period : null;
    const outPeriod = hasEndTime ? parse24To12(safeEndTime).period : null;
    const hasSameSession = Boolean(hasStartTime && hasEndTime && inPeriod === outPeriod);

    // Untouched weekday rows carry the default shift startTime ('08:00') with blank endTime.
    // Only flag Missing Time Out when the user actively entered a custom startTime, or on Saturday / Holiday OT.
    const hasEnteredStartForOt = hasStartTime && (isSat || (isHol && !!r.isHolidayOverride) || safeStartTime !== defaultStart);
    const isMissingTimeOut = hasEnteredStartForOt && !hasEndTime;
    const isMissingTimeIn = !hasStartTime && hasEndTime;
    const isZeroDuration = Boolean(hasStartTime && hasEndTime && safeStartTime === safeEndTime);

    const hasClaimableResult =
      (r.totalMinutes || 0) > 0 ||
      (!!r.isHolidayOverride && (r.totalWorkMinutes || 0) > 0) ||
      (isSat && (r.totalWorkMinutes || 0) >= 360);

    const isMissingReason = Boolean(
      hasStartTime && hasEndTime && hasClaimableResult && !safeReason.trim()
    );
    const isDuplicateDate = Boolean(safeDate && (dateOccurrences.get(safeDate) || 0) > 1);
    const isHolidayNotOverridden = Boolean(isHol && !r.isHolidayOverride && hasTimes);
    const isSatShortHours = Boolean(isSat && !hasStartTime && !hasEndTime && (r.totalWorkMinutes || 0) > 0 && (r.totalWorkMinutes || 0) < 360);

    const issues: string[] = [];
    let friendlyMessage: string | null = null;
    let focusTarget: 'date' | 'reason' | 'startTime' | 'endTime' | 'holidayOverride' | null = null;

    if (hasSameSession) {
      issues.push(`Same Session (${inPeriod})`);
      friendlyMessage = `Time In and Time Out are both set to ${inPeriod}. Switch Time Out to ${inPeriod === 'AM' ? 'PM' : 'AM'}.`;
      focusTarget = 'endTime';
    }
    if (isMissingTimeOut) {
      issues.push('Missing Time Out');
      if (!friendlyMessage) {
        friendlyMessage = 'Time In is entered without a Time Out. Add Time Out, clear the entry, or mark Leave.';
        focusTarget = 'endTime';
      }
    }
    if (isMissingTimeIn) {
      issues.push('Missing Time In');
      if (!friendlyMessage) {
        friendlyMessage = 'Time Out is entered without a Time In. Select Time In or clear the entry.';
        focusTarget = 'startTime';
      }
    }
    if (isZeroDuration) {
      issues.push('Zero Duration');
      if (!friendlyMessage) {
        friendlyMessage = `Time In and Time Out are identical (${r.startTime}). Update one time or clear the entry.`;
        focusTarget = 'endTime';
      }
    }
    if (isMissingReason) {
      issues.push('Duties Required');
      if (!friendlyMessage) {
        friendlyMessage = 'Please describe the duties / nature of work for this OT claim.';
        focusTarget = 'reason';
      }
    }
    if (isDuplicateDate) {
      issues.push('Duplicate Date');
      if (!friendlyMessage) {
        friendlyMessage = `Date ${r.date} appears more than once. Change the date or remove the duplicate.`;
        focusTarget = 'date';
      }
    }
    if (isHolidayNotOverridden) {
      issues.push('Holiday OT Disabled');
      if (!friendlyMessage) {
        friendlyMessage = 'Enable "I worked on this holiday" to claim Holiday OT, or clear the times.';
        focusTarget = 'holidayOverride';
      }
    }
    if (isSatShortHours) {
      issues.push("Saturday < 6h");
      if (!friendlyMessage) {
        friendlyMessage = "Saturday full Day's Pay requires at least 6 hours, or enter Time In & Time Out for hourly OT.";
        focusTarget = 'endTime';
      }
    }

    return {
      hasIssue: issues.length > 0,
      hasSameSession,
      isMissingTimeOut,
      isMissingTimeIn,
      isZeroDuration,
      isMissingReason,
      isDuplicateDate,
      isHolidayNotOverridden,
      isSatShortHours,
      issues,
      primaryIssue: issues[0] || null,
      friendlyMessage,
      focusTarget,
    };
  };

  const rowsWithIssues = useMemo(() => {
    return rows.filter(r => getRowValidation(r).hasIssue);
  }, [rows, holidayMap, dateOccurrences, userShiftStartTime, isOpClaim]);

  const rowsWithIssuesCount = rowsWithIssues.length;

  // Clear highlight automatically once user fixes all issues
  useEffect(() => {
    if (highlightedErrorRowId) {
      const targetRow = rows.find(r => r.id === highlightedErrorRowId);
      if (!targetRow || !getRowValidation(targetRow).hasIssue) {
        setHighlightedErrorRowId(null);
        if (rowsWithIssuesCount === 0 && validationError) {
          setValidationError(null);
        }
      }
    }
  }, [rows, highlightedErrorRowId, rowsWithIssuesCount]);

  // Fetch users if admin (Admins only see users in their same branch; Super Admin sees all)
  useEffect(() => {
    if (isAdmin) {
      getDocs(collection(db, 'users'))
        .then(snap => {
          const list: any[] = [];
          snap.forEach(d => list.push(d.data()));
          const filtered = isSuperAdmin
            ? list
            : list.filter(u => {
                if (u.id === currentUser?.uid) return true;
                const adminBranch = (userProfile?.branch || '').toLowerCase().trim();
                const userBranch = (u.branch || '').toLowerCase().trim();
                return adminBranch && userBranch && adminBranch === userBranch;
              });
          setAllUsers(filtered);
        })
        .catch(err => {
          console.warn('Could not fetch all users', err);
        });
    }
  }, [isAdmin, isSuperAdmin, userProfile?.branch, currentUser?.uid]);

  // Check if admin is attempting to view or prepare a claim from another branch
  const isBranchForbidden = useMemo(() => {
    if (!initialClaim) return false;
    if (isSuperAdmin) return false;
    if (!isAdmin) {
      return initialClaim.userId !== currentUser?.uid;
    }
    // For regular admins: can view/edit own claims OR claims of staff from same branch
    if (initialClaim.userId === currentUser?.uid) return false;
    const adminBranch = (userProfile?.branch || '').toLowerCase().trim();
    const claimBranch = (initialClaim.branch || '').toLowerCase().trim();
    if (!adminBranch || !claimBranch) return false;
    return adminBranch !== claimBranch;
  }, [initialClaim, isSuperAdmin, isAdmin, currentUser?.uid, userProfile?.branch]);

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
      const targetRoleName = targetProfile.roleName.toLowerCase().trim();
      const byRoleName = roleRates.find(r => (r.name || '').toLowerCase().trim() === targetRoleName);
      if (byRoleName) return byRoleName;
    }
    const title = (targetProfile?.designation || designation || '').toLowerCase().trim();
    if (title) {
      const byDesig = roleRates.find(r => (r.name || '').toLowerCase().trim() === title);
      if (byDesig) return byDesig;
      const bySub = roleRates.find(r => {
        const rn = (r.name || '').toLowerCase().trim();
        return (rn.length > 2 && title.includes(rn)) || (title.length > 2 && rn.includes(title));
      });
      if (bySub) return bySub;
    }
    const fallbackDef = DEFAULT_ROLE_RATES.find(dr => {
      const drn = dr.name.toLowerCase().trim();
      return dr.id === targetProfile?.roleId || (title && (drn === title || title.includes(drn) || drn.includes(title)));
    });
    if (fallbackDef) {
      const liveRole = roleRates.find(r => r.id === fallbackDef.id || (r.name && r.name.toLowerCase().trim() === fallbackDef.name.toLowerCase().trim()));
      return liveRole || fallbackDef;
    }
    return null;
  }, [targetProfile, designation, roleRates]);

  const isUserExplicitlyLocked = Boolean(targetProfile ? targetProfile.isRatesLocked : userProfile?.isRatesLocked);

  const normalizeRoleKey = (val?: string | null) => (val || '').toLowerCase().trim();
  const targetRoleId = targetProfile?.roleId;
  const targetRoleNameKey = normalizeRoleKey(targetProfile?.roleName);
  const targetDesignationKey = normalizeRoleKey(targetProfile?.designation);
  const formDesignationKey = normalizeRoleKey(designation);
  const relevantRoleNameKey = normalizeRoleKey(userRelevantRole?.name);

  const isRoleLocked = Boolean(
    userRelevantRole?.isRatesLocked ||
    (targetRoleId && roleRates.some(r => r.id === targetRoleId && r.isRatesLocked)) ||
    (relevantRoleNameKey && roleRates.some(r => normalizeRoleKey(r.name) === relevantRoleNameKey && r.isRatesLocked)) ||
    (targetRoleNameKey && roleRates.some(r => normalizeRoleKey(r.name) === targetRoleNameKey && r.isRatesLocked)) ||
    (targetDesignationKey && roleRates.some(r => normalizeRoleKey(r.name) === targetDesignationKey && r.isRatesLocked)) ||
    (formDesignationKey && roleRates.some(r => {
      const rn = normalizeRoleKey(r.name);
      return Boolean(
        r.isRatesLocked &&
        (rn === formDesignationKey ||
          (rn.length > 2 && formDesignationKey.includes(rn)) ||
          (formDesignationKey.length > 2 && rn.includes(formDesignationKey)))
      );
    }))
  );

  const isTargetUserRatesLocked = isUserExplicitlyLocked || isRoleLocked;

  // Locked-rate designations (and locked user profiles) can ONLY claim Day's Pay on non-working days
  // including Saturdays, Sundays, and Holidays — they CANNOT claim hourly OT on non-working days.
  const isDaysPayOnlyNonWorking = !isOpClaim && isTargetUserRatesLocked;

  // Visible rows for user-friendly Card View filtering
  const visibleCardRows = useMemo(() => {
    return rows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        if (cardFilter === 'issues') {
          return getRowValidation(row).hasIssue;
        }
        if (cardFilter === 'leaves') {
          return Boolean(row.isLeave);
        }
        if (cardFilter === 'claimed') {
          if (isOpClaim) {
            return !row.isLeave && !(isRowHoliday(row) && !row.isHolidayOverride) && ((row.totalWorkMinutes || 0) > 0 || (row.daysPaymentAmount || 0) > 0);
          }
          const isSatRow = row.dayOfWeek === 'Sat' || getDayOfWeek(row.date) === 'Sat';
          const isHolRow = isRowHoliday(row);
          const isOtherRow = isSatRow || isHolRow;
          const isQualifiedSatDayPay = isSatRow && (!!row.isDaysPayment || isDaysPayOnlyNonWorking) && (row.totalWorkMinutes || 0) >= 360;
          const isQualifiedHolDayPay = isHolRow && !!row.isHolidayOverride && (row.totalWorkMinutes || 0) > 0;
          const hasValidOtRow = !(isDaysPayOnlyNonWorking && isOtherRow) && (row.totalMinutes || 0) > 0;
          return !row.isLeave && !(isHolRow && !row.isHolidayOverride) && (hasValidOtRow || isQualifiedSatDayPay || isQualifiedHolDayPay);
        }
        if (cardFilter === 'weekdays') {
          return isWeekdayWorkingDay(row);
        }
        if (cardFilter === 'nonworking') {
          return isOtherDayRow(row);
        }
        return true;
      });
  }, [rows, cardFilter, holidayMap, dateOccurrences, userShiftStartTime, isOpClaim, isDaysPayOnlyNonWorking]);

  // =========================================================================
  // HORIZONTAL CAROUSEL SCROLL ENGINE (Ease-out smooth scroll + swipe + arrows)
  // =========================================================================
  const updateHorizontalScrollState = () => {
    const container = horizontalScrollRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);

    if (visibleCardRows.length > 0) {
      const containerRect = container.getBoundingClientRect();
      const viewportCenter = containerRect.left + containerRect.width / 2;
      let closestIdx = 0;
      let minDelta = Infinity;
      visibleCardRows.forEach(({ row }, idx) => {
        const el = rowElementRefs.current[row.id];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const delta = Math.abs(cardCenter - viewportCenter);
        if (delta < minDelta) {
          minDelta = delta;
          closestIdx = idx;
        }
      });
      setActiveCarouselIdx(closestIdx);
    } else {
      setActiveCarouselIdx(0);
    }
  };

  const cancelHorizontalAnimation = () => {
    if (scrollAnimFrameRef.current !== null) {
      cancelAnimationFrame(scrollAnimFrameRef.current);
      scrollAnimFrameRef.current = null;
    }
    isProgrammaticScrollRef.current = false;
    if (horizontalScrollRef.current) {
      horizontalScrollRef.current.style.scrollSnapType = '';
    }
  };

  const smoothScrollHorizontalTo = (targetLeft: number, durationMs: number = 540, onComplete?: () => void) => {
    const container = horizontalScrollRef.current;
    if (!container) return;

    cancelHorizontalAnimation();

    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const clampedTarget = Math.max(0, Math.min(maxScroll, targetLeft));
    const startLeft = container.scrollLeft;
    const distance = clampedTarget - startLeft;

    if (Math.abs(distance) < 2) {
      container.scrollLeft = clampedTarget;
      updateHorizontalScrollState();
      onComplete?.();
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      container.scrollLeft = clampedTarget;
      updateHorizontalScrollState();
      onComplete?.();
      return;
    }

    isProgrammaticScrollRef.current = true;
    container.style.scrollSnapType = 'none';

    const startTime = performance.now();
    // Smooth ease-out cubic deceleration curve
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      if (!isProgrammaticScrollRef.current || !container.isConnected) {
        isProgrammaticScrollRef.current = false;
        scrollAnimFrameRef.current = null;
        return;
      }
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(progress);
      container.scrollLeft = startLeft + distance * eased;

      if (progress < 1) {
        scrollAnimFrameRef.current = requestAnimationFrame(step);
      } else {
        container.scrollLeft = clampedTarget;
        isProgrammaticScrollRef.current = false;
        scrollAnimFrameRef.current = null;
        container.style.scrollSnapType = '';
        updateHorizontalScrollState();
        onComplete?.();
      }
    };

    scrollAnimFrameRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    return () => {
      if (scrollAnimFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimFrameRef.current);
        scrollAnimFrameRef.current = null;
      }
      isProgrammaticScrollRef.current = false;
    };
  }, []);

  const scrollToCardByRowId = (rowId: string, durationMs: number = 540, onComplete?: () => void) => {
    const container = horizontalScrollRef.current;
    const cardEl = rowElementRefs.current[rowId];
    if (!container || !cardEl) {
      onComplete?.();
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const cardOffsetInTrack = cardRect.left - containerRect.left + container.scrollLeft;
    const centeredLeft = cardOffsetInTrack - (container.clientWidth - cardEl.offsetWidth) / 2;
    smoothScrollHorizontalTo(centeredLeft, durationMs, onComplete);
  };

  const scrollCarouselByStep = (direction: 'left' | 'right') => {
    const container = horizontalScrollRef.current;
    if (!container || visibleCardRows.length === 0) return;

    const isNarrow = container.clientWidth < 768;
    if (isNarrow) {
      const nextIdx = Math.max(
        0,
        Math.min(visibleCardRows.length - 1, activeCarouselIdx + (direction === 'right' ? 1 : -1))
      );
      const targetRow = visibleCardRows[nextIdx]?.row;
      if (targetRow) {
        scrollToCardByRowId(targetRow.id, 460);
        return;
      }
    }

    const firstEl = rowElementRefs.current[visibleCardRows[0].row.id];
    const cardStep = firstEl ? firstEl.offsetWidth + 16 : 360;
    const stepDistance = Math.max(cardStep, Math.floor(container.clientWidth * 0.72));
    const targetLeft = container.scrollLeft + (direction === 'right' ? stepDistance : -stepDistance);
    smoothScrollHorizontalTo(targetLeft, 480);
  };

  const autoScrollToNextCard = (completedRowId: string) => {
    if (viewMode !== 'cards') return;
    const currentIdx = visibleCardRows.findIndex(({ row }) => row.id === completedRowId);
    if (currentIdx === -1 || currentIdx >= visibleCardRows.length - 1) return;
    const nextRow = visibleCardRows[currentIdx + 1]?.row;
    if (!nextRow) return;
    scrollToCardByRowId(nextRow.id, 580);
  };

  // Sync horizontal scroll arrows & active card indicator on resize/filter/row changes
  useEffect(() => {
    if (viewMode !== 'cards') return;
    const timer = setTimeout(() => {
      updateHorizontalScrollState();
    }, 60);
    const handleResize = () => updateHorizontalScrollState();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [viewMode, visibleCardRows.length, cardFilter, rows]);

  // Desktop mouse drag-to-scroll handlers on empty areas of the horizontal track
  const handleCarouselMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, button, select, textarea, label, a, [role="button"]')) {
      return;
    }
    const container = horizontalScrollRef.current;
    if (!container) return;
    cancelHorizontalAnimation();
    dragScrollRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: container.scrollLeft,
      moved: false,
    };
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragScrollRef.current.active) return;
      const container = horizontalScrollRef.current;
      if (!container) return;
      const deltaX = e.clientX - dragScrollRef.current.startX;
      if (Math.abs(deltaX) > 4) {
        dragScrollRef.current.moved = true;
      }
      container.scrollLeft = dragScrollRef.current.startScrollLeft - deltaX;
    };

    const handleWindowMouseUp = () => {
      if (!dragScrollRef.current.active) return;
      dragScrollRef.current.active = false;
      updateHorizontalScrollState();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [visibleCardRows]);

  // Helper: Detect if a date card has complete data (Time In, Time Out, Reason, and zero errors)
  const isRowCompleteWithData = (r: OvertimeRow): boolean => {
    if (!r || r.isLeave) return false;
    const isHol = isRowHoliday(r);
    if (isHol && !r.isHolidayOverride) return false;
    const hasIn = Boolean(toSafeStr(r.startTime).trim());
    const hasOut = Boolean(toSafeStr(r.endTime).trim());
    const hasReason = Boolean(toSafeStr(r.reason).trim());
    if (!hasIn || !hasOut || !hasReason) return false;
    return !getRowValidation(r).hasIssue;
  };

  // Auto-scroll smoothly (ease-out) to next date card whenever a date transitions to complete (In + Out + Reason)
  useEffect(() => {
    const nextCompleteSet = new Set<string>();
    for (const r of rows) {
      if (isRowCompleteWithData(r)) {
        nextCompleteSet.add(r.id);
      }
    }

    if (!hasInitializedCompleteMapRef.current || !hasUserModifiedRef.current) {
      prevCompleteRowIdsRef.current = nextCompleteSet;
      hasInitializedCompleteMapRef.current = true;
      return;
    }

    const lastEdit = lastEditedMetaRef.current;
    if (viewMode === 'cards' && lastEdit) {
      const { rowId, field } = lastEdit;
      const wasComplete = prevCompleteRowIdsRef.current.has(rowId);
      const isNowComplete = nextCompleteSet.has(rowId);

      if (!wasComplete && isNowComplete) {
        if (reasonIdleTimerRef.current) {
          clearTimeout(reasonIdleTimerRef.current);
          reasonIdleTimerRef.current = null;
        }

        if (openTimePickerCountRef.current > 0) {
          // Wait until user finishes & closes the Time Picker modal
          pendingAutoAdvanceRowIdRef.current = rowId;
        } else if (
          field === 'reason' &&
          typeof document !== 'undefined' &&
          document.activeElement === reasonInputRefs.current[rowId]
        ) {
          // Wait for Enter / blur or typing pause so we don't jump mid-word
          pendingReasonBlurAdvanceRef.current = rowId;
          reasonIdleTimerRef.current = setTimeout(() => {
            pendingReasonBlurAdvanceRef.current = null;
            reasonIdleTimerRef.current = null;
            const inputEl = reasonInputRefs.current[rowId];
            if (inputEl && document.activeElement === inputEl) {
              inputEl.blur();
            }
            autoScrollToNextCard(rowId);
          }, 1450);
        } else {
          setTimeout(() => {
            autoScrollToNextCard(rowId);
          }, 220);
        }
      } else if (!isNowComplete) {
        if (pendingAutoAdvanceRowIdRef.current === rowId) {
          pendingAutoAdvanceRowIdRef.current = null;
        }
        if (pendingReasonBlurAdvanceRef.current === rowId) {
          pendingReasonBlurAdvanceRef.current = null;
        }
      }
    }

    prevCompleteRowIdsRef.current = nextCompleteSet;
  }, [rows, viewMode, visibleCardRows]);

  const handleTimePickerOpenChange = (rowId: string, isOpen: boolean) => {
    if (isOpen) {
      openTimePickerCountRef.current += 1;
    } else {
      openTimePickerCountRef.current = Math.max(0, openTimePickerCountRef.current - 1);
      if (openTimePickerCountRef.current === 0 && pendingAutoAdvanceRowIdRef.current === rowId) {
        const targetId = pendingAutoAdvanceRowIdRef.current;
        pendingAutoAdvanceRowIdRef.current = null;
        setTimeout(() => {
          const targetRow = rows.find(r => r.id === targetId);
          if (targetRow && isRowCompleteWithData(targetRow)) {
            autoScrollToNextCard(targetId);
          }
        }, 220);
      }
    }
  };

  // Smooth auto-scroll (vertical + horizontal ease-out) & focus helper for validation errors
  const scrollToErrorTarget = (target: {
    type: 'employeeName' | 'row' | 'timesheet';
    rowId?: string;
    focusField?: 'date' | 'reason' | 'startTime' | 'endTime' | 'holidayOverride' | null;
  }) => {
    if (target.type === 'row' && target.rowId) {
      const targetRowId = target.rowId;
      setHighlightedErrorRowId(targetRowId);
      setTimeout(() => {
        if (viewMode === 'cards') {
          const sectionEl = timesheetSectionRef.current;
          if (sectionEl) {
            sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setTimeout(() => {
            scrollToCardByRowId(targetRowId, 560, () => {
              if (target.focusField === 'reason') {
                reasonInputRefs.current[targetRowId]?.focus({ preventScroll: true });
              } else if (target.focusField === 'date') {
                dateInputRefs.current[targetRowId]?.focus({ preventScroll: true });
              }
            });
          }, 140);
        } else {
          const el = rowElementRefs.current[targetRowId];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            timesheetSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          if (target.focusField === 'reason') {
            reasonInputRefs.current[targetRowId]?.focus({ preventScroll: true });
          } else if (target.focusField === 'date') {
            dateInputRefs.current[targetRowId]?.focus({ preventScroll: true });
          }
        }
      }, 90);
      return;
    }
    if (target.type === 'employeeName') {
      setHighlightedErrorRowId(null);
      setTimeout(() => {
        employeeHeaderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      return;
    }
    setHighlightedErrorRowId(null);
    setTimeout(() => {
      const scrollTarget = validationBannerRef.current || timesheetSectionRef.current;
      scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (viewMode === 'cards' && visibleCardRows.length > 0) {
        const firstWorkRow = visibleCardRows.find(({ row }) => !row.isLeave && !isRowHoliday(row)) || visibleCardRows[0];
        if (firstWorkRow) {
          setTimeout(() => {
            scrollToCardByRowId(firstWorkRow.row.id, 520);
          }, 160);
        }
      }
    }, 80);
  };



  // Standard non-admin users are strictly prevented from editing locked rates
  const isRoleRatesLocked = !isAdmin && isTargetUserRatesLocked;

  // Standard non-admin users CANNOT edit if locked (admins retain override edit capability)
  const canEditRates = isAdmin || !isRoleRatesLocked;

  // Enforce locked rates in form: if locked by admin, standard non-admin users cannot change rates
  // Respect user's own assigned rates first; fall back to corporate role rates if user rates are empty.
  useEffect(() => {
    if (!isAdmin && isRoleRatesLocked) {
      const safeUserHourly = toSafeRate(targetProfile?.hourlyRate);
      const lockedHourly = safeUserHourly !== '' ? safeUserHourly : toSafeRate(userRelevantRole?.hourlyRateWorkingDays);
      if (lockedHourly !== '') {
        setHourlyRate(lockedHourly);
      }

      const safeUserDaysPay = toSafeRate(targetProfile?.daysPay);
      const lockedDaysPay = safeUserDaysPay !== '' ? safeUserDaysPay : toSafeRate(userRelevantRole?.daysPaymentNonWorkingDays);
      if (lockedDaysPay !== '') {
        setDaysPay(lockedDaysPay);
      }

      const safeUserNonWorking = toSafeRate(targetProfile?.hourlyRateNonWorkingDays);
      const lockedNonWorkingHourly = safeUserNonWorking !== '' ? safeUserNonWorking : toSafeRate(userRelevantRole?.hourlyRateNonWorkingDays);
      if (lockedNonWorkingHourly !== '') {
        setHourlyRateNonWorkingDays(lockedNonWorkingHourly);
      }

      const safeRemuneration = toSafeRate(targetProfile?.totalRemuneration);
      if (safeRemuneration !== '') {
        setTotalRemuneration(safeRemuneration);
      }
    }
  }, [isAdmin, isRoleRatesLocked, userRelevantRole, targetProfile]);

  // Sync profile details into form without wiping user-entered rows on async roleRates/allUsers updates
  useEffect(() => {
    const claimKey = initialClaim
      ? `edit:${initialClaim.id || 'unknown'}`
      : `new:${selectedUserId || userProfile?.id || ''}`;
    const isNewContext = initializedClaimKeyRef.current !== claimKey;

    if (initialClaim) {
      if (!isNewContext) return;
      initializedClaimKeyRef.current = claimKey;

      hasUserModifiedRef.current = false;
      setHasUserModified(false);
      setHasUnsavedChanges(false);
      lastSavedHashRef.current = '';
      isSubmittedRef.current = false;

      const safeMonth = initialClaim.month && MONTH_NAMES.includes(initialClaim.month)
        ? initialClaim.month
        : MONTH_NAMES[new Date().getMonth()];
      const safeYear =
        typeof initialClaim.year === 'number' && Number.isFinite(initialClaim.year) && initialClaim.year >= 1900 && initialClaim.year <= 2100
          ? initialClaim.year
          : new Date().getFullYear();

      setSelectedUserId(toSafeStr(initialClaim.userId, currentUser?.uid || ''));
      setEmployeeName(toSafeStr(initialClaim.employeeName));
      setEmployeeNumber(toSafeStr(initialClaim.employeeNumber));
      setDesignation(toSafeStr(initialClaim.designation));
      setBranch(toSafeStr(initialClaim.branch, 'Head Office'));
      setDepartment(toSafeStr(initialClaim.department, 'IT & Infrastructure Operations'));
      setClaimType(initialClaim.claimType || 'OT');
      setClaimMonth(safeMonth);
      setClaimYear(safeYear);
      setClaimDate(toSafeStr(initialClaim.claimDate, new Date().toISOString().split('T')[0]));
      setRows(Array.isArray(initialClaim.rows) ? initialClaim.rows : []);
      setTotalRemuneration(toSafeRate(initialClaim.totalRemuneration));
      setHourlyRate(toSafeRate(initialClaim.hourlyRate));
      setDaysPay(toSafeRate(initialClaim.daysPay));
      setHourlyRateNonWorkingDays(toSafeRate(initialClaim.hourlyRateNonWorkingDays));
      setOtPaymentDueB(toSafeRate(initialClaim.otPaymentDueB));
      setActiveClaimId(toSafeStr(initialClaim.id));
      setActiveClaimNumber(toSafeStr(initialClaim.claimNumber));
      if (initialClaim.status === 'draft') {
        setLastAutoSaveTime(new Date(initialClaim.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      return;
    }

    // If same new-claim user context and user has already started entering data, never overwrite rows or edited rates
    if (!isNewContext && hasUserModifiedRef.current) {
      return;
    }

    if (isNewContext) {
      initializedClaimKeyRef.current = claimKey;
      hasUserModifiedRef.current = false;
      setHasUserModified(false);
      setHasUnsavedChanges(false);
      lastSavedHashRef.current = '';
      isSubmittedRef.current = false;
      setActiveClaimId('');
      setActiveClaimNumber('');
    }

    const nextClaimType: ClaimType = targetProfile?.claimType === 'OP' ? 'OP' : 'OT';

    if (targetProfile) {
      setEmployeeName(toSafeStr(targetProfile.name));
      setEmployeeNumber(toSafeStr(targetProfile.employeeNumber));
      setDesignation(toSafeStr(targetProfile.designation));
      setBranch(toSafeStr(targetProfile.branch, 'Head Office'));
      setDepartment(toSafeStr(targetProfile.department, 'IT & Infrastructure Operations'));
      setClaimType(nextClaimType);

      if (nextClaimType === 'OP') {
        // Strictly isolate OP (Form 10610) from Form 10756 OT limits, shift times, and rates
        setIsSpecialAssignedOt(false);
        setTotalRemuneration('');
        setHourlyRate('');
        setDaysPay('');
        setHourlyRateNonWorkingDays('');
        setOtPaymentDueB('');
      } else {
        setMaxOtLimitHours(
          typeof targetProfile.maxOtHoursPerDay === 'number' && Number.isFinite(targetProfile.maxOtHoursPerDay)
            ? targetProfile.maxOtHoursPerDay
            : 2.0
        );
        setUserShiftStartTime(toSafeStr(targetProfile.shiftStartTime, GENERAL_SHIFT_START));
        setUserShiftEndTime(toSafeStr(targetProfile.shiftEndTime, GENERAL_SHIFT_END));

        // Match corporate role rates if user rates are blank or from assigned role
        const targetRoleTitle = toSafeStr(targetProfile.roleName || targetProfile.designation).toLowerCase().trim();
        const matchedRole = targetProfile.roleId
          ? roleRates.find(r => r && r.id === targetProfile.roleId)
          : roleRates.find(r => r && toSafeStr(r.name).toLowerCase().trim() === targetRoleTitle);

        const userHourly = toSafeRate(targetProfile.hourlyRate);
        const finalHourly = userHourly !== '' ? userHourly : toSafeRate(matchedRole?.hourlyRateWorkingDays);

        const userDayPay = toSafeRate(targetProfile.daysPay);
        const finalDayPay = userDayPay !== '' ? userDayPay : toSafeRate(matchedRole?.daysPaymentNonWorkingDays);

        const userNonWorkingHourly = toSafeRate(targetProfile.hourlyRateNonWorkingDays);
        const finalNonWorkingHourly = userNonWorkingHourly !== '' ? userNonWorkingHourly : toSafeRate(matchedRole?.hourlyRateNonWorkingDays);

        setHourlyRate(finalHourly);
        setDaysPay(finalDayPay);
        setHourlyRateNonWorkingDays(finalNonWorkingHourly);
        setTotalRemuneration(toSafeRate(targetProfile.totalRemuneration));
      }
    }

    // Only reset period to Last Month and generate initial clean rows when entering a fresh new claim context
    if (isNewContext) {
      const lastPeriod = getPreviousCalendarMonth();
      setClaimMonth(lastPeriod.month);
      setClaimYear(lastPeriod.year);
      setClaimDate(new Date().toISOString().split('T')[0]);
      setRows(generateFullMonthRows(lastPeriod.month, lastPeriod.year, nextClaimType === 'OP' ? false : isSpecialAssignedOt, nextClaimType));
    }
  }, [initialClaim, userProfile, selectedUserId, allUsers, roleRates]);

  // Generate full month of dates and flag holidays & weekends
  function generateFullMonthRows(
    targetMonth: string,
    targetYear: number,
    specialOt: boolean = isSpecialAssignedOt,
    overrideClaimType?: ClaimType
  ): OvertimeRow[] {
    const forOp = (overrideClaimType || effectiveClaimType) === 'OP';
    const safeYear = Number.isFinite(targetYear) && targetYear >= 1900 && targetYear <= 2100
      ? targetYear
      : getPreviousCalendarMonth().year;
    const monthIndex = MONTH_NAMES.indexOf(targetMonth);
    const validMonth = monthIndex >= 0 ? monthIndex : getPreviousCalendarMonth().monthIndex;
    const daysInMonth = getDaysInMonth(safeYear, validMonth);
    const mStr = String(validMonth + 1).padStart(2, '0');
    const safeHolidayReason = toSafeStr(defaultHolidayReason).trim();
    const safeSaturdayReason = toSafeStr(defaultSaturdayReason).trim();
    const safeWeekdayReason = toSafeStr(defaultWeekdayReason).trim();

    const fullRows: OvertimeRow[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${safeYear}-${mStr}-${dStr}`;
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
        startTime: forOp ? '' : ((isHol || isSat) ? '' : (userShiftStartTime || GENERAL_SHIFT_START)),
        endTime: '',
        breakMinutes: 0,
        isOvernight: false,
        isWeekend: isSat || isSun,
        isHoliday: isHol,
        holidayName: holidayTitle,
        isHolidayOverride: false,
        isSpecialAssignment: forOp ? false : specialOt,
        totalWorkMinutes: 0,
        rawOtMinutes: 0,
        totalMinutes: 0,
        totalFormatted: isHol ? '' : '00:00',
        reason: isHol
          ? (safeHolidayReason || hol?.name || (isSun ? 'Sunday' : 'Holiday'))
          : (isSat
              ? (forOp
                  ? (safeSaturdayReason && safeSaturdayReason !== 'Saturday Duty' ? safeSaturdayReason : '')
                  : (safeSaturdayReason || 'Saturday Duty'))
              : safeWeekdayReason),
      });
    }
    return fullRows;
  }

  // Finds if an uncompleted draft exists for the given user, month, and year.
  // Reuses that draft document so that at most ONE draft per month ever exists!
  const findAndApplyMonthDraft = async (
    targetMonth: string,
    targetYear: number,
    customUid?: string,
    customPf?: string
  ): Promise<boolean> => {
    if (initialClaim) return false;
    const effectiveUid = customUid || selectedUserId || currentUser?.uid || userProfile?.id || '';
    const effectivePf = customPf || employeeNumber || userProfile?.employeeNumber || '';
    const cleanUid = (effectiveUid || 'usr').replace(/[^a-zA-Z0-9_-]/g, '_');
    const deterministicDraftId = 'clm_draft_' + cleanUid + '_' + targetYear + '_' + targetMonth.toLowerCase();

    // 1. Check local storage first (instant response)
    const localClaims = getClaims(effectiveUid);
    const localDrafts = localClaims.filter(
      c =>
        c.status === 'draft' &&
        c.month === targetMonth &&
        c.year === targetYear &&
        (c.userId === effectiveUid || (effectivePf && c.employeeNumber === effectivePf))
    );

    // 2. Check Firestore for latest drafts
    let cloudDrafts: ClaimRecord[] = [];
    try {
      if (effectiveUid) {
        const q = query(
          collection(db, 'claims'),
          where('status', '==', 'draft'),
          where('month', '==', targetMonth),
          where('year', '==', targetYear),
          where('userId', '==', effectiveUid)
        );
        const snap = await getDocs(q);
        cloudDrafts = snap.docs.map(d => ({ ...d.data(), id: d.id } as ClaimRecord));
      }
    } catch (err) {
      console.warn('Draft query notice:', err);
    }

    // Combine and deduplicate
    const combined = new Map<string, ClaimRecord>();
    cloudDrafts.forEach(d => combined.set(d.id, d));
    localDrafts.forEach(d => {
      if (!combined.has(d.id)) combined.set(d.id, d);
    });

    const matchingDrafts = Array.from(combined.values()).sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );

    if (matchingDrafts.length > 0) {
      const primaryDraft = matchingDrafts[0];
      setActiveClaimId(primaryDraft.id);
      setActiveClaimNumber(primaryDraft.claimNumber);
      if (primaryDraft.rows && primaryDraft.rows.length > 0) {
        setRows(primaryDraft.rows);
      } else {
        setRows(generateFullMonthRows(targetMonth, targetYear, isSpecialAssignedOt));
      }
      if (primaryDraft.employeeName) setEmployeeName(primaryDraft.employeeName);
      if (primaryDraft.employeeNumber) setEmployeeNumber(primaryDraft.employeeNumber);
      if (primaryDraft.designation) setDesignation(primaryDraft.designation);
      if (primaryDraft.branch) setBranch(primaryDraft.branch);
      if (primaryDraft.department) setDepartment(primaryDraft.department);
      if (primaryDraft.claimType) setClaimType(primaryDraft.claimType);
      if (primaryDraft.otPaymentDueB !== undefined) setOtPaymentDueB(primaryDraft.otPaymentDueB);
      // Only restore draft's custom rates if user is an admin or if rates are unlocked
      if (canEditRates) {
        if (primaryDraft.hourlyRate !== undefined) setHourlyRate(primaryDraft.hourlyRate);
        if (primaryDraft.daysPay !== undefined) setDaysPay(primaryDraft.daysPay);
        if (primaryDraft.hourlyRateNonWorkingDays !== undefined) setHourlyRateNonWorkingDays(primaryDraft.hourlyRateNonWorkingDays);
        if (primaryDraft.totalRemuneration !== undefined) setTotalRemuneration(primaryDraft.totalRemuneration);
      }

      const timeFormatted = new Date(primaryDraft.updatedAt || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      setLastAutoSaveTime(timeFormatted);
      setDraftToastMessage('Loaded uncompleted draft for ' + targetMonth + ' ' + targetYear + ' (' + primaryDraft.claimNumber + '). Changes will update this draft.');
      setTimeout(() => setDraftToastMessage(null), 4000);

      // Clean up any extra duplicate drafts for this user & month so ONLY ONE draft exists!
      if (matchingDrafts.length > 1) {
        const extraDrafts = matchingDrafts.slice(1);
        for (const extra of extraDrafts) {
          deleteClaim(extra.id, effectiveUid);
          try {
            await deleteDoc(doc(db, 'claims', extra.id));
          } catch (_) {}
        }
      }
      return true;
    }

    // No existing draft for this month: set deterministic ID so future auto-saves target this single draft
    setActiveClaimId(deterministicDraftId);
    setActiveClaimNumber(
      'CLM-' + targetYear + '-' + String(MONTH_NAMES.indexOf(targetMonth) + 1).padStart(2, '0') + '-' + Math.floor(100 + Math.random() * 900)
    );
    return false;
  };

  const handleMonthChange = (newMonth: string) => {
    lastEditedMetaRef.current = null;
    setClaimMonth(newMonth);
    markUserModified();
    if (!initialClaim) {
      setRows(generateFullMonthRows(newMonth, claimYear, isSpecialAssignedOt));
    }
  };

  const handleYearChange = (newYear: number) => {
    if (!Number.isFinite(newYear)) return;
    lastEditedMetaRef.current = null;
    setClaimYear(newYear);
    markUserModified();
    if (!initialClaim && newYear >= 1900 && newYear <= 2100) {
      setRows(generateFullMonthRows(claimMonth, newYear, isSpecialAssignedOt));
    }
  };

  const handleToggleSpecialAssignedOt = (newValue: boolean) => {
    lastEditedMetaRef.current = null;
    markUserModified();
    setIsSpecialAssignedOt(newValue);
    setRows(prevRows =>
      prevRows.map(r => {
        const isHoliday = isRowHoliday(r);
        const dow = r.dayOfWeek || getDayOfWeek(r.date);
        const isOther = !r.isLeave && (dow === 'Sat' || dow === 'Sun' || isHoliday);
        const effectiveSpecial = isDaysPayOnlyNonWorking && isOther ? false : newValue;
        const updated = { ...r, isSpecialAssignment: effectiveSpecial };
        if (updated.startTime && updated.endTime && !(isHoliday && !updated.isHolidayOverride)) {
          const calc = calculateShiftOvertime(
            updated.startTime,
            updated.endTime,
            0,
            maxOtLimitHours,
            isOther,
            userShiftEndTime || GENERAL_SHIFT_END,
            userShiftStartTime || GENERAL_SHIFT_START,
            effectiveSpecial,
            !!updated.isHolidayOverride,
            isDaysPayOnlyNonWorking
          );
          updated.totalWorkMinutes = calc.totalWorkMinutes;
          updated.rawOtMinutes = calc.rawOtMinutes;
          updated.totalMinutes = calc.totalMinutes;
          updated.totalFormatted =
            isOther && !updated.isHolidayOverride && !isDaysPayOnlyNonWorking
              ? ''
              : formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
          updated.isCapped = calc.isCapped;
          updated.isDaysPayment = isOther && calc.totalWorkMinutes > 0;
        }
        return updated;
      })
    );
  };

  // Create clean blank row with assigned shift start time (OT only)
  function createBlankRow(defaultDate: string = ''): OvertimeRow {
    const isWk = isWeekendDay(defaultDate);
    const isHol = holidayMap.has(defaultDate);
    const isSun = getDayOfWeek(defaultDate) === 'Sun';
    const isOff = isWk || isHol || isSun;
    return {
      id: 'row_' + Math.random().toString(36).substring(2, 9),
      date: defaultDate,
      dayOfWeek: getDayOfWeek(defaultDate),
      startTime: isOpClaim || isOff ? '' : (userShiftStartTime || GENERAL_SHIFT_START),
      endTime: '',
      breakMinutes: 0,
      isOvernight: false,
      isWeekend: isWk || isSun,
      isHoliday: isHol || isSun,
      holidayName: holidayMap.get(defaultDate)?.name || (isSun ? 'Sunday' : undefined),
      isHolidayOverride: false,
      isSpecialAssignment: isOpClaim ? false : isSpecialAssignedOt,
      totalWorkMinutes: 0,
      rawOtMinutes: 0,
      totalMinutes: 0,
      totalFormatted: '00:00',
      reason: (isHol || isSun)
        ? (defaultHolidayReason.trim() ? defaultHolidayReason.trim() : (holidayMap.get(defaultDate)?.name || (isSun ? 'Sunday' : 'Holiday')))
        : (getDayOfWeek(defaultDate) === 'Sat'
            ? (isOpClaim
                ? (defaultSaturdayReason.trim() && defaultSaturdayReason.trim() !== 'Saturday Duty' ? defaultSaturdayReason.trim() : '')
                : (defaultSaturdayReason.trim() ? defaultSaturdayReason.trim() : 'Saturday Duty'))
            : (defaultWeekdayReason.trim() ? defaultWeekdayReason.trim() : '')),
    };
  }

  // User-friendly Day Status switcher: Workday / Leave / Holiday
  const setRowDayStatus = (index: number, status: 'workday' | 'leave' | 'holiday') => {
    const rowAtIdx = rows[index];
    if (rowAtIdx) {
      lastEditedMetaRef.current = { rowId: rowAtIdx.id, field: 'dayStatus' };
    }
    markUserModified();
    setRows(prevRows => {
      const updated = [...prevRows];
      const current = updated[index];
      if (!current) return prevRows;
      const target = { ...current };
      const dow = target.dayOfWeek || getDayOfWeek(target.date);
      const isSat = dow === 'Sat';
      const isSun = dow === 'Sun';
      const defaultStart = userShiftStartTime || GENERAL_SHIFT_START;

      if (status === 'leave') {
        target.isLeave = true;
        target.leaveType = target.leaveType || 'Full Day';
        target.isHoliday = false;
        target.holidayName = undefined;
        target.holidayMarkedByUser = false;
        target.holidayUnmarkedByUser = false;
        target.isHolidayOverride = false;
        target.startTime = '';
        target.endTime = '';
        target.breakMinutes = 0;
        target.totalWorkMinutes = 0;
        target.rawOtMinutes = 0;
        target.totalMinutes = 0;
        target.totalFormatted = '00:00';
        target.isOvernight = false;
        target.isCapped = false;
        target.uncappedMinutes = 0;
        target.lateDeductionMinutes = 0;
        target.isLateDisqualified = false;
        target.lateNote = '';
        target.isDaysPayment = false;
        target.daysPaymentAmount = 0;
        if (
          target.reason === current.holidayName ||
          target.reason === 'Saturday Duty' ||
          target.reason === "Saturday Duty (Day's Pay)" ||
          target.reason === defaultHolidayReason.trim() ||
          target.reason === defaultSaturdayReason.trim()
        ) {
          target.reason = '';
        }
      } else if (status === 'holiday') {
        target.isLeave = false;
        target.leaveType = undefined;
        target.isHoliday = true;
        target.holidayMarkedByUser = true;
        target.holidayUnmarkedByUser = false;
        target.isHolidayOverride = false;
        const holName = holidayMap.get(toSafeStr(target.date).trim())?.name || (isSun ? 'Sunday' : 'Holiday');
        target.holidayName = holName;
        target.startTime = '';
        target.endTime = '';
        target.totalWorkMinutes = 0;
        target.rawOtMinutes = 0;
        target.totalMinutes = 0;
        target.totalFormatted = '';
        target.isDaysPayment = false;
        target.isCapped = false;
        target.lateDeductionMinutes = 0;
        target.isLateDisqualified = false;
        target.lateNote = '';
        target.reason = defaultHolidayReason.trim() ? defaultHolidayReason.trim() : holName;
      } else {
        // Regular workday (Mon-Fri or Saturday)
        target.isLeave = false;
        target.leaveType = undefined;
        target.isHoliday = false;
        target.holidayName = undefined;
        target.holidayMarkedByUser = false;
        target.holidayUnmarkedByUser = true;
        target.isHolidayOverride = false;
        if (!isOpClaim && !target.startTime && !isSat) {
          target.startTime = defaultStart;
        }
        if (
          target.reason === current.holidayName ||
          target.reason === 'Sunday' ||
          target.reason === 'Holiday' ||
          target.reason === 'Public Holiday' ||
          target.reason === defaultHolidayReason.trim()
        ) {
          target.reason = isSat
            ? (isOpClaim
                ? (defaultSaturdayReason.trim() && defaultSaturdayReason.trim() !== 'Saturday Duty' ? defaultSaturdayReason.trim() : '')
                : (defaultSaturdayReason.trim() ? defaultSaturdayReason.trim() : 'Saturday Duty'))
            : (defaultWeekdayReason.trim() ? defaultWeekdayReason.trim() : '');
        }
        if (target.startTime && target.endTime) {
          if (isOpClaim) {
            const dur = calculateOutOfPocketDuration(target.startTime, target.endTime);
            target.totalWorkMinutes = dur.durationMinutes;
            target.rawOtMinutes = 0;
            target.totalMinutes = dur.durationMinutes;
            target.totalFormatted = formatMinutesToTime(dur.durationMinutes, otDisplayFormat);
            target.isOvernight = dur.isOvernight;
            target.isCapped = false;
            target.uncappedMinutes = 0;
            target.lateDeductionMinutes = 0;
            target.isLateDisqualified = false;
            target.lateNote = '';
            target.isDaysPayment = false;
          } else {
            const isSpecial = isSpecialAssignedOt || !!target.isSpecialAssignment;
            const calc = calculateShiftOvertime(
              target.startTime,
              target.endTime,
              0,
              maxOtLimitHours,
              isSat,
              userShiftEndTime || GENERAL_SHIFT_END,
              defaultStart,
              isSpecial,
              false,
              isDaysPayOnlyNonWorking
            );
            target.totalWorkMinutes = calc.totalWorkMinutes;
            target.rawOtMinutes = calc.rawOtMinutes;
            target.totalMinutes = calc.totalMinutes;
            target.totalFormatted = formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
            target.isOvernight = calc.isOvernight;
            target.isCapped = calc.isCapped;
            target.uncappedMinutes = calc.uncappedMinutes;
            target.lateDeductionMinutes = calc.lateDeductionMinutes;
            target.isLateDisqualified = calc.isLateDisqualified;
            target.lateNote = calc.lateNote;
            target.isDaysPayment = isSat && calc.totalWorkMinutes > 0;
          }
        }
      }

      updated[index] = target;
      return updated;
    });
  };

  const updateRowLeaveType = (index: number, leaveType: string) => {
    markUserModified();
    setRows(prevRows => {
      const updated = [...prevRows];
      if (!updated[index]) return prevRows;
      updated[index] = {
        ...updated[index],
        isLeave: true,
        leaveType,
      };
      return updated;
    });
  };

  // User-friendly 1-click fix: clear partial/conflicting times on a row
  const clearRowEntry = (index: number) => {
    markUserModified();
    setRows(prevRows => {
      const updated = [...prevRows];
      const current = updated[index];
      if (!current) return prevRows;
      const dow = current.dayOfWeek || getDayOfWeek(current.date);
      const isHol = isRowHoliday(current);
      const isSat = dow === 'Sat';
      updated[index] = {
        ...current,
        startTime: isOpClaim || isHol || isSat || current.isLeave ? '' : (userShiftStartTime || GENERAL_SHIFT_START),
        endTime: '',
        totalWorkMinutes: 0,
        rawOtMinutes: 0,
        totalMinutes: 0,
        totalFormatted: isHol && !current.isHolidayOverride ? '' : '00:00',
        isOvernight: false,
        isCapped: false,
        uncappedMinutes: 0,
        lateDeductionMinutes: 0,
        isLateDisqualified: false,
        lateNote: '',
        isDaysPayment: false,
        daysPaymentAmount: 0,
      };
      return updated;
    });
  };

  // User-friendly 1-click fix: flip Time Out AM/PM to resolve same-session conflict
  const fixSameSessionRow = (index: number) => {
    const row = rows[index];
    if (!row || !row.startTime || !row.endTime) return;
    const inParsed = parse24To12(row.startTime);
    const outParsed = parse24To12(row.endTime);
    const oppositePeriod = inParsed.period === 'AM' ? 'PM' : 'AM';
    const fixedEndTime = format12To24(outParsed.hour, outParsed.minute, oppositePeriod);
    updateRowField(index, 'endTime', fixedEndTime);
  };

  // Toggle holiday override to enter In/Out times and claim overtime / OP work
  const toggleHolidayOverride = (index: number) => {
    const rowAtIdx = rows[index];
    if (rowAtIdx) {
      lastEditedMetaRef.current = { rowId: rowAtIdx.id, field: 'holidayOverride' };
    }
    markUserModified();
    setRows(prevRows => {
      const updated = [...prevRows];
      const target = { ...updated[index] };
      const nextOverride = !target.isHolidayOverride;
      target.isHolidayOverride = nextOverride;

      const dow = target.dayOfWeek || getDayOfWeek(target.date);
      const isSun = dow === 'Sun';
      const isHoliday = isRowHoliday(target);
      const isOther = dow === 'Sat' || dow === 'Sun' || isHoliday;

      if (nextOverride) {
        if (!isOpClaim && !target.startTime) target.startTime = userShiftStartTime || GENERAL_SHIFT_START;
      } else {
        target.startTime = '';
        target.endTime = '';
        target.totalWorkMinutes = 0;
        target.rawOtMinutes = 0;
        target.totalMinutes = 0;
        target.totalFormatted = '';
        target.isDaysPayment = false;
        target.daysPaymentAmount = 0;
        const holName = holidayMap.get(target.date)?.name || (isSun ? 'Sunday' : 'Holiday');
        target.reason = defaultHolidayReason.trim() ? defaultHolidayReason.trim() : holName;
      }

      if (target.startTime && target.endTime) {
        if (isOpClaim) {
          const dur = calculateOutOfPocketDuration(target.startTime, target.endTime);
          target.totalWorkMinutes = dur.durationMinutes;
          target.rawOtMinutes = 0;
          target.totalMinutes = dur.durationMinutes;
          target.totalFormatted = formatMinutesToTime(dur.durationMinutes, otDisplayFormat);
          target.isOvernight = dur.isOvernight;
          target.isDaysPayment = false;
        } else {
          const isSpecial = isDaysPayOnlyNonWorking && isOther ? false : (isSpecialAssignedOt || !!target.isSpecialAssignment);
          if (isDaysPayOnlyNonWorking && isOther) {
            target.isSpecialAssignment = false;
          }
          const calc = calculateShiftOvertime(
            target.startTime,
            target.endTime,
            0,
            maxOtLimitHours,
            isOther,
            userShiftEndTime || GENERAL_SHIFT_END,
            userShiftStartTime || GENERAL_SHIFT_START,
            isSpecial,
            nextOverride,
            isDaysPayOnlyNonWorking
          );
          target.totalWorkMinutes = calc.totalWorkMinutes;
          target.rawOtMinutes = calc.rawOtMinutes;
          target.totalMinutes = calc.totalMinutes;
          target.totalFormatted = formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
          target.isDaysPayment = isOther && calc.totalWorkMinutes > 0;
        }
      }

      updated[index] = target;
      return updated;
    });
  };

  // Row update with employee shift and 15-minute generation
  const updateRowField = (index: number, field: keyof OvertimeRow, value: any) => {
    const rowAtIdx = rows[index];
    if (rowAtIdx) {
      lastEditedMetaRef.current = { rowId: rowAtIdx.id, field: String(field) };
    }
    markUserModified();
    setRows(prevRows => {
      const updated = [...prevRows];
      const current = updated[index];
      if (!current) return prevRows;
      const currentIsHoliday = isRowHoliday(current);

      // Policy: Leave days or unclaimed Holidays cannot edit times without switching day status
      if (current.isLeave && (field === 'startTime' || field === 'endTime' || field === 'daysPaymentAmount')) {
        return prevRows;
      }
      if (currentIsHoliday && !current.isHolidayOverride && (field === 'startTime' || field === 'endTime' || field === 'reason' || field === 'daysPaymentAmount')) {
        return prevRows; // Strictly block editing times or reason on holidays without override
      }

      const target = { ...current, [field]: value };

      if (field === 'date') {
        const cleanDate = toSafeStr(value).trim();
        target.date = cleanDate;
        const newDow = getDayOfWeek(cleanDate);
        target.dayOfWeek = newDow;
        target.isWeekend = isWeekendDay(cleanDate);
        target.holidayMarkedByUser = false;
        target.holidayUnmarkedByUser = false;
        const holMatch = cleanDate ? holidayMap.get(cleanDate) : undefined;
        const checkHol = Boolean(holMatch) || newDow === 'Sun';

        if (!target.isLeave) {
          if (checkHol) {
            target.isHoliday = true;
            const holName = holMatch?.name || (newDow === 'Sun' ? 'Sunday' : 'Holiday');
            target.holidayName = holName;
            if (!target.isHolidayOverride) {
              target.startTime = '';
              target.endTime = '';
              target.reason = defaultHolidayReason.trim() ? defaultHolidayReason.trim() : holName;
            }
          } else {
            // Changed to normal working day or Saturday (not holiday)
            target.isHoliday = false;
            target.holidayName = undefined;
            target.isHolidayOverride = false;
            if (newDow === 'Sat') {
              if (!target.endTime) target.startTime = '';
              target.reason = isOpClaim
                ? (defaultSaturdayReason.trim() && defaultSaturdayReason.trim() !== 'Saturday Duty' ? defaultSaturdayReason.trim() : '')
                : (defaultSaturdayReason.trim() ? defaultSaturdayReason.trim() : 'Saturday Duty');
            } else {
              // Monday through Friday
              if (!isOpClaim && !target.startTime) target.startTime = userShiftStartTime || GENERAL_SHIFT_START;
              target.reason = defaultWeekdayReason.trim() ? defaultWeekdayReason.trim() : '';
            }
          }
        }
      }

      if (field === 'isHoliday') {
        const isSettingHoliday = Boolean(value);
        if (isSettingHoliday) {
          target.isLeave = false;
          target.leaveType = undefined;
          target.isHoliday = true;
          target.holidayMarkedByUser = true;
          target.holidayUnmarkedByUser = false;
          const holName = holidayMap.get(toSafeStr(target.date).trim())?.name || (target.dayOfWeek === 'Sun' ? 'Sunday' : 'Holiday');
          target.holidayName = holName;
          if (!target.isHolidayOverride) {
            target.startTime = '';
            target.endTime = '';
            target.reason = defaultHolidayReason.trim() ? defaultHolidayReason.trim() : holName;
          }
        } else {
          // User explicitly unmarks holiday: revert to working day or Saturday
          target.isHoliday = false;
          target.holidayName = undefined;
          target.holidayMarkedByUser = false;
          target.holidayUnmarkedByUser = true;
          target.isHolidayOverride = false;
          const dow = target.dayOfWeek || getDayOfWeek(target.date);
          if (dow === 'Sat') {
            target.reason = isOpClaim
              ? (defaultSaturdayReason.trim() && defaultSaturdayReason.trim() !== 'Saturday Duty' ? defaultSaturdayReason.trim() : '')
              : (defaultSaturdayReason.trim() ? defaultSaturdayReason.trim() : 'Saturday Duty');
          } else {
            target.reason = defaultWeekdayReason.trim() ? defaultWeekdayReason.trim() : '';
          }
        }
      }

      if (field === 'daysPaymentAmount') {
        const parsedAmt = Number(value);
        target.daysPaymentAmount = Number.isFinite(parsedAmt) && parsedAmt >= 0 ? parsedAmt : 0;
        updated[index] = target;
        return updated;
      }

      // OT Policy (Form 10756 only): Users cannot add In/Out in the same AM/PM session.
      // OP (Form 10610) keeps independent time tracking without Form 10756 shift rules.
      if (!isOpClaim && field === 'startTime') {
        target.startTime = value;
        if (value) {
          const inParsed = parse24To12(value);
          if (inParsed.period === 'AM') {
            if (target.endTime) {
              const outParsed = parse24To12(target.endTime);
              if (outParsed.period === 'AM') {
                target.endTime = format12To24(outParsed.hour, outParsed.minute, 'PM');
              }
            }
          } else if (inParsed.period === 'PM') {
            if (target.endTime) {
              const outParsed = parse24To12(target.endTime);
              if (outParsed.period === 'PM') {
                target.endTime = format12To24(outParsed.hour, outParsed.minute, 'AM');
              }
            }
          }
        }
      }

      if (!isOpClaim && field === 'endTime') {
        target.endTime = value;
        if (value && target.startTime) {
          const inParsed = parse24To12(target.startTime);
          const outParsed = parse24To12(value);
          // Users cannot add their in out times in same session!
          if (inParsed.period === outParsed.period) {
            const oppositePeriod = inParsed.period === 'AM' ? 'PM' : 'AM';
            target.endTime = format12To24(outParsed.hour, outParsed.minute, oppositePeriod);
          }
        }
      }

      const effectiveDow = target.dayOfWeek || getDayOfWeek(target.date);
      const effectiveIsHoliday = isRowHoliday(target);
      const isOther = !target.isLeave && (effectiveDow === 'Sat' || effectiveDow === 'Sun' || effectiveIsHoliday);
      const isSpecial = isSpecialAssignedOt || !!target.isSpecialAssignment;
      const isHolOverride = !!target.isHolidayOverride;

      // If leave or holiday is not overridden, ensure times are blank
      if (target.isLeave || (effectiveIsHoliday && !isHolOverride)) {
        target.startTime = '';
        target.endTime = '';
        target.totalWorkMinutes = 0;
        target.rawOtMinutes = 0;
        target.totalMinutes = 0;
        target.totalFormatted = target.isLeave ? '00:00' : '';
        target.isDaysPayment = false;
        updated[index] = target;
        return updated;
      }

      if (isOpClaim) {
        // Isolated OP (Form 10610) duration computation — zero Form 10756 OT calculations
        const dur = calculateOutOfPocketDuration(target.startTime, target.endTime);
        target.totalWorkMinutes = dur.durationMinutes;
        target.rawOtMinutes = 0;
        target.totalMinutes = dur.durationMinutes;
        target.totalFormatted = (effectiveIsHoliday && !isHolOverride)
          ? ''
          : formatMinutesToTime(dur.durationMinutes, otDisplayFormat);
        target.isOvernight = dur.isOvernight;
        target.isCapped = false;
        target.uncappedMinutes = 0;
        target.lateDeductionMinutes = 0;
        target.isLateDisqualified = false;
        target.lateNote = '';
        target.isDaysPayment = false;
        target.isSpecialAssignment = false;

        updated[index] = target;
        return updated;
      }

      const effectiveIsSpecial = isDaysPayOnlyNonWorking && isOther ? false : isSpecial;
      if (isDaysPayOnlyNonWorking && isOther) {
        target.isSpecialAssignment = false;
      }

      // Form 10756 OT rules (strictly OT only):
      const calc = calculateShiftOvertime(
        target.startTime,
        target.endTime,
        0,
        maxOtLimitHours,
        isOther,
        userShiftEndTime || GENERAL_SHIFT_END,
        userShiftStartTime || GENERAL_SHIFT_START,
        effectiveIsSpecial,
        isHolOverride,
        isDaysPayOnlyNonWorking
      );

      target.totalWorkMinutes = calc.totalWorkMinutes;
      target.rawOtMinutes = calc.rawOtMinutes;
      target.totalMinutes = calc.totalMinutes;
      target.totalFormatted = (effectiveIsHoliday && !isHolOverride) ? '' : formatMinutesToTime(calc.totalMinutes, otDisplayFormat);
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

  // Re-calculate all rows and synchronize Integrated Calendar holidays whenever calendar, shift, or limits update
  useEffect(() => {
    const safeHolReason = toSafeStr(defaultHolidayReason).trim();
    const safeSatReason = toSafeStr(defaultSaturdayReason).trim();
    const safeWeekReason = toSafeStr(defaultWeekdayReason).trim();
    const defaultStart = userShiftStartTime || GENERAL_SHIFT_START;

    setRows(prevRows =>
      prevRows.map(rawRow => {
        let row = rawRow;
        if (row.isLeave) {
          return {
            ...row,
            startTime: '',
            endTime: '',
            totalWorkMinutes: 0,
            rawOtMinutes: 0,
            totalMinutes: 0,
            totalFormatted: '00:00',
            isDaysPayment: false,
            isCapped: false,
          };
        }

        const dateKey = toSafeStr(row.date).trim();
        const dow = row.dayOfWeek || getDayOfWeek(dateKey);
        const isSun = dow === 'Sun';
        const isSat = dow === 'Sat';
        const mappedHoliday = dateKey ? holidayMap.get(dateKey) : undefined;

        // 1. Apply Firestore Calendar holiday onto any non-leave row unless user explicitly marked it Workday
        if (mappedHoliday && !row.holidayUnmarkedByUser) {
          const prevHolidayName = toSafeStr(row.holidayName).trim();
          const currentReasonTrimmed = toSafeStr(row.reason).trim();
          const isPlaceholderReason =
            !currentReasonTrimmed ||
            currentReasonTrimmed === prevHolidayName ||
            currentReasonTrimmed === 'Sunday' ||
            currentReasonTrimmed === 'Holiday' ||
            currentReasonTrimmed === 'Public Holiday' ||
            currentReasonTrimmed === 'Saturday Duty' ||
            currentReasonTrimmed === "Saturday Duty (Day's Pay)" ||
            (safeSatReason && currentReasonTrimmed === safeSatReason) ||
            (safeWeekReason && currentReasonTrimmed === safeWeekReason);

          if (!row.endTime && !row.isHolidayOverride) {
            return {
              ...row,
              isHoliday: true,
              holidayName: mappedHoliday.name,
              startTime: '',
              endTime: '',
              totalWorkMinutes: 0,
              rawOtMinutes: 0,
              totalMinutes: 0,
              totalFormatted: '',
              isDaysPayment: false,
              reason: isPlaceholderReason ? (safeHolReason || mappedHoliday.name) : row.reason,
            };
          }

          if (!row.isHoliday || prevHolidayName !== mappedHoliday.name) {
            row = {
              ...row,
              isHoliday: true,
              holidayName: mappedHoliday.name,
              reason: isPlaceholderReason ? (safeHolReason || mappedHoliday.name) : row.reason,
            };
          }
        } else if (
          holidaysLoaded &&
          !mappedHoliday &&
          !isSun &&
          row.isHoliday &&
          !row.holidayMarkedByUser &&
          !row.isHolidayOverride &&
          !row.endTime
        ) {
          // 2. Holiday was removed from Integrated Calendar after initial mount/draft load -> revert cleanly
          const prevHolidayName = toSafeStr(row.holidayName).trim();
          const currentReasonTrimmed = toSafeStr(row.reason).trim();
          const wasHolidayReason =
            !currentReasonTrimmed ||
            currentReasonTrimmed === prevHolidayName ||
            currentReasonTrimmed === 'Public Holiday' ||
            currentReasonTrimmed === 'Holiday' ||
            (safeHolReason && currentReasonTrimmed === safeHolReason);

          return {
            ...row,
            isHoliday: false,
            holidayName: undefined,
            startTime: isOpClaim || isSat ? '' : defaultStart,
            endTime: '',
            totalWorkMinutes: 0,
            rawOtMinutes: 0,
            totalMinutes: 0,
            totalFormatted: '00:00',
            isDaysPayment: false,
            reason: wasHolidayReason
              ? (isSat
                  ? (isOpClaim
                      ? (safeSatReason && safeSatReason !== 'Saturday Duty' ? safeSatReason : '')
                      : (safeSatReason || 'Saturday Duty'))
                  : safeWeekReason)
              : row.reason,
          };
        }

        const isHoliday = isRowHoliday(row);
        const isOther = isSat || isSun || isHoliday;
        const isSpecial = isSpecialAssignedOt || !!row.isSpecialAssignment;
        const isHolOverride = !!row.isHolidayOverride;

        if (isHoliday && !isHolOverride) {
          if (row.startTime || row.endTime || row.totalMinutes > 0 || row.isDaysPayment) {
            return {
              ...row,
              startTime: '',
              endTime: '',
              totalWorkMinutes: 0,
              rawOtMinutes: 0,
              totalMinutes: 0,
              totalFormatted: '',
              isDaysPayment: false,
            };
          }
          return row;
        }

        if (!row.startTime || !row.endTime) return row;

        if (isOpClaim) {
          const dur = calculateOutOfPocketDuration(row.startTime, row.endTime);
          return {
            ...row,
            totalWorkMinutes: dur.durationMinutes,
            rawOtMinutes: 0,
            totalMinutes: dur.durationMinutes,
            totalFormatted: formatMinutesToTime(dur.durationMinutes, otDisplayFormat),
            isOvernight: dur.isOvernight,
            isCapped: false,
            uncappedMinutes: 0,
            lateDeductionMinutes: 0,
            isLateDisqualified: false,
            lateNote: '',
            isDaysPayment: false,
            isSpecialAssignment: false,
          };
        }

        const effectiveIsSpecial = isDaysPayOnlyNonWorking && isOther ? false : isSpecial;
        const calc = calculateShiftOvertime(
          row.startTime,
          row.endTime,
          0,
          maxOtLimitHours,
          isOther,
          userShiftEndTime || GENERAL_SHIFT_END,
          userShiftStartTime || GENERAL_SHIFT_START,
          effectiveIsSpecial,
          isHolOverride,
          isDaysPayOnlyNonWorking
        );
        return {
          ...row,
          isSpecialAssignment: isDaysPayOnlyNonWorking && isOther ? false : row.isSpecialAssignment,
          totalWorkMinutes: calc.totalWorkMinutes,
          rawOtMinutes: calc.rawOtMinutes,
          totalMinutes: calc.totalMinutes,
          totalFormatted: formatMinutesToTime(calc.totalMinutes, otDisplayFormat),
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
  }, [maxOtLimitHours, otDisplayFormat, holidayMap, holidaysLoaded, userShiftEndTime, userShiftStartTime, isSpecialAssignedOt, isOpClaim, isDaysPayOnlyNonWorking]);

  // Auto-Fill Month: Loads ALL dates in the selected month with holidays & Sundays synced
  const handleAutoFillMonth = () => {
    markUserModified();
    const monthIndex = MONTH_NAMES.indexOf(claimMonth);
    if (monthIndex < 0) return;

    const holidayDatesSet = new Set(Array.from(holidayMap.keys()));
    // Load ALL dates in the month (do NOT exclude holidays or Sundays)
    const monthDates = generateMonthDates(claimYear, monthIndex, holidayDatesSet, false);
    const existingDateMap = new Map(rows.map(r => [toSafeStr(r.date).trim(), r]));
    const safeHolReason = toSafeStr(defaultHolidayReason).trim();
    const safeSatReason = toSafeStr(defaultSaturdayReason).trim();
    const safeWeekReason = toSafeStr(defaultWeekdayReason).trim();

    const newRows: OvertimeRow[] = monthDates.map(({ date, day, isHoliday }) => {
      const existing = existingDateMap.get(date);
      const holidayInfo = holidayMap.get(date);
      const isSat = day === 'Sat';
      const isSun = day === 'Sun';
      const isHol = Boolean(isHoliday || isSun || holidayInfo);

      if (existing) {
        if (!existing.isLeave && !existing.holidayUnmarkedByUser && holidayInfo && !existing.isHoliday && !existing.endTime) {
          return {
            ...existing,
            isHoliday: true,
            holidayName: holidayInfo.name,
            startTime: '',
            endTime: '',
            totalFormatted: '',
            reason: toSafeStr(existing.reason).trim() || safeHolReason || holidayInfo.name,
          };
        }
        return existing;
      }

      return {
        id: 'row_' + Math.random().toString(36).substring(2, 9),
        date,
        dayOfWeek: day,
        startTime: isOpClaim || isHol || isSat ? '' : (userShiftStartTime || GENERAL_SHIFT_START),
        endTime: '',
        breakMinutes: 0,
        isOvernight: false,
        isWeekend: isSat || isSun,
        isHoliday: isHol,
        holidayName: holidayInfo?.name || (isSun ? 'Sunday' : isHol ? 'Public Holiday' : undefined),
        isHolidayOverride: false,
        isSpecialAssignment: isOpClaim ? false : isSpecialAssignedOt,
        totalWorkMinutes: 0,
        rawOtMinutes: 0,
        totalMinutes: 0,
        totalFormatted: isHol ? '' : '00:00',
        reason: isHol
          ? (safeHolReason || holidayInfo?.name || (isSun ? 'Sunday' : 'Holiday'))
          : (isSat
              ? (isOpClaim
                  ? (safeSatReason && safeSatReason !== 'Saturday Duty' ? safeSatReason : '')
                  : (safeSatReason || "Saturday Duty (Day's Pay)"))
              : safeWeekReason),
      };
    });

    setRows(newRows);
  };

  const handleAddRow = () => {
    markUserModified();
    const lastRow = rows[rows.length - 1];
    let nextDate = '';
    if (lastRow && typeof lastRow.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastRow.date)) {
      const [y, m, d] = lastRow.date.split('-').map(Number);
      const nextD = new Date(y, m - 1, d + 1);
      if (!isNaN(nextD.getTime())) {
        nextDate = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}-${String(nextD.getDate()).padStart(2, '0')}`;
      }
    }
    setRows([...rows, createBlankRow(nextDate)]);
  };

  const handleDuplicateRow = (index: number) => {
    markUserModified();
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
    markUserModified();
    if (rows.length <= 1) {
      setRows([createBlankRow()]);
      return;
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  // Column A: Regular Overtime (Mon-Fri, plus Saturdays/non-working days ONLY for unlocked-rate designations; NOT Special OT, NOT Holiday Override, NOT Leave)
  const columnA_Rows = useMemo(() => {
    return rows.filter(
      r =>
        !r.isLeave &&
        !(isRowHoliday(r) && !r.isHolidayOverride) &&
        !(isDaysPayOnlyNonWorking && isOtherDayRow(r)) &&
        !(r.isSpecialAssignment ?? isSpecialAssignedOt) &&
        !r.isHolidayOverride &&
        (r.totalMinutes || 0) > 0
    );
  }, [rows, isSpecialAssignedOt, holidayMap, isDaysPayOnlyNonWorking]);

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

  // Column B: Special Assigned OT (no limit) OR Holiday Overridden Overtime (never non-working days for locked-rate designations)
  const columnB_Rows = useMemo(() => {
    return rows.filter(
      r =>
        !r.isLeave &&
        !(isRowHoliday(r) && !r.isHolidayOverride) &&
        !(isDaysPayOnlyNonWorking && isOtherDayRow(r)) &&
        ((r.isSpecialAssignment ?? isSpecialAssignedOt) || r.isHolidayOverride) &&
        (r.totalMinutes || 0) > 0
    );
  }, [rows, isSpecialAssignedOt, holidayMap, isDaysPayOnlyNonWorking]);

  const colBMinutes = useMemo(() => {
    return columnB_Rows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [columnB_Rows]);

  const colBDecimalHours = useMemo(() => {
    return parseFloat((colBMinutes / 60).toFixed(2));
  }, [colBMinutes]);

  // Special OT on weekdays
  const specialOtWeekdayMinutes = useMemo(() => {
    return rows
      .filter(r => !r.isLeave && isWeekdayWorkingDay(r) && (r.isSpecialAssignment ?? isSpecialAssignedOt) && !r.isHolidayOverride)
      .reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [rows, holidayMap, isSpecialAssignedOt]);

  const specialOtWeekdayPayment = useMemo(() => {
    if (hourlyRate === '' || isNaN(Number(hourlyRate))) return 0;
    return Math.round((specialOtWeekdayMinutes / 60) * Number(hourlyRate) * 100) / 100;
  }, [specialOtWeekdayMinutes, hourlyRate]);

  // Overridden Holiday Overtime: for unlocked-rate designations, earns Day's Pay AND Non-Working Days Hourly Rate;
  // for locked-rate designations, earns Day's Pay ONLY (0 OT hours).
  const holidayOverriddenRows = useMemo(() => {
    if (isDaysPayOnlyNonWorking) return [];
    return rows.filter(r => !r.isLeave && r.isHolidayOverride && ((r.totalMinutes || 0) > 0 || (r.totalWorkMinutes || 0) > 0));
  }, [rows, isDaysPayOnlyNonWorking]);

  const holidayOtMinutes = useMemo(() => {
    if (isDaysPayOnlyNonWorking) return 0;
    return holidayOverriddenRows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
  }, [holidayOverriddenRows, isDaysPayOnlyNonWorking]);

  const holidayDecimalHours = useMemo(() => {
    return parseFloat((holidayOtMinutes / 60).toFixed(2));
  }, [holidayOtMinutes]);

  const effectiveNonWorkingHourlyRate = useMemo(() => {
    if (isDaysPayOnlyNonWorking) return 0;
    if (hourlyRateNonWorkingDays !== '' && !isNaN(Number(hourlyRateNonWorkingDays))) {
      return Number(hourlyRateNonWorkingDays);
    }
    if (hourlyRate !== '' && !isNaN(Number(hourlyRate))) {
      return Math.round(Number(hourlyRate) * 1.5 * 100) / 100;
    }
    return 0;
  }, [hourlyRateNonWorkingDays, hourlyRate, isDaysPayOnlyNonWorking]);

  const holidayHourlyPayment = useMemo(() => {
    if (isDaysPayOnlyNonWorking || effectiveNonWorkingHourlyRate <= 0) return 0;
    return Math.round(holidayDecimalHours * effectiveNonWorkingHourlyRate * 100) / 100;
  }, [holidayDecimalHours, effectiveNonWorkingHourlyRate, isDaysPayOnlyNonWorking]);

  // Other days (Saturdays, Sundays, non-working days, holidays)
  // Condition: Saturday requires minimum 6 hours (360 mins) to earn a Day's Payment; overridden holidays/Sundays earn Day's payment if worked.
  const otherDaysWorkedRows = useMemo(() => {
    return rows.filter(r => {
      if (r.isLeave) return false;
      if (!isOtherDayRow(r)) return false;
      if (isRowHoliday(r) && !r.isHolidayOverride) return false;
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

  const opSummary = useMemo(
    () => summarizeOutOfPocketRows(rows, otDisplayFormat),
    [rows, otDisplayFormat]
  );

  const summary = useMemo(() => {
    if (isOpClaim) {
      return {
        totalMinutes: opSummary.totalWorkMinutes,
        totalHoursFormatted: opSummary.totalHoursFormatted,
        totalDecimalHours: opSummary.totalDecimalHours,
        colAMinutes: 0,
        colADecimalHours: 0,
        colAFormatted: '00:00',
        colBMinutes: 0,
        colBDecimalHours: 0,
        colBFormatted: '00:00',
        otDaysCount: opSummary.loggedDaysCount,
        cappedCount: 0,
        daysPayCount: 0,
        daysPayTotal: 0,
        holidayOtMinutes: 0,
        holidayDecimalHours: 0,
        holidayHourlyPayment: 0,
        specialOtWeekdayPayment: 0,
        calculatedPaymentB: 0,
      };
    }
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
    isOpClaim,
    opSummary,
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
    if (isOpClaim || !canEditRates) return;
    markUserModified();
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
    setShowValidationAttention(true);

    if (!employeeName.trim()) {
      setValidationError('Please enter employee name.');
      scrollToErrorTarget({ type: 'employeeName' });
      return false;
    }

    // Check day cards completeness & shift conflicts and auto-scroll directly to the first error
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const val = getRowValidation(r);
      if (val.hasIssue) {
        const dayLabel = `Day #${i + 1}${r.date ? ` (${r.date})` : ''}`;
        if (val.isMissingTimeOut) {
          setValidationError(`${dayLabel}: Time Out is missing. Enter Time Out, clear the entry, or mark this day as Leave.`);
        } else if (val.isMissingTimeIn) {
          setValidationError(`${dayLabel}: Time In is missing when Time Out is provided.`);
        } else if (val.hasSameSession) {
          setValidationError(`${dayLabel}: Time In and Time Out cannot be in the same AM/PM session.`);
        } else if (val.isZeroDuration) {
          setValidationError(`${dayLabel}: Time In and Time Out cannot be the same (${r.startTime}).`);
        } else if (val.isMissingReason) {
          setValidationError(`${dayLabel}: Please enter duties / nature of work for this entry.`);
        } else if (val.isDuplicateDate) {
          setValidationError(`${dayLabel}: Date ${r.date} is duplicated on another row.`);
        } else if (val.isHolidayNotOverridden) {
          setValidationError(`${dayLabel}: Enable "I worked on this holiday" to log hours, or clear the times.`);
        } else if (val.isSatShortHours) {
          setValidationError(
            `${dayLabel}: Saturday Day's Pay requires at least 6 hours worked, or enter Time In & Time Out for hourly OT.`
          );
        } else if (val.friendlyMessage) {
          setValidationError(`${dayLabel}: ${val.friendlyMessage}`);
        }

        // Ensure the row card is visible even if a restrictive filter was active
        if (viewMode === 'cards' && cardFilter !== 'all' && cardFilter !== 'issues') {
          setCardFilter('all');
        }
        scrollToErrorTarget({ type: 'row', rowId: r.id, focusField: val.focusTarget });
        return false;
      }
    }

    if (isOpClaim) {
      if (opSummary.totalWorkMinutes <= 0 && opSummary.totalAmountRs <= 0) {
        setValidationError(
          'No Out of Pocket entries recorded yet. Enter worked times or an allowance amount on at least one day.'
        );
        scrollToErrorTarget({ type: 'timesheet' });
        return false;
      }
    } else if (summary.totalMinutes <= 0 && daysPayCount <= 0) {
      setValidationError(
        'No claimable overtime recorded yet. Enter Time In and Time Out on at least one working day (worked-but-no-OT days and Leave days do not print).'
      );
      scrollToErrorTarget({ type: 'timesheet' });
      return false;
    }

    setHighlightedErrorRowId(null);
    return true;
  };

  const checkSundayOrHolidayReview = (trigger: 'preview' | 'download' | 'save'): boolean => {
    if (hasReviewedSunday) return true;
    const sundayOrHolidayRows = rows.filter(r => {
      if (r.isLeave) return false;
      const isSun = r.dayOfWeek === 'Sun' || getDayOfWeek(r.date) === 'Sun';
      const isHol = isRowHoliday(r);
      return (isSun || isHol) && !!r.isHolidayOverride && (r.startTime || r.endTime || r.totalWorkMinutes > 0);
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

  // Strictly identify claimed rows for submission & PDF print, isolated by Claim Type
  const isClaimedRow = (r: OvertimeRow): boolean => {
    if (!r || r.isLeave) return false;
    const isHol = isRowHoliday(r);
    if (isHol && !r.isHolidayOverride) return false;

    if (isOpClaim) {
      return Boolean(
        (r.totalWorkMinutes || 0) > 0 ||
        (r.daysPaymentAmount || 0) > 0 ||
        (Boolean(toSafeStr(r.startTime).trim()) && Boolean(toSafeStr(r.endTime).trim()))
      );
    }

    const safeDate = toSafeStr(r.date);
    const isSat = r.dayOfWeek === 'Sat' || getDayOfWeek(safeDate) === 'Sat';
    const isOther = isSat || isHol || !!r.isDaysPayment;
    const hasValidOt = !(isDaysPayOnlyNonWorking && isOther) && (r.totalMinutes || 0) > 0;
    const specialHoursStr = toSafeStr(r.specialAssignmentHours).trim();
    const hasSpecialHours =
      !(isDaysPayOnlyNonWorking && isOther) &&
      Boolean(
        specialHoursStr !== '' &&
        specialHoursStr !== '0' &&
        specialHoursStr !== '00:00'
      );
    const hasOpAmount = Boolean(
      (r.daysPaymentAmount || 0) > 0 &&
      (Boolean(toSafeStr(r.startTime).trim()) || Boolean(toSafeStr(r.endTime).trim()) || Boolean(toSafeStr(r.reason).trim()))
    );
    const isQualifiedSatDayPay = isSat && (!!r.isDaysPayment || isDaysPayOnlyNonWorking) && (r.totalWorkMinutes || 0) >= 360;
    const isQualifiedHolDayPay = isHol && !!r.isHolidayOverride && (r.totalWorkMinutes || 0) > 0;

    return hasValidOt || hasSpecialHours || hasOpAmount || isQualifiedSatDayPay || isQualifiedHolDayPay;
  };

  const buildClaimRecord = (status: 'draft' | 'submitted' = 'submitted', customRows?: OvertimeRow[]): ClaimRecord => {
    const claimId = activeClaimId || initialClaim?.id || 'clm_' + Date.now();
    const sourceRows = customRows || rows;
    // Strictly keep ONLY claimed dates on submitted claims / PDF generation; preserve all rows in drafts
    const claimedRows = sourceRows.filter(isClaimedRow);
    const activeRows = status === 'draft' ? sourceRows : claimedRows;

    const commonBase = {
      id: claimId,
      userId: selectedUserId || currentUser?.uid || 'user_1',
      claimNumber:
        activeClaimNumber ||
        initialClaim?.claimNumber ||
        `CLM-${claimYear}-${String(MONTH_NAMES.indexOf(claimMonth) + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      employeeName,
      employeeNumber,
      designation,
      branch,
      department,
      claimType: effectiveClaimType,
      month: claimMonth,
      year: claimYear,
      claimDate,
      status,
      createdAt: initialClaim?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isOpClaim) {
      // Strictly isolated Form 10610 Out of Pocket record (zero Form 10756 OT rates/rules)
      const opRecordSummary = summarizeOutOfPocketRows(activeRows, otDisplayFormat);
      return {
        ...commonBase,
        claimType: 'OP',
        templateId: OP_TEMPLATE_ID,
        rows: activeRows.map(r => ({
          ...r,
          isSpecialAssignment: false,
          isDaysPayment: false,
        })),
        totalMinutes: opRecordSummary.totalWorkMinutes,
        totalHoursFormatted: opRecordSummary.totalHoursFormatted,
        totalDecimalHours: opRecordSummary.totalDecimalHours,
        otDaysCount: opRecordSummary.loggedDaysCount,
        totalOtPayment: opRecordSummary.totalAmountRs,
      };
    }

    const normalizedActiveRows = activeRows.map(r => {
      if (isDaysPayOnlyNonWorking && isOtherDayRow(r)) {
        return {
          ...r,
          isSpecialAssignment: false,
          rawOtMinutes: 0,
          totalMinutes: 0,
          totalFormatted: isRowHoliday(r) && !r.isHolidayOverride ? '' : '00:00',
          isCapped: false,
          uncappedMinutes: 0,
        };
      }
      return {
        ...r,
        isSpecialAssignment: r.isSpecialAssignment ?? isSpecialAssignedOt,
      };
    });

    const totalMinutes = normalizedActiveRows.reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
    const otDaysCount = normalizedActiveRows.filter(r => !r.isLeave && (r.totalMinutes || 0) > 0).length;
    const totalDecimalHours = parseFloat((totalMinutes / 60).toFixed(2));
    const totalHoursFormatted = formatMinutesToTime(totalMinutes, otDisplayFormat);

    // Column A: Regular overtime (Working days; plus Saturdays/non-working days ONLY for unlocked-rate designations)
    const calculatedPaymentA =
      hourlyRate !== '' && !isNaN(Number(hourlyRate))
        ? Math.round(
            normalizedActiveRows
              .filter(
                r =>
                  !r.isLeave &&
                  !(isRowHoliday(r) && !r.isHolidayOverride) &&
                  !(isDaysPayOnlyNonWorking && isOtherDayRow(r)) &&
                  !(r.isSpecialAssignment ?? isSpecialAssignedOt) &&
                  !r.isHolidayOverride
              )
              .reduce((acc, r) => acc + (r.totalMinutes || 0), 0) /
              60 *
              Number(hourlyRate) *
              100
          ) / 100
        : 0;

    const currentDaysPayCount = normalizedActiveRows.filter(r => {
      if (r.isLeave) return false;
      if (!isOtherDayRow(r)) return false;
      if (isRowHoliday(r) && !r.isHolidayOverride) return false;
      const isSat = r.dayOfWeek === 'Sat' || getDayOfWeek(r.date) === 'Sat';
      return isSat ? (r.totalWorkMinutes || 0) >= 360 : (r.totalWorkMinutes || 0) > 0;
    }).length;
    const currentDaysPayTotal =
      daysPay !== '' && !isNaN(Number(daysPay))
        ? Math.round(currentDaysPayCount * Number(daysPay) * 100) / 100
        : 0;

    // Column B: Special Assigned OT AND Holiday Override OT (weekday Special OT only for locked-rate designations)
    const specialOtWeekdayMin = normalizedActiveRows
      .filter(r => isWeekdayWorkingDay(r) && (r.isSpecialAssignment ?? isSpecialAssignedOt) && !r.isHolidayOverride)
      .reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
    const specialOtWeekdayPayment =
      hourlyRate !== '' && !isNaN(Number(hourlyRate))
        ? Math.round((specialOtWeekdayMin / 60) * Number(hourlyRate) * 100) / 100
        : 0;

    const currentHolidayOtMin = isDaysPayOnlyNonWorking
      ? 0
      : normalizedActiveRows
          .filter(r => r.isHolidayOverride)
          .reduce((acc, r) => acc + (r.totalMinutes || 0), 0);
    const currentHolidayPayment =
      !isDaysPayOnlyNonWorking && effectiveNonWorkingHourlyRate > 0
        ? Math.round((currentHolidayOtMin / 60) * effectiveNonWorkingHourlyRate * 100) / 100
        : 0;

    const manualB = otPaymentDueB !== '' ? Number(otPaymentDueB) : 0;
    const calculatedPaymentB = Math.round((specialOtWeekdayPayment + currentHolidayPayment + (isNaN(manualB) ? 0 : manualB)) * 100) / 100;
    const calculatedTotalPayment = Math.round((calculatedPaymentA + calculatedPaymentB + currentDaysPayTotal) * 100) / 100;

    return {
      ...commonBase,
      claimType: 'OT',
      rows: normalizedActiveRows,
      totalMinutes,
      totalHoursFormatted,
      totalDecimalHours,
      otDaysCount,
      totalRemuneration: !canEditRates && targetProfile?.totalRemuneration !== undefined && targetProfile.totalRemuneration !== ''
        ? Number(targetProfile.totalRemuneration)
        : ((totalRemuneration !== '' && !isNaN(Number(totalRemuneration))) ? Number(totalRemuneration) : undefined),
      hourlyRate: !canEditRates
        ? ((targetProfile?.hourlyRate !== undefined && targetProfile.hourlyRate !== '') ? Number(targetProfile.hourlyRate) : (userRelevantRole?.hourlyRateWorkingDays !== undefined ? Number(userRelevantRole.hourlyRateWorkingDays) : (hourlyRate !== '' ? Number(hourlyRate) : undefined)))
        : ((hourlyRate !== '' && !isNaN(Number(hourlyRate))) ? Number(hourlyRate) : undefined),
      daysPay: !canEditRates
        ? ((targetProfile?.daysPay !== undefined && targetProfile.daysPay !== '') ? Number(targetProfile.daysPay) : (userRelevantRole?.daysPaymentNonWorkingDays !== undefined ? Number(userRelevantRole.daysPaymentNonWorkingDays) : (daysPay !== '' ? Number(daysPay) : undefined)))
        : ((daysPay !== '' && !isNaN(Number(daysPay))) ? Number(daysPay) : undefined),
      hourlyRateNonWorkingDays: isDaysPayOnlyNonWorking
        ? undefined
        : !canEditRates
        ? ((targetProfile?.hourlyRateNonWorkingDays !== undefined && targetProfile.hourlyRateNonWorkingDays !== '') ? Number(targetProfile.hourlyRateNonWorkingDays) : (userRelevantRole?.hourlyRateNonWorkingDays !== undefined ? Number(userRelevantRole.hourlyRateNonWorkingDays) : (hourlyRateNonWorkingDays !== '' ? Number(hourlyRateNonWorkingDays) : undefined)))
        : ((hourlyRateNonWorkingDays !== '' && !isNaN(Number(hourlyRateNonWorkingDays))) ? Number(hourlyRateNonWorkingDays) : undefined),
      isRatesUnlocked: !isTargetUserRatesLocked,
      isRatesLocked: isTargetUserRatesLocked,
      daysPayCount: currentDaysPayCount,
      daysPayTotal: currentDaysPayTotal,
      otPaymentDueA: calculatedPaymentA,
      otPaymentDueB: calculatedPaymentB,
      totalOtPayment: calculatedTotalPayment,
      templateId: activeTemplate.id || OT_TEMPLATE_ID,
    };
  };

  // Check if there is any uncompleted data entered (ONLY true if user actively made changes!)
  const hasUncompletedData = useMemo(() => {
    if (!hasUserModified) return false;
    const hasEmployee = Boolean(employeeName.trim() || employeeNumber.trim());
    return hasEmployee || rows.length > 0;
  }, [hasUserModified, employeeName, employeeNumber, rows.length]);

  // Saves the in-progress timesheet as draft to Firestore and localStorage
  const performSaveDraft = async () => {
    if (isSubmittedRef.current) return;
    if (!autoSaveDraftEnabled) return;
    // CRITICAL: NEVER save draft unless user actually made a modification!
    if (!hasUserModifiedRef.current || !hasUncompletedData) return;

    try {
      setIsAutoSaving(true);

      const effectiveUid = toSafeStr(selectedUserId || currentUser?.uid || userProfile?.id, 'usr');
      const cleanUid = effectiveUid.replace(/[^a-zA-Z0-9_-]/g, '_');
      const deterministicDraftId = 'clm_draft_' + cleanUid + '_' + claimYear + '_' + toSafeStr(claimMonth).toLowerCase();

      // If user is editing an existing claim, keep its ID. Otherwise use activeClaimId or deterministic draft ID.
      const claimIdToUse = activeClaimId || initialClaim?.id || deterministicDraftId;
      if (!activeClaimId) setActiveClaimId(claimIdToUse);

      const claimNumberToUse =
        activeClaimNumber ||
        initialClaim?.claimNumber ||
        `CLM-${claimYear}-${String(MONTH_NAMES.indexOf(claimMonth) + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;
      if (!activeClaimNumber) setActiveClaimNumber(claimNumberToUse);

      // Auto-save always builds as draft status. If user was editing an existing submitted item,
      // this transitions it to 'draft' so if left uncompleted, it automatically appears in the Drafts list.
      const draftClaim = buildClaimRecord('draft');
      draftClaim.id = claimIdToUse;
      draftClaim.claimNumber = claimNumberToUse;

      // Hash comparison to avoid redundant Firestore writes
      const currentHash = JSON.stringify({
        id: claimIdToUse,
        m: draftClaim.month,
        y: draftClaim.year,
        rows: draftClaim.rows.map(r => ({
          d: r.date,
          s: r.startTime,
          e: r.endTime,
          r: r.reason,
          sp: r.isSpecialAssignment,
          ho: r.isHolidayOverride,
          lv: r.isLeave,
          lt: r.leaveType,
        })),
        tot: draftClaim.totalMinutes,
        hr: draftClaim.hourlyRate,
        dp: draftClaim.daysPay,
        rem: draftClaim.totalRemuneration,
      });

      if (lastSavedHashRef.current === currentHash) {
        setIsAutoSaving(false);
        return;
      }
      lastSavedHashRef.current = currentHash;

      // Save to localStorage
      saveClaim(draftClaim);
      saveDraftClaim(draftClaim, draftClaim.userId);

      // Save to Cloud Firestore
      await setDoc(doc(db, 'claims', draftClaim.id), sanitizeFirestoreData(draftClaim));

      const timeFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastAutoSaveTime(timeFormatted);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.warn('Draft save notice:', err);
    } finally {
      setIsAutoSaving(false);
    }
  };

  // Debounced auto-save effect for uncompleted sheets
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (!autoSaveDraftEnabled) return;
    if (isSubmittedRef.current) return;
    // CRITICAL: NEVER auto-save draft on new claim opening unless user actively modified data
    if (!hasUserModifiedRef.current || !hasUncompletedData) return;

    setHasUnsavedChanges(true);

    const timer = setTimeout(() => {
      performSaveDraft();
    }, 1800);

    return () => clearTimeout(timer);
  }, [
    hasUserModified,
    hasUncompletedData,
    autoSaveDraftEnabled,
    rows,
    employeeName,
    employeeNumber,
    designation,
    branch,
    department,
    claimMonth,
    claimYear,
    claimDate,
    hourlyRate,
    daysPay,
    totalRemuneration,
    otPaymentDueB,
    isSpecialAssignedOt,
    selectedTemplateId,
  ]);

  const latestDraftDataRef = useRef({
    buildClaimRecord,
    autoSaveDraftEnabled,
    selectedUserId,
    claimYear,
    claimMonth,
    activeClaimId,
    activeClaimNumber,
  });

  useEffect(() => {
    latestDraftDataRef.current = {
      buildClaimRecord,
      autoSaveDraftEnabled,
      selectedUserId,
      claimYear,
      claimMonth,
      activeClaimId,
      activeClaimNumber,
    };
  });

  // Window unload / unmount fallback save: ONLY runs on actual unmount or window close,
  // and ONLY if the user actively modified something (hasUserModifiedRef.current is true)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const data = latestDraftDataRef.current;
      if (data.autoSaveDraftEnabled && !isSubmittedRef.current && hasUserModifiedRef.current) {
        const effectiveUid = toSafeStr(data.selectedUserId || currentUser?.uid || userProfile?.id, 'usr');
        const cleanUid = effectiveUid.replace(/[^a-zA-Z0-9_-]/g, '_');
        const deterministicDraftId = 'clm_draft_' + cleanUid + '_' + data.claimYear + '_' + toSafeStr(data.claimMonth).toLowerCase();
        const draft = data.buildClaimRecord('draft');
        draft.id = data.activeClaimId || initialClaim?.id || deterministicDraftId;
        draft.claimNumber = data.activeClaimNumber || initialClaim?.claimNumber || draft.claimNumber;
        saveClaim(draft);
        saveDraftClaim(draft, draft.userId);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      const data = latestDraftDataRef.current;
      if (data.autoSaveDraftEnabled && !isSubmittedRef.current && hasUserModifiedRef.current) {
        const effectiveUid = toSafeStr(data.selectedUserId || currentUser?.uid || userProfile?.id, 'usr');
        const cleanUid = effectiveUid.replace(/[^a-zA-Z0-9_-]/g, '_');
        const deterministicDraftId = 'clm_draft_' + cleanUid + '_' + data.claimYear + '_' + toSafeStr(data.claimMonth).toLowerCase();
        const draft = data.buildClaimRecord('draft');
        draft.id = data.activeClaimId || initialClaim?.id || deterministicDraftId;
        draft.claimNumber = data.activeClaimNumber || initialClaim?.claimNumber || draft.claimNumber;
        saveClaim(draft);
        saveDraftClaim(draft, draft.userId);
      }
    };
  }, []);

  // Trigger confirmation dialog for Save / Submit Claim
  const handleSaveClaim = () => {
    if (isSavingClaim || isGeneratingPdf) return;
    if (!validateForm()) return;
    if (!checkSundayOrHolidayReview('save')) return;
    setIsConfirmSaveClaimOpen(true);
  };

  // Triggered from inside PDF Preview modal: submit OT sheet just like direct Submit button
  const handleSaveClaimFromPreview = () => {
    if (isSavingClaim || isGeneratingPdf) return;
    if (!validateForm()) {
      setIsPreviewOpen(false);
      return;
    }
    setIsConfirmSaveClaimOpen(true);
  };

  // Commit Save Claim to Firestore after user confirmation
  const confirmCommitSaveClaim = async () => {
    if (isSavingClaim) return;
    setIsSavingClaim(true);
    isSubmittedRef.current = true;
    const claim = buildClaimRecord('submitted');

    // If finalizing an in-progress draft, mint a permanent claim ID and remove old draft from draft list
    let draftIdToDelete: string | null = null;
    if (toSafeStr(claim.id).startsWith('clm_draft_')) {
      draftIdToDelete = claim.id;
      const finalClaimId = 'clm_' + Date.now() + '_' + Math.floor(100 + Math.random() * 900);
      claim.id = finalClaimId;
    }

    try {
      saveClaim(claim);
      clearDraftClaim(claim.userId);
      if (draftIdToDelete) {
        deleteClaim(draftIdToDelete, claim.userId);
        try {
          await deleteDoc(doc(db, 'claims', draftIdToDelete));
        } catch (_) {}
      }
      await setDoc(doc(db, 'claims', claim.id), sanitizeFirestoreData(claim));

      // Record administrative audit log with comprehensive before vs after state comparison
      await recordAuditLog({
        action: initialClaim && initialClaim.status !== 'draft' ? 'CLAIM_UPDATE' : 'CLAIM_CREATE',
        actionLabel: initialClaim && initialClaim.status !== 'draft' ? 'Updated Overtime Claim Timesheet' : 'Submitted Overtime Claim Timesheet',
        targetType: 'claim',
        targetId: claim.id,
        targetDescription: `${claim.claimNumber} (${claim.employeeName} - ${claim.month}/${claim.year})`,
        beforeState: initialClaim
          ? {
              employeeName: initialClaim.employeeName,
              designation: initialClaim.designation,
              branch: initialClaim.branch,
              department: initialClaim.department,
              month: initialClaim.month,
              year: initialClaim.year,
              totalHoursFormatted: initialClaim.totalHoursFormatted,
              totalMinutes: initialClaim.totalMinutes,
              totalOtPayment: initialClaim.totalOtPayment,
              hourlyRate: initialClaim.hourlyRate,
              daysPay: initialClaim.daysPay,
              otDaysCount: initialClaim.otDaysCount,
              claimType: initialClaim.claimType,
              status: initialClaim.status,
            }
          : undefined,
        afterState: {
          employeeName: claim.employeeName,
          designation: claim.designation,
          branch: claim.branch,
          department: claim.department,
          month: claim.month,
          year: claim.year,
          totalHoursFormatted: claim.totalHoursFormatted,
          totalMinutes: claim.totalMinutes,
          totalOtPayment: claim.totalOtPayment,
          hourlyRate: claim.hourlyRate,
          daysPay: claim.daysPay,
          otDaysCount: claim.otDaysCount,
          claimType: claim.claimType,
          status: claim.status,
        },
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
      setIsPreviewOpen(false);
      if (onClaimSaved) onClaimSaved(claim);
      setTimeout(() => setClaimSavedSuccess(false), 3000);
    } catch (err) {
      isSubmittedRef.current = false;
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
    if (isGeneratingPdf || isSavingClaim) return;
    if (!validateForm()) return;
    if (!checkSundayOrHolidayReview('download')) return;
    setIsConfirmDownloadOpen(true);
  };

  // Triggered from inside PDF Preview modal: download & post as submitted just like direct Download button
  const handleDownloadFromPreview = () => {
    if (isGeneratingPdf || isSavingClaim) return;
    if (!validateForm()) {
      setIsPreviewOpen(false);
      return;
    }
    setIsConfirmDownloadOpen(true);
  };

  // Step 1: User confirmed download intent; Leaves, worked-but-no-OT days, and unclaimed holidays
  // are automatically excluded from printed PDF & submitted claim, so generate & submit directly.
  const handleConfirmDownloadStep1 = () => {
    setIsConfirmDownloadOpen(false);
    executeGenerateAndDownload(rows);
  };

  // Step 2: User confirmed removing No-OT days (kept for modal compatibility)
  const handleConfirmRemoveNoOtAndDownload = () => {
    setIsNoOtModalOpen(false);
    executeGenerateAndDownload(rows);
  };

  // Generates PDF, downloads file, and posts OT sheet as submitted
  const executeGenerateAndDownload = async (claimRows: OvertimeRow[]) => {
    setIsGeneratingPdf(true);
    isSubmittedRef.current = true;
    try {
      const claim = buildClaimRecord('submitted', claimRows);
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
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 10000);

      // If finalizing an in-progress draft, mint a permanent claim ID and remove old draft from draft list
      let draftIdToDelete: string | null = null;
      if (toSafeStr(claim.id).startsWith('clm_draft_')) {
        draftIdToDelete = claim.id;
        const finalClaimId = 'clm_' + Date.now() + '_' + Math.floor(100 + Math.random() * 900);
        claim.id = finalClaimId;
      }

      // Save finalized submitted claim and remove draft
      saveClaim(claim);
      clearDraftClaim(claim.userId);
      if (draftIdToDelete) {
        deleteClaim(draftIdToDelete, claim.userId);
        try {
          await deleteDoc(doc(db, 'claims', draftIdToDelete));
        } catch (_) {}
      }

      // Also save to Firestore database
      await setDoc(doc(db, 'claims', claim.id), sanitizeFirestoreData(claim));

      // Record administrative audit log for PDF generation/export
      await recordAuditLog({
        action: 'CLAIM_EXPORT_PDF',
        actionLabel: 'Exported & Submitted Official Claim Timesheet PDF',
        targetType: 'claim',
        targetId: claim.id,
        targetDescription: `${claim.claimNumber} (${claim.employeeName} - ${claim.month}/${claim.year})`,
        afterState: {
          filename,
          totalHours: claim.totalHoursFormatted,
          totalOtPayment: claim.totalOtPayment,
          month: claim.month,
          year: claim.year,
          status: claim.status,
        },
      });

      setClaimSavedSuccess(true);
      setIsPreviewOpen(false);
      if (onClaimSaved) onClaimSaved(claim);
      setTimeout(() => setClaimSavedSuccess(false), 3000);
    } catch (err: any) {
      isSubmittedRef.current = false;
      setValidationError('Failed to generate PDF download: ' + err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isBranchForbidden) {
    return (
      <div className="max-w-3xl mx-auto p-6 sm:p-8">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center mx-auto text-amber-700">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-amber-950">Branch Access Restricted</h2>
          <p className="text-sm text-amber-900/80 max-w-lg mx-auto leading-relaxed">
            Administrators can only prepare and view overtime sheets for users belonging to their own branch (<span className="font-bold text-amber-950">{userProfile?.branch || 'Unassigned'}</span>). This claim belongs to the <span className="font-bold text-amber-950">{initialClaim?.branch || 'another'}</span> branch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 pb-6">
      {/* Top Header & Claimant Profile Card */}
      <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {isOpClaim ? 'Timesheet & Out of Pocket Entry' : 'Timesheet & Overtime Entry'}
              </h1>
              {initialClaim?.status === 'draft' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>Draft</span>
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] border ${
                  isOpClaim
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                }`}
              >
                <Lock className="w-2.5 h-2.5 opacity-75" />
                <span>{claimFormMeta.shortLabel}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isOpClaim
                ? 'Log daily worked times and out-of-pocket allowances under Monthly Out of Pocket (Form 10610).'
                : 'Enter daily Time In, Time Out, and Duties to calculate overtime claims and generate print-ready A4 sheets.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {isSuperAdmin && onNavigateToDesigner && (
              <button
                type="button"
                onClick={onNavigateToDesigner}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer whitespace-nowrap"
              >
                Customize Form Layout
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Full Month Auto-Filled</span>
            </span>
          </div>
        </div>

        {/* Auto-Save Toggle Strip */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-3 min-w-0">
            <label
              className="relative inline-flex items-center cursor-pointer select-none shrink-0"
              title="Toggle automatic draft saving for uncompleted sheets"
            >
              <input
                type="checkbox"
                checked={autoSaveDraftEnabled}
                onChange={e => handleToggleAutoSave(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-indigo-600" />
            </label>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-900 text-xs">
                  Auto-save draft
                </span>
                {autoSaveDraftEnabled ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                    <Cloud className="w-3 h-3 text-emerald-600" />
                    <span>Enabled</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <CloudOff className="w-3 h-3 text-slate-400" />
                    <span>Paused</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {autoSaveDraftEnabled
                  ? 'Changes save automatically to Drafts and can be resumed anytime.'
                  : 'Automatic draft saving is paused for this session.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {isAutoSaving ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold text-[11px] border border-indigo-200">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Saving...</span>
              </span>
            ) : lastAutoSaveTime ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-600 font-medium text-[11px] border border-slate-200 tabular-nums">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Saved at {lastAutoSaveTime}</span>
              </span>
            ) : hasUnsavedChanges && autoSaveDraftEnabled && hasUserModified ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-medium text-[11px] border border-amber-200">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Unsaved changes</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Status Alerts & Error Banner */}
        {(initialClaim?.status === 'draft' || (toSafeStr(activeClaimId).startsWith('clm_draft_') && hasUserModified) || draftToastMessage) && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Draft in Progress:</strong> {activeClaimNumber || initialClaim?.claimNumber} ({claimMonth} {claimYear})
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 shrink-0">
              1 Draft / Month
            </span>
          </div>
        )}

        {initialClaim && initialClaim.status !== 'draft' && hasUnsavedChanges && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Editing Saved Claim:</strong> Uncommitted edits on <strong>{initialClaim.claimNumber}</strong> move to Drafts until resubmitted.
              </span>
            </div>
          </div>
        )}

        {draftToastMessage && (
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{draftToastMessage}</span>
          </div>
        )}

        {validationError && (
          <div
            ref={validationBannerRef}
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-900"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{validationError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {rowsWithIssues.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const firstIssue = rowsWithIssues[0];
                    const firstVal = getRowValidation(firstIssue);
                    if (viewMode === 'cards' && cardFilter !== 'all' && cardFilter !== 'issues') {
                      setCardFilter('all');
                    }
                    scrollToErrorTarget({ type: 'row', rowId: firstIssue.id, focusField: firstVal.focusTarget });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <span>Go to Error</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setValidationError(null)}
                className="font-semibold text-rose-700 hover:text-rose-900 px-1.5 py-1 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {claimSavedSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Overtime claim saved to database successfully!</span>
          </div>
        )}

        {/* Admin User Picker */}
        {isAdmin && allUsers.length > 0 && (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <label className="block font-semibold text-slate-700 mb-1.5">
              Admin: Prepare Claim for Employee
            </label>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {allUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.claimType === 'OP'
                    ? `${u.name} (${u.employeeNumber || u.pfNumber}) • OP (Form 10610)`
                    : `${u.name} (${u.employeeNumber || u.pfNumber}) • OT (Form 10756) • Shift: ${u.shiftStartTime || '08:00'}-${u.shiftEndTime || '16:45'} • Cap: ${u.maxOtHoursPerDay || 2.0}h`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Claimant Profile + Period + Special OT */}
        <div
          ref={employeeHeaderRef}
          className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 text-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold text-sm shrink-0 ${
                isOpClaim ? 'bg-emerald-600' : 'bg-indigo-600'
              }`}
            >
              {toSafeStr(employeeName).trim() ? toSafeStr(employeeName).trim().charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-sm truncate">
                  {employeeName || 'Staff Member'}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white text-indigo-700 font-mono font-bold text-[11px] border border-slate-200 tabular-nums">
                  {employeeNumber || 'PF Number'}
                </span>
                <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Profile Verified</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-slate-700">{designation || 'Staff Member'}</span>
                <span className="text-slate-300">&bull;</span>
                <span>{branch || 'Head Office'}</span>
                <span className="text-slate-300">&bull;</span>
                <span>{department || 'IT Operations'}</span>
                {!isOpClaim && (
                  <>
                    <span className="text-slate-300">&bull;</span>
                    <span className="font-medium text-slate-700 tabular-nums">
                      Shift {userShiftStartTime} – {userShiftEndTime}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-3 py-1.5">
              <label className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider">Period</label>
              <select
                value={claimMonth}
                onChange={e => handleMonthChange(e.target.value)}
                className="bg-transparent font-bold text-slate-800 text-xs focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                min={2000}
                max={2100}
                value={Number.isFinite(claimYear) ? claimYear : new Date().getFullYear()}
                onChange={e => handleYearChange(parseInt(e.target.value, 10) || new Date().getFullYear())}
                className="w-15 bg-transparent font-bold text-slate-800 text-xs font-mono tabular-nums text-center focus:outline-none border-l border-slate-200 pl-2"
              />
            </div>

            {!isOpClaim && (
              <button
                type="button"
                onClick={() => handleToggleSpecialAssignedOt(!isSpecialAssignedOt)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                  isSpecialAssignedOt
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
                title="Special Assigned OT (No limit / Col B)"
              >
                <Check className={`w-3.5 h-3.5 ${isSpecialAssignedOt ? 'text-white' : 'text-slate-400'}`} />
                <span>Special OT</span>
                {isSpecialAssignedOt && (
                  <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-mono">
                    No Limit
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Rates / OP Allowance Bar */}
      {isOpClaim ? (
        <div className="rounded-2xl p-4 border border-emerald-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <Banknote className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">
                Monthly Out of Pocket Allowance (Form 10610)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Isolated OP rules active under {claimFormMeta.templateName}. Daily overtime caps do not apply.
              </p>
            </div>
          </div>

          <div className="shrink-0 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Logged OP Amount
            </span>
            <span className="text-base sm:text-lg font-bold text-emerald-900 font-mono tabular-nums">
              Rs. {opSummary.totalAmountRs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRatesPanel(prev => !prev)}
            className="w-full px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`p-2 rounded-xl shrink-0 border ${
                  isTargetUserRatesLocked
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}
              >
                <Banknote className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">Overtime Payment Rates</h3>
                  {userRelevantRole && (
                    <span className="text-xs text-slate-500 font-medium">
                      &bull; {userRelevantRole.name}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      isTargetUserRatesLocked
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {isTargetUserRatesLocked ? (
                      <>
                        <Lock className="w-3 h-3" />
                        <span>Rates Locked</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3" />
                        <span>Editable</span>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums truncate">
                  Hourly: Rs. {hourlyRate !== '' && Number.isFinite(Number(hourlyRate)) ? Number(hourlyRate).toFixed(2) : '—'}
                  {' • '}Day&apos;s Pay: Rs. {daysPay !== '' && Number.isFinite(Number(daysPay)) ? Number(daysPay).toFixed(2) : '—'}
                  {isDaysPayOnlyNonWorking ? " • Non-Working: Day's Pay Only" : ''}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 shrink-0">
              <span>{showRatesPanel ? 'Hide Rates' : 'View / Edit Rates'}</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                  showRatesPanel ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {showRatesPanel && (
            <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-slate-100 space-y-3 bg-slate-50/40">
              {isTargetUserRatesLocked ? (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Rates are locked for <strong>{userRelevantRole?.name || designation || 'this designation'}</strong>. On non-working days (including Saturdays, Sundays &amp; Holidays), only <strong>Day&apos;s Pay</strong> applies.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                  <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Rates are unlocked for <strong>{userRelevantRole?.name || designation || 'your role'}</strong>.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 text-[11px]">
                      Working Days Hourly Rate <span className="text-rose-500">*</span>
                    </label>
                    {!canEditRates && <Lock className="w-3 h-3 text-slate-400" />}
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canEditRates}
                      readOnly={!canEditRates}
                      value={hourlyRate === '' || !Number.isFinite(Number(hourlyRate)) ? '' : hourlyRate}
                      onChange={e => {
                        if (!canEditRates) return;
                        setHourlyRate(toSafeRate(e.target.value));
                        markUserModified();
                      }}
                      placeholder="e.g. 1850.00"
                      className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono tabular-nums font-bold text-xs ${
                        !canEditRates
                          ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">Column A &amp; Weekday OT</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 text-[11px]">
                      Non-Working Days Payment <span className="text-rose-500">*</span>
                    </label>
                    {!canEditRates && <Lock className="w-3 h-3 text-slate-400" />}
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canEditRates}
                      readOnly={!canEditRates}
                      value={daysPay === '' || !Number.isFinite(Number(daysPay)) ? '' : daysPay}
                      onChange={e => {
                        if (!canEditRates) return;
                        setDaysPay(toSafeRate(e.target.value));
                        markUserModified();
                      }}
                      placeholder="e.g. 12500.00"
                      className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono tabular-nums font-bold text-xs ${
                        !canEditRates
                          ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">Sat (min 6h) / Sun / Holiday</span>
                </div>

                <div className={`rounded-xl border border-slate-200 bg-white p-3 space-y-1 ${isDaysPayOnlyNonWorking ? 'opacity-75' : ''}`}>
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 text-[11px]">
                      Non-Working Hourly Rate {!isDaysPayOnlyNonWorking && <span className="text-rose-500">*</span>}
                    </label>
                    {(!canEditRates || isDaysPayOnlyNonWorking) && <Lock className="w-3 h-3 text-slate-400" />}
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canEditRates || isDaysPayOnlyNonWorking}
                      readOnly={!canEditRates || isDaysPayOnlyNonWorking}
                      value={
                        isDaysPayOnlyNonWorking
                          ? ''
                          : hourlyRateNonWorkingDays === '' || !Number.isFinite(Number(hourlyRateNonWorkingDays))
                          ? ''
                          : hourlyRateNonWorkingDays
                      }
                      onChange={e => {
                        if (!canEditRates || isDaysPayOnlyNonWorking) return;
                        setHourlyRateNonWorkingDays(toSafeRate(e.target.value));
                        markUserModified();
                      }}
                      placeholder={isDaysPayOnlyNonWorking ? "N/A (Day's Pay only)" : 'e.g. 2312.50'}
                      className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono tabular-nums font-bold text-xs ${
                        !canEditRates || isDaysPayOnlyNonWorking
                          ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {isDaysPayOnlyNonWorking ? "Disabled for locked role" : 'Column B / Holiday override'}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 text-[11px]">
                      Monthly Remuneration
                    </label>
                    {!canEditRates && <Lock className="w-3 h-3 text-slate-400" />}
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">Rs.</span>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canEditRates}
                      readOnly={!canEditRates}
                      value={totalRemuneration === '' || !Number.isFinite(Number(totalRemuneration)) ? '' : totalRemuneration}
                      onChange={e => {
                        if (!canEditRates) return;
                        handleRemunerationChange(e.target.value);
                      }}
                      placeholder="e.g. 275000.00"
                      className={`w-full rounded-lg border py-1.5 pl-9 pr-2.5 font-mono tabular-nums text-xs ${
                        !canEditRates
                          ? 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed select-none'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">Pay/22 day, Day/8 hr</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isOpClaim ? (
          <>
            <div className="rounded-2xl bg-white p-3.5 sm:p-4 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Worked Duration
                </span>
                <Clock className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {opSummary.totalHoursFormatted}
                </span>
                <span className="text-xs text-slate-500">({opSummary.totalDecimalHours}h)</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Form 10610 elapsed hours</p>
            </div>

            <div className="rounded-2xl bg-white p-3.5 sm:p-4 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Logged Days
                </span>
                <Calendar className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {opSummary.loggedDaysCount}
                </span>
                <span className="text-xs text-slate-500">Days</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Out of Pocket entries</p>
            </div>

            <div className="rounded-2xl bg-white p-3.5 sm:p-4 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Allowance
                </span>
                <Banknote className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-1.5 tabular-nums">
                <span className="text-lg sm:text-xl font-bold text-emerald-700 font-mono">
                  Rs. {opSummary.totalAmountRs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Isolated Form 10610 total</p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-white p-3.5 sm:p-4 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Overtime
                </span>
                <Clock className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {summary.totalHoursFormatted}
                </span>
                <span className="text-xs text-slate-500">({summary.totalDecimalHours}h)</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] font-medium tabular-nums">
                <span className="text-indigo-600">Col A: {summary.colAFormatted}</span>
                <span className="text-slate-300">&bull;</span>
                <span className="text-emerald-700">Col B: {summary.colBFormatted}</span>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3.5 sm:p-4 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Days Claimed
                </span>
                <Calendar className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap tabular-nums">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {summary.otDaysCount}
                </span>
                <span className="text-xs text-slate-500">OT Days</span>
                {summary.daysPayCount > 0 && (
                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                    +{summary.daysPayCount} Day&apos;s Pay
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400 truncate">
                {summary.daysPayCount > 0
                  ? `${summary.daysPayCount} non-working Day's Pay${summary.cappedCount > 0 ? ` • ${summary.cappedCount} capped` : ''}`
                  : summary.cappedCount > 0
                  ? `${summary.cappedCount} days capped by limit`
                  : 'Within assigned limits'}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-3.5 sm:p-4 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Assigned Limit
                </span>
                <Layers className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-xl sm:text-2xl font-bold text-emerald-700 tracking-tight">
                  {maxOtLimitHours}h
                </span>
                <span className="text-xs text-slate-500">max / day</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 truncate">Configured per user profile</p>
            </div>
          </>
        )}

        <div className="rounded-2xl bg-indigo-50/70 p-3.5 sm:p-4 border border-indigo-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Month Generator</span>
            </div>
            <p className="text-[11px] text-indigo-800/80 mt-0.5">
              Populate dates for {claimMonth} {claimYear}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoFillMonth}
            className="mt-2.5 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
          >
            Auto Fill Month
          </button>
        </div>
      </div>

      {/* Daily Timesheet Entries Workspace */}
      <div
        ref={timesheetSectionRef}
        className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden"
      >
        {/* Default Reasons Strip */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-semibold text-slate-700 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider">
              <Tag className="w-3 h-3 text-amber-600" />
              <span>Defaults:</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <span className="text-slate-500">Mon–Fri:</span>
              <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {defaultWeekdayReason || '<Blank>'}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <span className="text-slate-500">Sat:</span>
              <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {defaultSaturdayReason || 'Saturday Duty'}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <span className="text-slate-500">Holidays:</span>
              <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {defaultHolidayReason || '<Holiday Name>'}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenDefaultReasonsModal}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Edit Defaults</span>
          </button>
        </div>

        {/* Timesheet Header & View Controls */}
        <div className="px-4 sm:px-5 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base font-bold text-slate-900">
              Daily Timesheet Entries
            </h2>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              ({rows.length} days)
            </span>
            {viewMode === 'cards' && visibleCardRows.length > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold tabular-nums">
                Card {Math.min(activeCarouselIdx + 1, visibleCardRows.length)} / {visibleCardRows.length}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenDefaultReasonsModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition whitespace-nowrap"
              title="Configure default reasons for Weekdays, Saturdays, and Holidays"
            >
              <Tag className="w-3.5 h-3.5 text-amber-600" />
              <span>Default Reasons</span>
            </button>

            {!isOpClaim && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-900 text-xs font-semibold cursor-pointer transition select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={isSpecialAssignedOt}
                  onChange={e => handleToggleSpecialAssignedOt(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-indigo-300 cursor-pointer"
                />
                <span>Special OT (No Limit)</span>
              </label>
            )}

            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-semibold border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer select-none whitespace-nowrap ${
                  viewMode === 'cards'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer select-none whitespace-nowrap ${
                  viewMode === 'table'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsConfirmResetOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              title="Reset timesheet rows"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Day</span>
            </button>
          </div>
        </div>

        {/* Horizontal Day Cards Carousel View */}
        {viewMode === 'cards' && (
          <div className="p-3.5 sm:p-5 bg-slate-50/70 border-b border-slate-200 space-y-3.5">
            {/* Filter Bar + Swipe Hint */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCardFilter('all')}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer select-none whitespace-nowrap ${
                    cardFilter === 'all'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  All ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCardFilter('claimed')}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer select-none inline-flex items-center gap-1.5 whitespace-nowrap ${
                    cardFilter === 'claimed'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{isOpClaim ? 'Logged' : 'Claimed OT'}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                      cardFilter === 'claimed' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {rows.filter(isClaimedRow).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCardFilter('weekdays')}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer select-none whitespace-nowrap ${
                    cardFilter === 'weekdays'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Weekdays ({rows.filter(r => isWeekdayWorkingDay(r)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setCardFilter('nonworking')}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer select-none whitespace-nowrap ${
                    cardFilter === 'nonworking'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Sat &amp; Holidays ({rows.filter(r => isOtherDayRow(r)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setCardFilter('leaves')}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer select-none inline-flex items-center gap-1.5 whitespace-nowrap ${
                    cardFilter === 'leaves'
                      ? 'bg-sky-600 text-white font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>Leaves</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                      cardFilter === 'leaves' ? 'bg-white/25 text-white' : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {rows.filter(isRowLeave).length}
                  </span>
                </button>
                {showValidationAttention && rowsWithIssuesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCardFilter('issues')}
                    className={`px-3 py-1.5 rounded-xl transition cursor-pointer select-none inline-flex items-center gap-1.5 whitespace-nowrap ${
                      cardFilter === 'issues'
                        ? 'bg-rose-600 text-white font-bold'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-300'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Issues ({rowsWithIssuesCount})</span>
                  </button>
                )}
              </div>

              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <span>Swipe, drag, or use arrows &bull; Auto-advances on complete date</span>
              </div>
            </div>

            {/* Issue Callout Banner */}
            {showValidationAttention && rowsWithIssuesCount > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs text-rose-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>{rowsWithIssuesCount} {rowsWithIssuesCount === 1 ? 'date needs' : 'dates need'} attention</strong> before submitting or downloading.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const firstIssue = rowsWithIssues[0];
                      if (firstIssue) {
                        const firstVal = getRowValidation(firstIssue);
                        if (cardFilter !== 'all' && cardFilter !== 'issues') {
                          setCardFilter('all');
                        }
                        scrollToErrorTarget({ type: 'row', rowId: firstIssue.id, focusField: firstVal.focusTarget });
                      }
                    }}
                    className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1 rounded-lg transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <span>Jump to Error</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  {cardFilter !== 'issues' && (
                    <button
                      type="button"
                      onClick={() => setCardFilter('issues')}
                      className="text-xs font-semibold text-rose-900 bg-rose-200/80 hover:bg-rose-300 px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap"
                    >
                      Filter ({rowsWithIssuesCount})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Empty State when filtered */}
            {visibleCardRows.length === 0 && (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                {cardFilter === 'issues' ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                    <p className="font-bold text-sm text-emerald-900">All day cards are valid!</p>
                    <p className="text-xs text-slate-500 mt-1">No missing fields or conflicting entries detected.</p>
                  </>
                ) : (
                  <>
                    <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-bold text-sm text-slate-800">No days match this filter</p>
                    <p className="text-xs text-slate-500 mt-1">Switch back to All Days to view your full monthly entries.</p>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setCardFilter('all')}
                  className="mt-3 px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition cursor-pointer"
                >
                  View All Days
                </button>
              </div>
            )}

            {/* Horizontal Scroll Carousel with Middle-Left & Middle-Right Floating Arrow Buttons */}
            {visibleCardRows.length > 0 && (
              <div className="relative group/carousel">
                {/* Middle-Left Arrow Button */}
                <button
                  type="button"
                  onClick={() => scrollCarouselByStep('left')}
                  disabled={!canScrollLeft}
                  aria-label="Scroll left to previous dates"
                  title="Previous date"
                  className={`absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center border backdrop-blur-md transition-all duration-200 ${
                    canScrollLeft
                      ? 'bg-white/95 border-slate-200 text-slate-700 shadow-lg hover:bg-indigo-600 hover:text-white hover:border-indigo-600 hover:scale-105 active:scale-95 cursor-pointer opacity-100'
                      : 'bg-white/60 border-slate-200/60 text-slate-300 shadow-xs cursor-not-allowed opacity-40 pointer-events-none'
                  }`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Middle-Right Arrow Button */}
                <button
                  type="button"
                  onClick={() => scrollCarouselByStep('right')}
                  disabled={!canScrollRight}
                  aria-label="Scroll right to next dates"
                  title="Next date"
                  className={`absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center border backdrop-blur-md transition-all duration-200 ${
                    canScrollRight
                      ? 'bg-white/95 border-slate-200 text-slate-700 shadow-lg hover:bg-indigo-600 hover:text-white hover:border-indigo-600 hover:scale-105 active:scale-95 cursor-pointer opacity-100'
                      : 'bg-white/60 border-slate-200/60 text-slate-300 shadow-xs cursor-not-allowed opacity-40 pointer-events-none'
                  }`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Horizontal Scroll Track (Swipe + Drag + Arrows) */}
                <div
                  ref={horizontalScrollRef}
                  onScroll={updateHorizontalScrollState}
                  onMouseDown={handleCarouselMouseDown}
                  onTouchStart={cancelHorizontalAnimation}
                  onWheel={e => {
                    if (Math.abs(e.deltaX) > 2) {
                      cancelHorizontalAnimation();
                    }
                  }}
                  className="flex items-stretch gap-3.5 sm:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory touch-pan-x px-3 sm:px-6 py-2 select-none"
                >
                  {visibleCardRows.map(({ row, originalIndex: index }, cardIdx) => {
                    const val = getRowValidation(row);
                    const hasVisualIssue = showValidationAttention && val.hasIssue;
                    const isScrolledTarget = highlightedErrorRowId === row.id && val.hasIssue;
                    const isLeave = Boolean(row.isLeave);
                    const hasOt = !isLeave && (row.totalMinutes || 0) > 0;
                    const isSat = row.dayOfWeek === 'Sat' || getDayOfWeek(row.date) === 'Sat';
                    const isSun = row.dayOfWeek === 'Sun' || getDayOfWeek(row.date) === 'Sun';
                    const isHol = isRowHoliday(row);
                    const isOther = !isLeave && (isSat || isSun || isHol);
                    const isRowSpecial = row.isSpecialAssignment ?? isSpecialAssignedOt;
                    const holidayInfo = holidayMap.get(row.date);
                    const dayStatus: 'workday' | 'leave' | 'holiday' = isLeave ? 'leave' : isHol ? 'holiday' : 'workday';
                    const hasWorkedNoOt =
                      !isLeave &&
                      !(isHol && !row.isHolidayOverride) &&
                      !isOther &&
                      Boolean(row.startTime && row.endTime) &&
                      (row.totalMinutes || 0) === 0;
                    const isCompleteCard = isRowCompleteWithData(row);
                    const isActiveCard = cardIdx === activeCarouselIdx;

                    return (
                      <div
                        key={row.id}
                        ref={el => {
                          rowElementRefs.current[row.id] = el;
                        }}
                        className={`flex-none w-[86%] min-w-[266px] sm:w-[345px] md:w-[365px] lg:w-[380px] snap-center sm:snap-start rounded-2xl border p-4 bg-white transition-all flex flex-col justify-between space-y-3 select-text ${
                          isScrolledTarget
                            ? 'border-rose-500 ring-4 ring-rose-400/40 bg-rose-50/20 shadow-md'
                            : hasVisualIssue
                            ? 'border-rose-400 ring-2 ring-rose-300/60 bg-rose-50/10'
                            : isLeave
                            ? 'border-sky-300 bg-sky-50/20'
                            : hasOt
                            ? 'border-indigo-300 shadow-xs'
                            : isSat
                            ? 'border-amber-200'
                            : isSun
                            ? 'border-purple-200'
                            : isHol
                            ? 'border-rose-200'
                            : isActiveCard
                            ? 'border-slate-300 shadow-xs'
                            : 'border-slate-200'
                        }`}
                      >
                        {/* 1. Card Top Bar */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="font-mono tabular-nums text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              #{index + 1}
                            </span>

                            <input
                              ref={el => {
                                dateInputRefs.current[row.id] = el;
                              }}
                              type="date"
                              value={toSafeStr(row.date)}
                              onChange={e => updateRowField(index, 'date', e.target.value)}
                              className={`font-mono tabular-nums text-xs font-semibold px-2 py-1 rounded-lg border bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                hasVisualIssue && val.isDuplicateDate
                                  ? 'border-rose-500 bg-rose-50 text-rose-900 ring-1 ring-rose-400'
                                  : 'border-slate-200'
                              }`}
                            />

                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${
                                isLeave
                                  ? 'bg-sky-100 text-sky-800'
                                  : isHol
                                  ? 'bg-rose-100 text-rose-800'
                                  : isSun
                                  ? 'bg-purple-100 text-purple-800'
                                  : isSat
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {row.dayOfWeek || '-'}
                            </span>

                            {isCompleteCard && !hasVisualIssue && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700"
                                title="Date complete (Time In, Time Out, and Duties)"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              </span>
                            )}

                            {hasVisualIssue && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                <span>{val.primaryIssue}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(index)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title="Duplicate day entry"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(index)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Delete day"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* 1B. Day Status Selector */}
                        <div className="flex items-center justify-between gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setRowDayStatus(index, 'workday')}
                            className={`flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg transition cursor-pointer ${
                              dayStatus === 'workday'
                                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Briefcase className="w-3 h-3 shrink-0" />
                            <span>Workday</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowDayStatus(index, 'leave')}
                            className={`flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg transition cursor-pointer ${
                              dayStatus === 'leave'
                                ? 'bg-sky-600 text-white shadow-2xs font-bold'
                                : 'text-slate-600 hover:text-sky-700'
                            }`}
                          >
                            <CalendarOff className="w-3 h-3 shrink-0" />
                            <span>Leave</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowDayStatus(index, 'holiday')}
                            className={`flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg transition cursor-pointer ${
                              dayStatus === 'holiday'
                                ? 'bg-rose-600 text-white shadow-2xs font-bold'
                                : 'text-slate-600 hover:text-rose-700'
                            }`}
                          >
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Holiday</span>
                          </button>
                        </div>

                        {/* Leave Mode Panel */}
                        {isLeave && (
                          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 space-y-2.5 text-xs flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sky-900 inline-flex items-center gap-1.5">
                                <CalendarOff className="w-3.5 h-3.5 text-sky-600" />
                                <span>On Leave</span>
                              </span>
                              <span className="text-[10px] font-semibold text-sky-700">
                                Excluded from PDF
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 items-center">
                              <label className="text-[11px] font-semibold text-slate-600">Leave Type:</label>
                              <select
                                value={row.leaveType || 'Full Day'}
                                onChange={e => updateRowLeaveType(index, e.target.value)}
                                className="rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                              >
                                <option value="Full Day">Full Day Leave</option>
                                <option value="Half Day">Half Day Leave</option>
                                <option value="Annual Leave">Annual Leave</option>
                                <option value="Casual Leave">Casual Leave</option>
                                <option value="Medical Leave">Medical Leave</option>
                                <option value="Short Leave">Short Leave</option>
                              </select>
                            </div>

                            <input
                              type="text"
                              value={toSafeStr(row.reason)}
                              onChange={e => updateRowField(index, 'reason', e.target.value)}
                              placeholder="Optional leave note (not printed)..."
                              className="w-full rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                          </div>
                        )}

                        {/* Holiday Banner */}
                        {!isLeave && isHol && (
                          <div
                            className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition ${
                              row.isHolidayOverride
                                ? 'bg-amber-50 border-amber-300 text-amber-950'
                                : 'bg-rose-50/70 border-rose-200 text-rose-900'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold truncate">
                                {row.holidayName || holidayInfo?.name || (isSun ? 'Sunday' : 'Public Holiday')}
                              </p>
                              <p className="text-[10px] opacity-85">
                                {row.isHolidayOverride
                                  ? isDaysPayOnlyNonWorking
                                    ? "Worked on holiday — Day's Pay (No OT hours)"
                                    : 'Worked on holiday — enter duties & times below'
                                  : "Holiday off-day (won't print on sheet)"}
                              </p>
                            </div>
                            <label className="flex items-center gap-2 pt-1 border-t border-black/10 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!row.isHolidayOverride}
                                onChange={() => toggleHolidayOverride(index)}
                                className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 border-amber-400 cursor-pointer"
                              />
                              <span className="text-[11px] font-bold">
                                {row.isHolidayOverride
                                  ? isDaysPayOnlyNonWorking
                                    ? "Claiming Day's Pay (Active)"
                                    : 'Claiming Holiday OT (Active)'
                                  : isDaysPayOnlyNonWorking
                                  ? "I worked on this holiday — Claim Day's Pay"
                                  : 'I worked on this holiday — Claim OT'}
                              </span>
                            </label>
                          </div>
                        )}

                        {/* 2 & 3. Duties + Times */}
                        {!isLeave && (
                          <>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <label className="font-semibold text-slate-700">
                                  Duties / Nature of Work
                                </label>
                                {isSat && !row.reason && (
                                  <span className="text-[10px] text-amber-700 font-medium">Saturday Duty</span>
                                )}
                              </div>
                              <input
                                ref={el => {
                                  reasonInputRefs.current[row.id] = el;
                                }}
                                type="text"
                                disabled={isHol && !row.isHolidayOverride}
                                value={toSafeStr(row.reason)}
                                onChange={e => updateRowField(index, 'reason', e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (reasonIdleTimerRef.current) {
                                      clearTimeout(reasonIdleTimerRef.current);
                                      reasonIdleTimerRef.current = null;
                                    }
                                    pendingReasonBlurAdvanceRef.current = null;
                                    e.currentTarget.blur();
                                    if (isRowCompleteWithData(row)) {
                                      autoScrollToNextCard(row.id);
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  if (reasonIdleTimerRef.current) {
                                    clearTimeout(reasonIdleTimerRef.current);
                                    reasonIdleTimerRef.current = null;
                                  }
                                  if (
                                    pendingReasonBlurAdvanceRef.current === row.id &&
                                    openTimePickerCountRef.current === 0 &&
                                    isRowCompleteWithData(row)
                                  ) {
                                    pendingReasonBlurAdvanceRef.current = null;
                                    autoScrollToNextCard(row.id);
                                  }
                                }}
                                placeholder={
                                  isHol && !row.isHolidayOverride
                                    ? 'Tick "I worked on this holiday" above to edit'
                                    : isSat && !isOpClaim
                                    ? 'Saturday Duty...'
                                    : 'Enter duties performed...'
                                }
                                className={`w-full rounded-xl border px-3 py-2 text-xs transition ${
                                  hasVisualIssue && val.isMissingReason
                                    ? 'border-rose-500 ring-2 ring-rose-300 bg-rose-50/40 text-slate-900 focus:border-rose-600'
                                    : isHol && !row.isHolidayOverride
                                    ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none'
                                    : 'border-slate-200 bg-white text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                                }`}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                  <span>Time In</span>
                                </label>
                                <ScrollableTimePicker
                                  isTimeIn={true}
                                  disabled={isHol && !row.isHolidayOverride}
                                  value={isHol && !row.isHolidayOverride ? '' : row.startTime}
                                  onChange={val => updateRowField(index, 'startTime', val)}
                                  onOpenChange={open => handleTimePickerOpenChange(row.id, open)}
                                  label="Time In (Start)"
                                  placeholder="Select In"
                                />
                              </div>

                              <div>
                                <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                                  <span>Time Out</span>
                                </label>
                                <ScrollableTimePicker
                                  isTimeIn={false}
                                  disabled={isHol && !row.isHolidayOverride}
                                  value={isHol && !row.isHolidayOverride ? '' : row.endTime}
                                  onChange={val => updateRowField(index, 'endTime', val)}
                                  onOpenChange={open => handleTimePickerOpenChange(row.id, open)}
                                  label="Time Out (End)"
                                  placeholder="Select Out"
                                  disableSession={isOpClaim ? null : row.startTime ? parse24To12(row.startTime).period : null}
                                  autoSession={
                                    isOpClaim
                                      ? 'PM'
                                      : row.startTime
                                      ? parse24To12(row.startTime).period === 'AM'
                                        ? 'PM'
                                        : 'AM'
                                      : 'PM'
                                  }
                                />
                              </div>
                            </div>

                            {/* Friendly Inline Error Guidance */}
                            {hasVisualIssue && val.friendlyMessage && (
                              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-[11px] space-y-2">
                                <div className="flex items-start gap-1.5 font-semibold">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                  <span>{val.friendlyMessage}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {val.hasSameSession && (
                                    <button
                                      type="button"
                                      onClick={() => fixSameSessionRow(index)}
                                      className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] cursor-pointer transition"
                                    >
                                      Switch Out to {row.startTime && parse24To12(row.startTime).period === 'AM' ? 'PM' : 'AM'}
                                    </button>
                                  )}
                                  {val.isMissingTimeIn && (
                                    <button
                                      type="button"
                                      onClick={() => updateRowField(index, 'startTime', userShiftStartTime || GENERAL_SHIFT_START)}
                                      className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] cursor-pointer transition"
                                    >
                                      Set Time In ({userShiftStartTime || GENERAL_SHIFT_START})
                                    </button>
                                  )}
                                  {val.isMissingReason && defaultWeekdayReason && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateRowField(index, 'reason', isSat ? defaultSaturdayReason || 'Saturday Duty' : defaultWeekdayReason)
                                      }
                                      className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] cursor-pointer transition"
                                    >
                                      Fill Default Duties
                                    </button>
                                  )}
                                  {val.isHolidayNotOverridden && (
                                    <button
                                      type="button"
                                      onClick={() => toggleHolidayOverride(index)}
                                      className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] cursor-pointer transition"
                                    >
                                      Enable Holiday Claim
                                    </button>
                                  )}
                                  {val.isDuplicateDate && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRow(index)}
                                      className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] cursor-pointer transition"
                                    >
                                      Remove Duplicate
                                    </button>
                                  )}
                                  {(val.isMissingTimeOut || val.isMissingTimeIn || val.isZeroDuration || val.isHolidayNotOverridden) && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => clearRowEntry(index)}
                                        className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-[10px] cursor-pointer inline-flex items-center gap-1 transition"
                                      >
                                        <Eraser className="w-2.5 h-2.5" />
                                        <span>Clear Times</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRowDayStatus(index, 'leave')}
                                        className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-semibold text-[10px] cursor-pointer transition"
                                      >
                                        Mark Leave
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            {!isOpClaim && hasWorkedNoOt && (
                              <div className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-600">
                                Normal shift / &lt;15m OT (0:00 OT) — will not print on sheet
                              </div>
                            )}

                            {/* 4. Card Bottom Strip */}
                            {isOpClaim ? (
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 flex-wrap text-xs">
                                <div className="flex items-center gap-1.5 flex-wrap tabular-nums">
                                  {row.totalWorkMinutes > 0 ? (
                                    <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                      {formatMinutesToTime(row.totalWorkMinutes, otDisplayFormat)} worked
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">No hours logged</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">Rs.</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    disabled={isHol && !row.isHolidayOverride}
                                    value={row.daysPaymentAmount ? row.daysPaymentAmount : ''}
                                    onChange={e => updateRowField(index, 'daysPaymentAmount', e.target.value)}
                                    placeholder="0.00"
                                    className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums font-bold text-slate-800 text-right focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 flex-wrap text-xs">
                                <div className="flex items-center gap-1.5 flex-wrap tabular-nums">
                                  {row.totalWorkMinutes > 0 ? (
                                    <span className="text-[11px] font-mono font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                      {formatMinutesToTime(row.totalWorkMinutes, 'hhmm')} worked
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">—</span>
                                  )}

                                  {isDaysPayOnlyNonWorking && isOther ? (
                                    row.totalWorkMinutes > 0 && !(isHol && !row.isHolidayOverride) ? (
                                      isSat && row.totalWorkMinutes < 360 ? (
                                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200">
                                          Worked &lt; 6h (Min 6h Day&apos;s Pay &bull; No OT)
                                        </span>
                                      ) : (
                                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-900 border-amber-300">
                                          Day&apos;s Pay Only (No OT hrs)
                                        </span>
                                      )
                                    ) : null
                                  ) : row.isHolidayOverride && hasOt ? (
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      Col B: {row.totalFormatted}
                                    </span>
                                  ) : isRowSpecial && hasOt ? (
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      Col B: {row.totalFormatted} (Special)
                                    </span>
                                  ) : hasOt ? (
                                    <div className="flex items-center gap-1">
                                      {isOther ? (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-900 border-amber-300">
                                          Day&apos;s Pay + ({row.totalFormatted} OT)
                                        </span>
                                      ) : (
                                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                          Col A: {row.totalFormatted}
                                        </span>
                                      )}
                                      {row.isLateDisqualified && (
                                        <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 rounded border border-rose-200">
                                          Late 0 OT
                                        </span>
                                      )}
                                    </div>
                                  ) : isOther && row.totalWorkMinutes > 0 && !(isHol && !row.isHolidayOverride) ? (
                                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">
                                      Day&apos;s Pay
                                    </span>
                                  ) : null}
                                </div>

                                {isDaysPayOnlyNonWorking && isOther ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200 select-none"
                                    title="Locked designation: Day's Pay only on non-working days including Saturdays"
                                  >
                                    <Lock className="w-3 h-3 text-amber-600" />
                                    <span>Day&apos;s Pay Only</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => updateRowField(index, 'isSpecialAssignment', !isRowSpecial)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer select-none ${
                                      isRowSpecial
                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                    title="Special Assigned OT (Column B, no daily limit)"
                                  >
                                    <Check className={`w-3 h-3 ${isRowSpecial ? 'text-white' : 'text-slate-300'}`} />
                                    <span>Special OT</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Day Scrubber / Progress Strip */}
            {visibleCardRows.length > 1 && (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 px-0.5">
                  {visibleCardRows.map(({ row }, idx) => {
                    const rowVal = getRowValidation(row);
                    const hasIssue = showValidationAttention && rowVal.hasIssue;
                    const isCurrent = idx === activeCarouselIdx;
                    const isDone = isRowCompleteWithData(row);
                    const dayNum = toSafeStr(row.date).split('-')[2] || String(idx + 1).padStart(2, '0');
                    const isHol = isRowHoliday(row);

                    let chipStyle =
                      'bg-white text-slate-600 border-slate-200 hover:bg-slate-100';
                    if (hasIssue) {
                      chipStyle = 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
                    } else if (row.isLeave) {
                      chipStyle = 'bg-sky-50 text-sky-700 border-sky-200';
                    } else if (isDone || (row.totalMinutes || 0) > 0) {
                      chipStyle = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold';
                    } else if (isHol) {
                      chipStyle = 'bg-rose-50/60 text-rose-600 border-rose-200/80';
                    }

                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => scrollToCardByRowId(row.id, 500)}
                        title={`${row.date || `Day ${idx + 1}`} (${row.dayOfWeek || ''})`}
                        className={`flex-none h-7 min-w-[30px] px-1.5 rounded-lg border text-[11px] font-mono tabular-nums transition cursor-pointer ${chipStyle} ${
                          isCurrent ? 'ring-2 ring-indigo-600 ring-offset-1 font-bold text-indigo-900 bg-indigo-50 border-indigo-400' : ''
                        }`}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 text-center md:hidden">
                  Swipe or tap arrows to switch dates &bull; Auto-advances once filled
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabular Spreadsheet View */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto w-full border-b border-slate-200 bg-white">
            <table className={`w-full ${isOpClaim ? 'min-w-[820px]' : 'min-w-[920px]'} table-fixed text-left border-collapse text-xs`}>
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2 px-1 w-8 text-center">#</th>
                  <th className="py-2 px-1.5 w-32">Date &amp; Day</th>
                  <th className="py-2 px-1.5 w-40 text-center">Day Status</th>
                  <th className="py-2 px-2">Duties / Nature of Work</th>
                  <th className="py-2 px-1 w-28 text-center">Time In</th>
                  <th className="py-2 px-1 w-28 text-center">Time Out</th>
                  <th className="py-2 px-1 w-16 text-center">Worked</th>
                  {isOpClaim ? (
                    <th className="py-2 px-2 w-28 text-center">OP Amount (Rs.)</th>
                  ) : (
                    <>
                      <th className="py-2 px-1 w-28 text-center" title="Column A: Regular Overtime">OT (A)</th>
                      <th className="py-2 px-1 w-16 text-center" title="Column B: Special & Holiday Overtime">OT (B)</th>
                      <th className="py-2 px-1 w-20 text-center" title="Toggle Special Assigned OT">Special OT</th>
                    </>
                  )}
                  <th className="py-2 px-1 w-8 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {rows.map((row, index) => {
                  const val = getRowValidation(row);
                  const hasVisualIssue = showValidationAttention && val.hasIssue;
                  const isScrolledTarget = highlightedErrorRowId === row.id && val.hasIssue;
                  const isLeave = Boolean(row.isLeave);
                  const hasOt = !isLeave && row.totalMinutes > 0;
                  const isSat = row.dayOfWeek === 'Sat' || getDayOfWeek(row.date) === 'Sat';
                  const isSun = row.dayOfWeek === 'Sun' || getDayOfWeek(row.date) === 'Sun';
                  const isHol = isRowHoliday(row);
                  const isOther = !isLeave && (isSat || isSun || isHol);
                  const isRowSpecial = row.isSpecialAssignment ?? isSpecialAssignedOt;
                  const dayStatus: 'workday' | 'leave' | 'holiday' = isLeave ? 'leave' : isHol ? 'holiday' : 'workday';

                  return (
                    <tr
                      key={row.id}
                      ref={el => {
                        rowElementRefs.current[row.id] = el;
                      }}
                      className={`transition-colors ${
                        isScrolledTarget
                          ? 'bg-rose-100/80 ring-2 ring-inset ring-rose-400'
                          : hasVisualIssue
                          ? 'bg-rose-50/70 hover:bg-rose-100/60'
                          : isLeave
                          ? 'bg-sky-50/50 hover:bg-sky-50/80'
                          : hasOt
                          ? 'bg-indigo-50/20 hover:bg-slate-50/80'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2 px-1 text-center text-slate-400 font-mono tabular-nums text-[11px]">
                        <div className="flex items-center justify-center gap-1">
                          <span>{index + 1}</span>
                          {hasVisualIssue && (
                            <span title={val.friendlyMessage || val.primaryIssue || 'Issue'} className="cursor-help">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600 inline" />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            ref={el => {
                              if (viewMode === 'table') dateInputRefs.current[row.id] = el;
                            }}
                            type="date"
                            value={toSafeStr(row.date)}
                            onChange={e => updateRowField(index, 'date', e.target.value)}
                            className={`w-full min-w-0 rounded-md border bg-white px-1 py-1 text-xs text-slate-800 font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                              hasVisualIssue && val.isDuplicateDate ? 'border-rose-500 bg-rose-50' : 'border-slate-200'
                            }`}
                          />
                          <span
                            className={`inline-block px-1 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              isLeave
                                ? 'bg-sky-100 text-sky-800'
                                : isHol
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

                      <td className="py-2 px-1.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <select
                            value={dayStatus}
                            onChange={e => setRowDayStatus(index, e.target.value as 'workday' | 'leave' | 'holiday')}
                            className={`w-full rounded-md border px-1.5 py-1 text-[11px] font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                              dayStatus === 'leave'
                                ? 'border-sky-300 bg-sky-100 text-sky-900'
                                : dayStatus === 'holiday'
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <option value="workday">Workday</option>
                            <option value="leave">Leave</option>
                            <option value="holiday">Holiday</option>
                          </select>

                          {isLeave && (
                            <select
                              value={row.leaveType || 'Full Day'}
                              onChange={e => updateRowLeaveType(index, e.target.value)}
                              className="w-full rounded-md border border-sky-200 bg-white px-1 py-0.5 text-[10px] font-semibold text-sky-900 cursor-pointer"
                            >
                              <option value="Full Day">Full Day</option>
                              <option value="Half Day">Half Day</option>
                              <option value="Annual Leave">Annual</option>
                              <option value="Casual Leave">Casual</option>
                              <option value="Medical Leave">Medical</option>
                              <option value="Short Leave">Short Leave</option>
                            </select>
                          )}

                          {!isLeave && isHol && (
                            <label
                              className={`w-full inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold cursor-pointer select-none transition ${
                                row.isHolidayOverride
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={!!row.isHolidayOverride}
                                onChange={() => toggleHolidayOverride(index)}
                                className="w-3 h-3 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                              />
                              <span>
                                {row.isHolidayOverride
                                  ? isDaysPayOnlyNonWorking
                                    ? "Day's Pay"
                                    : 'Claiming OT'
                                  : isDaysPayOnlyNonWorking
                                  ? "Day's Pay?"
                                  : 'Claim OT?'}
                              </span>
                            </label>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-2">
                        <input
                          ref={el => {
                            if (viewMode === 'table') reasonInputRefs.current[row.id] = el;
                          }}
                          type="text"
                          disabled={!isLeave && isHol && !row.isHolidayOverride}
                          value={toSafeStr(row.reason)}
                          onChange={e => updateRowField(index, 'reason', e.target.value)}
                          placeholder={
                            isLeave
                              ? `Leave note (${row.leaveType || 'Full Day'})...`
                              : isHol && !row.isHolidayOverride
                              ? 'Holiday off-day (tick Claim OT to edit)'
                              : isSat
                              ? 'Saturday Duty...'
                              : 'Duties performed...'
                          }
                          className={`w-full rounded-md border px-2 py-1 text-xs truncate focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                            hasVisualIssue && val.isMissingReason
                              ? 'border-rose-500 bg-rose-50 text-rose-900'
                              : !isLeave && isHol && !row.isHolidayOverride
                              ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none'
                              : 'border-slate-200 bg-white text-slate-800'
                          }`}
                        />
                        {hasVisualIssue && val.friendlyMessage && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-rose-700">
                            <span className="truncate">{val.friendlyMessage}</span>
                            {val.hasSameSession && (
                              <button
                                type="button"
                                onClick={() => fixSameSessionRow(index)}
                                className="shrink-0 px-1.5 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                              >
                                Fix AM/PM
                              </button>
                            )}
                            {(val.isMissingTimeOut || val.isZeroDuration) && (
                              <button
                                type="button"
                                onClick={() => clearRowEntry(index)}
                                className="shrink-0 px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 hover:bg-slate-300 cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-1 text-center min-w-[130px]">
                        {isLeave ? (
                          <span className="text-[11px] font-semibold text-sky-700">On Leave</span>
                        ) : (
                          <ScrollableTimePicker
                            isTimeIn={true}
                            disabled={isHol && !row.isHolidayOverride}
                            value={isHol && !row.isHolidayOverride ? '' : row.startTime}
                            onChange={val => updateRowField(index, 'startTime', val)}
                            onOpenChange={open => handleTimePickerOpenChange(row.id, open)}
                            label="Time In (Start)"
                            placeholder="Time In"
                          />
                        )}
                      </td>

                      <td className="py-2 px-1 text-center min-w-[130px]">
                        {isLeave ? (
                          <span className="text-[11px] text-slate-400">—</span>
                        ) : (
                          <ScrollableTimePicker
                            isTimeIn={false}
                            disabled={isHol && !row.isHolidayOverride}
                            value={isHol && !row.isHolidayOverride ? '' : row.endTime}
                            onChange={val => updateRowField(index, 'endTime', val)}
                            onOpenChange={open => handleTimePickerOpenChange(row.id, open)}
                            label="Time Out (End)"
                            placeholder="Time Out"
                            disableSession={isOpClaim ? null : row.startTime ? parse24To12(row.startTime).period : null}
                            autoSession={
                              isOpClaim
                                ? 'PM'
                                : row.startTime
                                ? parse24To12(row.startTime).period === 'AM'
                                  ? 'PM'
                                  : 'AM'
                                : 'PM'
                            }
                          />
                        )}
                      </td>

                      <td className="py-2 px-1 text-center font-mono tabular-nums text-[11px] text-slate-600">
                        {!isLeave && row.isHolidayOverride && row.totalWorkMinutes > 0 ? (
                          <span className="font-bold text-amber-800">{formatMinutesToTime(row.totalWorkMinutes, 'hhmm')}</span>
                        ) : !isLeave && row.totalWorkMinutes > 0 ? (
                          <span>{formatMinutesToTime(row.totalWorkMinutes, 'hhmm')}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {isOpClaim ? (
                        <td className="py-2 px-1.5 text-center">
                          {isLeave ? (
                            <span className="text-[10px] font-semibold text-sky-700">Excluded</span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={isHol && !row.isHolidayOverride}
                              value={row.daysPaymentAmount ? row.daysPaymentAmount : ''}
                              onChange={e => updateRowField(index, 'daysPaymentAmount', e.target.value)}
                              placeholder="0.00"
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums font-bold text-slate-800 text-right focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          )}
                        </td>
                      ) : (
                        <>
                          <td className="py-2 px-1 text-center font-mono tabular-nums text-xs font-bold">
                            {isLeave ? (
                              <span className="text-[10px] font-semibold text-sky-700">Excluded</span>
                            ) : isDaysPayOnlyNonWorking && isOther ? (
                              row.totalWorkMinutes > 0 && !(isHol && !row.isHolidayOverride) ? (
                                isSat && row.totalWorkMinutes < 360 ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold font-sans whitespace-nowrap">
                                    &lt; 6h (No Day&apos;s Pay)
                                  </span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-bold font-sans whitespace-nowrap">
                                    Day&apos;s Pay
                                  </span>
                                )
                              ) : (
                                <span className="text-slate-300 font-normal">-</span>
                              )
                            ) : !isRowSpecial && !row.isHolidayOverride && hasOt ? (
                              isOther ? (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-bold whitespace-nowrap">
                                  Day&apos;s Pay + ({row.totalFormatted} OT)
                                </span>
                              ) : (
                                <span className="text-indigo-600">{row.totalFormatted || '00:00'}</span>
                              )
                            ) : !isLeave && isOther && row.totalWorkMinutes > 0 && !(isHol && !row.isHolidayOverride) ? (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                                Day&apos;s Pay
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">-</span>
                            )}
                          </td>

                          <td className="py-2 px-1 text-center font-mono tabular-nums text-xs font-bold">
                            {!isLeave && !(isDaysPayOnlyNonWorking && isOther) && (isRowSpecial || row.isHolidayOverride) && hasOt ? (
                              <span className="inline-block px-1 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {row.totalFormatted || '00:00'}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">-</span>
                            )}
                          </td>

                          <td className="py-2 px-1 text-center">
                            {isLeave ? (
                              <span className="text-slate-300">-</span>
                            ) : isDaysPayOnlyNonWorking && isOther ? (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border bg-amber-50 text-amber-800 border-amber-200 text-[9px] font-bold whitespace-nowrap"
                                title="Locked designation: Day's Pay only on non-working days including Saturdays"
                              >
                                <Lock className="w-2.5 h-2.5" />
                                <span>Day&apos;s Pay</span>
                              </span>
                            ) : (
                              <label
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer select-none transition ${
                                  isRowSpecial
                                    ? 'bg-emerald-600 text-white border-emerald-700'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isRowSpecial}
                                  onChange={e => updateRowField(index, 'isSpecialAssignment', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                                />
                                <span>Special</span>
                              </label>
                            )}
                          </td>
                        </>
                      )}

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
        )}

        {/* Timesheet Panel Footer Totals */}
        <div className="px-4 sm:px-5 py-3 bg-white flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Extra Day Row</span>
          </button>

          {isOpClaim ? (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-slate-700 tabular-nums">
              <span>
                Logged Days: <strong className="text-emerald-700">{opSummary.loggedDaysCount}</strong>
              </span>
              <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
              <span>
                Total Worked:{' '}
                <strong className="text-slate-900 font-bold">{opSummary.totalHoursFormatted}</strong>{' '}
                ({opSummary.totalDecimalHours}h)
              </span>
              <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
              <span>
                Amount:{' '}
                <strong className="text-emerald-700 font-bold font-mono">
                  Rs. {opSummary.totalAmountRs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-slate-700 tabular-nums">
              <span>
                Col A: <strong className="text-indigo-600">{summary.colAFormatted}</strong>
              </span>
              <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
              <span>
                Col B: <strong className="text-emerald-700">{summary.colBFormatted}</strong>
              </span>
              <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
              <span>
                Total OT:{' '}
                <strong className="text-slate-900 font-bold">{summary.totalHoursFormatted}</strong>{' '}
                ({summary.totalDecimalHours}h)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Submission & Export Action Bar */}
      <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3.5">
        <div className="min-w-0">
          {isOpClaim ? (
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
              <span className="font-semibold text-slate-900">Out of Pocket Summary:</span>
              <strong className="text-emerald-700 text-sm font-bold">{opSummary.totalHoursFormatted}</strong>
              <span className="text-slate-400">({opSummary.totalDecimalHours}h)</span>
              <span className="text-slate-300">&bull;</span>
              <span className="font-medium text-slate-700">{opSummary.loggedDaysCount} Days</span>
              <span className="text-slate-300">&bull;</span>
              <span className="font-bold text-emerald-700 font-mono">
                Rs. {opSummary.totalAmountRs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          ) : (
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
              <span className="font-semibold text-slate-900">Claimable OT:</span>
              <strong className="text-indigo-600 text-sm font-bold">{summary.totalHoursFormatted}</strong>
              <span className="text-slate-400">({summary.totalDecimalHours}h)</span>
              <span className="text-slate-300">&bull;</span>
              <span className="font-medium text-indigo-700">Col A: {summary.colAFormatted}</span>
              <span className="text-slate-300">&bull;</span>
              <span className="font-medium text-emerald-700">Col B: {summary.colBFormatted}</span>
              <span className="text-slate-300">&bull;</span>
              <span className="font-medium text-slate-700">
                {summary.otDaysCount} OT {summary.otDaysCount === 1 ? 'Day' : 'Days'}
                {summary.daysPayCount > 0 ? ` + ${summary.daysPayCount} Day's Pay` : ''}
              </span>
              {isSpecialAssignedOt && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  Special OT (No Limit)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full md:w-auto shrink-0">
          <button
            type="button"
            onClick={handlePreviewPdf}
            disabled={isGeneratingPdf || isSavingClaim}
            className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Preview print-ready A4 Overtime Sheet"
          >
            <Eye className="w-4 h-4 shrink-0" />
            <span>{isGeneratingPdf ? 'Rendering...' : 'Preview'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveClaim}
            disabled={isGeneratingPdf || isSavingClaim}
            className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Finalize and submit overtime claim"
          >
            {isSavingClaim ? (
              <Loader2 className="w-4 h-4 text-white animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            )}
            <span>
              {isSavingClaim
                ? 'Saving...'
                : initialClaim && initialClaim.status !== 'draft'
                ? 'Update'
                : 'Submit'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleInitiateDownload}
            disabled={isGeneratingPdf || isSavingClaim}
            className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Download official PDF sheet & save claim"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{isGeneratingPdf ? 'Generating...' : 'Download'}</span>
          </button>
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        key={previewPdfUrl || 'preview_modal'}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          if (previewPdfUrl && previewPdfUrl.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(previewPdfUrl);
            } catch {}
          }
          setPreviewPdfUrl(null);
        }}
        pdfUrl={previewPdfUrl}
        filename={previewFilename}
        pdfBlob={previewPdfBlob}
        onSaveClaim={handleSaveClaimFromPreview}
        onDownload={handleDownloadFromPreview}
        isSaved={claimSavedSuccess}
        isSubmitting={isSavingClaim}
        isDownloading={isGeneratingPdf}
        submitLabel={initialClaim && initialClaim.status !== 'draft' ? 'Update Claim' : 'Submit Claim'}
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
        title={
          isOpClaim
            ? (initialClaim ? 'Update Out of Pocket Claim' : 'Submit Out of Pocket Claim')
            : (initialClaim ? 'Update Overtime Claim' : 'Submit Overtime Claim')
        }
        message={
          initialClaim
            ? `Are you sure you want to save updates to claim #${initialClaim.claimNumber}?`
            : `Are you sure you want to finalize and save this ${isOpClaim ? 'out-of-pocket' : 'overtime'} claim for ${claimMonth} ${claimYear}?`
        }
        confirmText={initialClaim ? 'Save Changes' : 'Submit Claim'}
        cancelText="Review Timesheet"
        variant="info"
        isLoading={isSavingClaim}
        details={
          isOpClaim
            ? [
                { label: 'Claimant Name', value: employeeName },
                { label: 'Claim Type', value: 'OP — Monthly Out of Pocket (Form 10610)' },
                { label: 'Claim Period', value: `${claimMonth} ${claimYear}` },
                { label: 'Worked Duration', value: `${opSummary.totalHoursFormatted} (${opSummary.totalDecimalHours}h)` },
                { label: 'Logged Days', value: `${opSummary.loggedDaysCount} Days` },
                {
                  label: 'Total Allowance Amount',
                  value: `Rs. ${opSummary.totalAmountRs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
              ]
            : [
                { label: 'Claimant Name', value: employeeName },
                { label: 'Claim Period', value: `${claimMonth} ${claimYear}` },
                { label: 'Total OT Hours', value: `${summary.totalHoursFormatted} (${summary.totalDecimalHours}h)` },
                { label: 'Claim Days', value: `${summary.otDaysCount} OT Days${summary.daysPayCount > 0 ? ` + ${summary.daysPayCount} Day's Pay` : ''}` },
                {
                  label: 'Total Payment Due',
                  value: `Rs. ${totalOtPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
                ...rows
                  .filter(r => r.isHolidayOverride && (r.startTime || r.endTime || r.totalWorkMinutes > 0))
                  .map(r => ({
                    label: `Holiday Overridden (${r.date})`,
                    value: isDaysPayOnlyNonWorking || (r.totalMinutes || 0) === 0
                      ? "Day's Pay Only (No OT hrs)"
                      : `${r.totalFormatted || '00:00'} OT + Day's Pay`,
                    showCaution: true,
                  })),
              ]
        }
      />

      {/* Confirmation Modal: Step 1 Download Intent */}
      <ConfirmationModal
        isOpen={isConfirmDownloadOpen}
        onClose={() => setIsConfirmDownloadOpen(false)}
        onConfirm={handleConfirmDownloadStep1}
        title={isOpClaim ? 'Generate and Download Out of Pocket Sheet' : 'Generate and Download Overtime Sheet'}
        message={`Are you sure you want to generate and download the official A4 ${isOpClaim ? 'Out of Pocket Sheet (Form 10610)' : 'Overtime Sheet (Form 10756)'} for "${employeeName}" for ${claimMonth} ${claimYear}?`}
        confirmText="Confirm & Download"
        cancelText="Review Timesheet"
        variant="info"
        details={
          isOpClaim
            ? [
                { label: 'Claimant', value: employeeName },
                { label: 'Claim Period', value: `${claimMonth} ${claimYear}` },
                { label: 'Worked Duration', value: `${opSummary.totalHoursFormatted} (${opSummary.totalDecimalHours} hrs)` },
                { label: 'Logged Days', value: `${opSummary.loggedDaysCount} Days` },
              ]
            : [
                { label: 'Claimant', value: employeeName },
                { label: 'Claim Period', value: `${claimMonth} ${claimYear}` },
                { label: 'Total Claimable OT', value: `${summary.totalHoursFormatted} (${summary.totalDecimalHours} hrs)` },
                { label: 'Days with Overtime', value: `${summary.otDaysCount} OT Days${summary.daysPayCount > 0 ? ` + ${summary.daysPayCount} Day's Pay` : ''}` },
                ...rows
                  .filter(r => r.isHolidayOverride && (r.startTime || r.endTime || r.totalWorkMinutes > 0))
                  .map(r => ({
                    label: `Holiday Overridden (${r.date})`,
                    value: isDaysPayOnlyNonWorking || (r.totalMinutes || 0) === 0
                      ? "Day's Pay Only (No OT hrs)"
                      : `${r.totalFormatted || '00:00'} OT + Day's Pay`,
                    showCaution: true,
                  })),
              ]
        }
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
        title={isDaysPayOnlyNonWorking ? "Review Sunday / Holiday Day's Pay" : 'Review Sunday / Holiday Overtime'}
        message={
          isDaysPayOnlyNonWorking
            ? "You have entered work hours on Sunday or a Holiday date. Your locked designation claims Day's Pay only (no OT hours) for these dates—please confirm authorization before continuing."
            : 'You have entered work hours on Sunday or a Holiday date. Please review and confirm that Sunday/Holiday overtime was officially authorized before generating the claim.'
        }
        confirmText="Confirm Authorization & Continue"
        cancelText="Review & Modify Entries"
        variant="warning"
        details={sundayRowsToReview.map(r => ({
          label: `${r.date} (${r.isHoliday ? 'Holiday' : r.dayOfWeek})`,
          value: isDaysPayOnlyNonWorking || (r.totalMinutes || 0) === 0
            ? `Worked: ${r.startTime} – ${r.endTime} (Day's Pay Only${r.reason ? ` • ${r.reason}` : ''})`
            : `Worked: ${r.startTime} – ${r.endTime} (OT: ${r.totalFormatted || '00:00'}${r.reason ? ` • ${r.reason}` : ''})`,
        }))}
      />

      {/* Default Reasons Configuration Modal */}
      {isDefaultReasonsModalOpen && (
        <div className="fixed inset-0 z-[60] modal-backdrop-safe flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg modal-panel-safe bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-amber-500/10 via-slate-50 to-indigo-500/10 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-amber-100 text-amber-800 border border-amber-300">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Default Overtime Reasons
                  </h3>
                  <p className="text-xs text-slate-500">
                    Set default reasons for Weekdays (Mon - Fri), Saturdays, and Holidays.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDefaultReasonsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto text-xs">
              {reasonsSavedSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Default reasons saved successfully and applied!</span>
                </div>
              )}

              {/* 1. Weekday Reason */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    1. Weekdays (Mon - Fri) Default Reason
                  </label>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Regular Days
                  </span>
                </div>
                <input
                  type="text"
                  value={tempWeekdayReason}
                  onChange={e => setTempWeekdayReason(e.target.value)}
                  placeholder="e.g. Regular Overtime"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                {/* Quick suggestions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Suggestions:</span>
                  {[
                    'Regular Overtime',
                    'System Maintenance',
                    'End of Day Processing',
                    'Project Support',
                    'Urgent Operational Support',
                  ].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setTempWeekdayReason(sug)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-semibold border border-slate-200 transition cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                  {tempWeekdayReason && (
                    <button
                      type="button"
                      onClick={() => setTempWeekdayReason('')}
                      className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-[10px] font-semibold border border-rose-200 transition cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Saturday Reason */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    2. Saturdays Default Reason
                  </label>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Saturday Duties
                  </span>
                </div>
                <input
                  type="text"
                  value={tempSaturdayReason}
                  onChange={e => setTempSaturdayReason(e.target.value)}
                  placeholder="e.g. Saturday Duty"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                {/* Quick suggestions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Suggestions:</span>
                  {[
                    'Saturday Duty',
                    "Saturday Duty (Day's Pay)",
                    'Weekend Duty',
                    'Special Assignment',
                  ].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setTempSaturdayReason(sug)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-800 text-slate-600 text-[10px] font-semibold border border-slate-200 transition cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Other Holidays & Sundays Reason */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    3. Other Holidays &amp; Sundays Default Reason
                  </label>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Sundays &amp; Holidays
                  </span>
                </div>
                <input
                  type="text"
                  value={tempHolidayReason}
                  onChange={e => setTempHolidayReason(e.target.value)}
                  placeholder="Leave blank to use official Holiday name (e.g., Deepavali, Sunday)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-500">
                  Tip: When blank, the official holiday name (e.g., "Full Moon Poya Day", "May Day") or "Sunday" will be automatically populated.
                </p>
                {/* Quick suggestions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Suggestions:</span>
                  <button
                    type="button"
                    onClick={() => setTempHolidayReason('')}
                    className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold border border-indigo-200 transition cursor-pointer"
                  >
                    ★ Use Official Holiday Name
                  </button>
                  {[
                    'Holiday Duty',
                    'Public Holiday Duty',
                    'Mercantile Holiday Coverage',
                    'Emergency Roster',
                  ].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setTempHolidayReason(sug)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-semibold border border-slate-200 transition cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveAndApplyDefaultReasons('empty')}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer shadow-3xs"
                  title="Apply default reasons only to rows that have no reason"
                >
                  Apply to Empty Rows
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAndApplyDefaultReasons('all')}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs transition cursor-pointer shadow-3xs"
                  title="Overwrite reasons across all rows based on day type"
                >
                  Apply to All Rows
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDefaultReasonsModalOpen(false)}
                  className="px-3 py-2 text-slate-600 hover:text-slate-900 font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAndApplyDefaultReasons('empty')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Defaults</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
